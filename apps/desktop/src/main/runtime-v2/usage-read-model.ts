import type { UsageQueryProgress, SessionListPage, SessionListPageInput, UsageActivitySnapshot, UsageStatisticsGetInput, UsageStatisticsSnapshot } from "@actspace/shared";
import { Worker } from "node:worker_threads";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RuntimeV2GlobalSessionSummary } from "@actspace/shared/runtime-v2";

type QuerySource = import("@actspace/session-storage").SessionQuerySource;
type Summary = Omit<RuntimeV2GlobalSessionSummary, "usage"> & { querySource?: QuerySource };
type Reader = {
  sessionQuerySources?(): Promise<import("@actspace/session-storage").SessionQueryCatalog | null>;
  globalSessionSummaries(): Promise<readonly RuntimeV2GlobalSessionSummary[]>;
  readSessionEventBatch?(id: string, input: { cursor?: string; throughSeq: number }): Promise<{ events: readonly import("@actspace/session-journal").SessionEventEnvelopeV1[]; cursor: string; done: boolean }>;
  inspectSession(id: string): Promise<import("@actspace/shared/runtime-v2").RuntimeV2SessionSnapshot>;
  inspectSessionEvents(id: string): Promise<readonly import("@actspace/session-journal").SessionEventEnvelopeV1[]>;
};

type CatalogRow = {
  sessionId: string;
  title: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
  workspaceRoot: string | null;
  worktree?: unknown;
  pinned: boolean;
  archived: boolean;
  accessState: string;
  isChildSession: boolean;
  agentRunCount: number;
  agentForm?: string;
  agentMode?: string;
  agentModeRevision?: number;
  querySource?: QuerySource;
};
type SourceState = { revision: number | null; cursor?: string; stamp?: string; codecSetDigest?: string };
type WorkerResult = UsageActivitySnapshot | UsageStatisticsSnapshot | SessionListPage | SourceState | null;
type WorkerReply = { id: string; heartbeat: true } | { id: string; ok: true; result?: WorkerResult } | { id: string; ok: false; error: string };
type Pending = { timer: ReturnType<typeof setTimeout>; resolve: (result: WorkerResult) => void; reject: (error: Error) => void };

class SessionSourceReadError extends Error {}
class WorkerTimeoutError extends Error {}

/**
 * Owns the disposable SQLite read model. The selected provider supplies bounded
 * batches; physical parsing and Usage projection run off the Main event loop.
 */
export class UsageReadModelService {
  readonly #indexed = new Map<string, string>();
  readonly #pending = new Map<string, Pending>();
  readonly #reader: Reader;
  readonly #dataRoot: string;
  #worker: Worker | undefined;
  #workerStart: Promise<Worker> | undefined;
  #workerStopping: Promise<unknown> | undefined;
  #summaries: readonly Summary[] | undefined;
  #catalogFingerprints: Map<string, string> | undefined;
  #disposed = false;
  #operations: Promise<unknown> = Promise.resolve();
  #requests = new Map<string, UsageQueryProgress>();
  #currentRequest?: string;
  #queued = 0;
  #syncTotal: number | undefined;
  #lightweightSources = false;
  #failedSessionIds = new Set<string>();

  constructor(reader: Reader, dataRoot: string) {
    this.#reader = reader;
    this.#dataRoot = dataRoot;
  }

  invalidate(): void {
    // Revisions are checked at query time; live events do not trigger indexing.
  }

  getActivity(input: UsageStatisticsGetInput): Promise<UsageActivitySnapshot | null> {
    return this.#runQuery("activity", input) as Promise<UsageActivitySnapshot | null>;
  }

  getStatistics(input: UsageStatisticsGetInput): Promise<UsageStatisticsSnapshot | null> {
    return this.#runQuery("statistics", input) as Promise<UsageStatisticsSnapshot | null>;
  }

  getStatus(requestId: string): UsageQueryProgress | null { return this.#requests.get(requestId) ?? null; }
  cancel(requestId: string): void {
    const status = this.#requests.get(requestId);
    if (status) {
      const runningSql = this.#currentRequest === requestId;
      status.phase = "cancelled";
      if (runningSql) this.#onWorkerError(new Error("Usage query cancelled."));
    }
  }
  #progress(phase?: UsageQueryProgress["phase"], events = 0, completed = 0): void {
    const status = this.#currentRequest ? this.#requests.get(this.#currentRequest) : undefined;
    if (status?.phase === "cancelled" || this.#disposed) throw new Error("Usage query cancelled.");
    if (!status) return;
    if (phase) status.phase = phase;
    status.eventsRead += events;
    status.completedSessions += completed;
    status.totalSessions = this.#syncTotal ?? this.#summaries?.length ?? 0;
  }
  #runQuery(kind: "activity" | "statistics", input: UsageStatisticsGetInput): Promise<WorkerResult> {
    if (this.#requests.size >= 8) return Promise.reject(new Error("Usage query queue is full; retry shortly."));
    const requestId = input.requestId ?? randomUUID();
    if (this.#requests.has(requestId)) return Promise.reject(new Error("Duplicate Usage request id."));
    this.#requests.set(requestId, { requestId, phase: "queued", completedSessions: 0, totalSessions: 0, eventsRead: 0 });
    return this.#serialize(async () => {
      this.#currentRequest = requestId;
      try {
        this.#progress("checking"); const result = await this.#query({ kind, input }); this.#progress();
        if (result && "sourceCount" in result && this.#failedSessionIds.size) result.readModel = { ...(result.readModel ?? { source: "sqlite", status: "ready" }), failedSources: this.#failedSessionIds.size };
        return result;
      }
      finally { this.#currentRequest = undefined; this.#syncTotal = undefined; }
    }).finally(() => this.#requests.delete(requestId));
  }

  getSessionPage(input: SessionListPageInput): Promise<SessionListPage> {
    return this.#serialize(async () => {
      this.#summaries = await this.#readSummaries();
      try {
        if (this.#lightweightSources) await this.#syncChanged(undefined, true);
        else await this.#syncCatalog();
        return this.#sessionResult(await this.#send({ type: "query", request: "sessions", input }) as SessionListPage);
      } catch (error) {
        if (error instanceof WorkerTimeoutError) throw error;
        if (this.#disposed || (error instanceof Error && /^Usage (?:(result|search) exceeds|cursor invalid)/.test(error.message))) throw error;
        await this.#restartWorker();
        try {
          await this.#resetDerivedDatabase();
          if (this.#lightweightSources) await this.#syncChanged(undefined, true);
          else await this.#syncCatalog();
          return this.#sessionResult(await this.#send({ type: "query", request: "sessions", input }) as SessionListPage);
        } catch (reason) {
          if (this.#disposed) throw reason;
          await this.#send({ type: "abort-sync" }).catch(() => undefined);
          return this.#sessionResult(await this.#fallbackSessionPage(input, reason));
        }
      }
    });
  }

  #sessionResult(page: SessionListPage): SessionListPage {
    return { ...page, failed: page.failed + this.#failedSessionIds.size };
  }

  async #fallbackSessionPage(input: SessionListPageInput, reason: unknown): Promise<SessionListPage> {
    const summaries = this.#summaries ?? [];
    if (summaries.length > 1_000 || summaries.reduce((count, row) => count + row.throughJournalSeq + 1, 0) > 5_000) throw new Error("History Session fallback exceeds 1,000 sessions or 5,000 events. Retry rebuilding the index.");
    const read = this.#reader.readSessionEventBatch?.bind(this.#reader);
    if (this.#lightweightSources && !read) throw new Error("Session provider does not support bounded fallback reads.");
    await this.#send({ type: "catalog-fallback-begin" });
    try {
      for (const summary of summaries) {
        const row = toCatalogRow(summary);
        if (!summary.querySource) {
          await this.#send({ type: "catalog-fallback-append", row, events: [], first: true });
          continue;
        }
        let cursor: string | undefined;
        let first = true;
        for (;;) {
          const batch = await read!(summary.sessionId, { throughSeq: summary.throughJournalSeq, ...(cursor ? { cursor } : {}) });
          if (!batch.done && cursor === batch.cursor) throw new Error("History Session fallback made no progress.");
          await this.#send({ type: "catalog-fallback-append", row, events: batch.events, first });
          cursor = batch.cursor; first = false;
          if (batch.done) break;
        }
      }
      const result = await this.#send({ type: "catalog-fallback-query", input }) as SessionListPage;
      result.readModel = { source: "session", status: "fallback", reason: reason instanceof Error ? reason.message : String(reason) };
      return result;
    } finally { await this.#send({ type: "catalog-fallback-end" }).catch(() => undefined); }
  }

  #serialize<T>(operation: () => Promise<T>): Promise<T> {
    if (this.#queued >= 8) return Promise.reject(new Error("Usage query queue is full; retry shortly."));
    this.#queued++;
    const task = this.#operations.then(() => {
      if (this.#disposed) throw new Error("Usage read model disposed.");
      return operation();
    }).finally(() => { this.#queued--; });
    this.#operations = task.catch(() => undefined);
    return task;
  }

  async dispose(): Promise<void> {
    this.#disposed = true;
    for (const pending of this.#pending.values()) { clearTimeout(pending.timer); pending.reject(new Error("Usage read model disposed.")); }
    this.#pending.clear();
    await this.#worker?.terminate();
    await this.#workerStopping;
    this.#worker = undefined;
  }

  async #query(message: { kind: "activity" | "statistics"; input: UsageStatisticsGetInput }): Promise<WorkerResult> {
    this.#summaries = await this.#readSummaries();
    if (this.#reader.sessionQuerySources && !this.#lightweightSources) throw new Error("Session provider does not support bounded Usage queries. Session history and details remain available.");
    const resetAt = await this.#usageResetAt();
    const sessionId = (message.input.scope ?? (message.input.sessionId ? "session" : "global")) === "session" ? message.input.sessionId ?? "" : undefined;
    if (sessionId !== undefined && this.#failedSessionIds.has(sessionId)) throw new Error("Requested Session is unreadable.");
    try {
      await this.#syncChanged(resetAt, false, sessionId);
      this.#progress("querying");
      return await this.#send({ type: "query", request: message.kind, input: message.input });
    } catch (firstError) {
      if (firstError instanceof SessionSourceReadError || firstError instanceof WorkerTimeoutError) throw firstError;
      if (this.#disposed || (firstError instanceof Error && /^Usage (?:(result|search) exceeds|cursor invalid)/.test(firstError.message))) throw firstError;
      if (this.#currentRequest && this.#requests.get(this.#currentRequest)?.phase === "cancelled") { await this.#send({ type: "abort-sync" }).catch(() => undefined); throw firstError; }
      this.#progress("rebuilding");
      await this.#restartWorker();
      try {
        await this.#resetDerivedDatabase();
        await this.#syncChanged(resetAt, false, sessionId);
        this.#progress("querying");
        return await this.#send({ type: "query", request: message.kind, input: message.input });
      } catch (error) {
        await this.#send({ type: "abort-sync" }).catch(() => undefined);
        this.#progress("fallback");
        return this.#fallback(message, resetAt, error);

      }
    }
  }

  async #fallback(message: { kind: "activity" | "statistics"; input: UsageStatisticsGetInput }, resetAt: string | undefined, reason: unknown): Promise<WorkerResult> {
    const summaries = (this.#summaries ?? []).filter(row => message.input.scope === "session" || (message.input.scope === undefined && message.input.sessionId) ? row.sessionId === message.input.sessionId : true);
    if (summaries.length > 1_000) throw new Error("Usage index unavailable; Session fallback exceeds 1,000 sessions. Retry rebuilding the index.");
    if (summaries.reduce((count, row) => count + row.throughJournalSeq + 1, 0) > 5_000) throw new Error("Usage index unavailable; Session fallback exceeds 5,000 events. Retry rebuilding the index.");
    const read = this.#reader.readSessionEventBatch?.bind(this.#reader);
    if (!read) throw new Error("Session provider does not support bounded fallback reads.");
    await this.#send({ type: "fallback-begin" });
    try {
      for (const summary of summaries) {
        let cursor: string | undefined;
        for (;;) {
          this.#progress();
          const batch = await read(summary.sessionId, { throughSeq: summary.throughJournalSeq, ...(cursor ? { cursor } : {}) });
          if (!batch.done && cursor === batch.cursor) throw new Error("Session fallback made no progress.");
          await this.#send({ type: "fallback-append", source: { sessionId: summary.sessionId, title: summary.title, workspaceRoot: summary.workspaceRoot, throughJournalSeq: summary.throughJournalSeq }, events: batch.events });
          cursor = batch.cursor;
          if (batch.done) break;
        }
      }
      this.#progress("querying");
      const result = await this.#send({ type: "fallback-query", request: message.kind, input: message.input, resetAt }) as UsageActivitySnapshot | UsageStatisticsSnapshot | null;
      if (result) result.readModel = { source: "session", status: "fallback", reason: reason instanceof Error ? reason.message : String(reason) };
      return result;
    } finally { await this.#send({ type: "fallback-end" }).catch(() => undefined); }
  }

  async #readSummaries(): Promise<readonly Summary[]> {
    const catalog = await this.#reader.sessionQuerySources?.();
    this.#lightweightSources = catalog != null;
    this.#failedSessionIds = new Set(catalog?.failedSessionIds ?? []);
    if (!catalog) return this.#reader.globalSessionSummaries();
    return catalog.sources.map(querySource => {
      const h = querySource.header;
      return { sessionId: h.sessionId, throughJournalSeq: querySource.throughSeq, summaryVersion: 2,
        createdAt: h.createdAt, updatedAt: h.createdAt, workspaceRoot: h.cwd ?? null, worktree: h.worktree,
        profileId: h.createdWith.profileId, agentForm: h.createdWith.presetId === "actspace.chat" ? "chat" : "agent",
        agentFormId: "actspace.main", agentMode: h.createdWith.initialAgentMode ?? (h.createdWith.presetId === "actspace.chat" ? "chat" : "agent"), agentModeRevision: 0,
        title: null, pinned: false, archived: false, completedTurnCount: 0, accessState: "browse-only", lineage: h.lineage, querySource };
    });
  }

  async #usageResetAt(): Promise<string | undefined> {
    const path = join(this.#dataRoot, "global-usage-reset.json");
    try {
      const value = JSON.parse(await readFile(path, "utf8")) as { version?: number; resetAt?: string };
      return value.version === 1 && typeof value.resetAt === "string" ? value.resetAt : undefined;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") return undefined;
      const resetAt = new Date().toISOString();
      await mkdir(this.#dataRoot, { recursive: true });
      try { await writeFile(path, JSON.stringify({ version: 1, resetAt }), { flag: "wx", mode: 0o600 }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") return this.#usageResetAt(); throw error; }
      return resetAt;
    }
  }

  async #syncCatalog(): Promise<void> {
    const summaries = this.#summaries ?? [];
    const previous = this.#catalogFingerprints;
    const fingerprints = new Map(summaries.map(summary => [summary.sessionId, fingerprintCatalog(summary)]));
    const changed = summaries.filter(summary => previous?.get(summary.sessionId) !== fingerprints.get(summary.sessionId));
    for (let offset = 0; offset < changed.length; offset += 256) {
      this.#progress();
      await this.#send({ type: "sync", sources: [], catalog: changed.slice(offset, offset + 256).map(toCatalogRow) });
    }
    // One changed Session must not rewrite the entire catalog or rescan it for
    // deletions. A fresh Worker still reconciles all persisted identities once.
    if (!previous || [...previous.keys()].some(id => !fingerprints.has(id))) {
      await this.#send({ type: "sync", sources: [], activeSessionIds: summaries.map(summary => summary.sessionId) });
      for (const id of this.#indexed.keys()) if (!fingerprints.has(id.slice(id.indexOf(":") + 1))) this.#indexed.delete(id);
    }
    this.#catalogFingerprints = fingerprints;
  }

  async #syncChanged(resetAt?: string, catalogOnly = false, sessionId?: string): Promise<void> {
    await this.#syncCatalog();
    const providerRead = this.#reader.readSessionEventBatch?.bind(this.#reader);
    if (!providerRead) throw new Error("Session provider does not support bounded Usage reads.");
    const read: NonNullable<Reader["readSessionEventBatch"]> = async (id, input) => {
      try { return await providerRead(id, input); }
      catch (error) { throw new SessionSourceReadError(error instanceof Error ? error.message : String(error)); }
    };
    const sources = (this.#summaries ?? []).filter(source => sessionId === undefined || source.sessionId === sessionId);
    this.#syncTotal = sources.length;
    for (const summary of sources) {
      this.#progress();
      const cacheId = `${catalogOnly ? "catalog" : "usage"}:${summary.sessionId}`;
      const key = `${summary.throughJournalSeq}:${summary.querySource?.stamp ?? ""}:${summary.querySource?.codecSetDigest ?? ""}`;
      if (this.#indexed.get(cacheId) === key) { this.#progress(undefined, 0, 1); continue; }
      const state = await this.#send({ type: "source-state", sessionId: summary.sessionId, catalogOnly }) as SourceState;
      const digest = summary.querySource?.codecSetDigest;
      // Existing v8 indexes stored the Runtime digest as the last stamp field.
      // Keep that read-only compatibility check; new writes persist it separately.
      const codecChanged = digest !== undefined && (state.codecSetDigest !== undefined ? state.codecSetDigest !== digest : !state.stamp?.endsWith(`:${digest}`));
      if (!codecChanged && state.revision === summary.throughJournalSeq && state.cursor && (!summary.querySource || state.stamp === summary.querySource.stamp)) { this.#indexed.set(cacheId, key); this.#progress(undefined, 0, 1); continue; }
      const source = { sessionId: summary.sessionId, title: summary.title, workspaceRoot: summary.workspaceRoot, throughJournalSeq: summary.throughJournalSeq, querySource: summary.querySource };
      let reset = codecChanged || !state.cursor || state.revision === null || state.revision > summary.throughJournalSeq || (state.revision === summary.throughJournalSeq && !!summary.querySource && state.stamp !== summary.querySource.stamp);
      let cursor = reset ? undefined : state.cursor;
      // An invalidated cursor rebuilds just this Session. Partial work stays in
      // one transaction, including projection state, FTS and the final watermark.
      for (let attempt = 0; attempt < 2; attempt++) {
        let first = true;
        type Batch = Awaited<ReturnType<typeof read>>;
        let next: Promise<{ batch: Batch } | { error: unknown }> | undefined;
        try {
          let batch = await read(summary.sessionId, { throughSeq: summary.throughJournalSeq, ...(cursor ? { cursor } : {}) });
          while (true) {
            this.#progress("syncing");
            if (!batch.done && batch.cursor === cursor) throw new Error("Session provider made no query progress.");
            // One bounded lookahead overlaps provider parsing with SQL projection.
            // Capture rejection immediately; failures still roll back the Session.
            next = batch.done ? undefined : read(summary.sessionId, { throughSeq: summary.throughJournalSeq, cursor: batch.cursor }).then(batch => ({ batch }), error => ({ error }));
            await this.#send({ type: "journal", source, events: batch.events, cursor: batch.cursor, first, final: batch.done, reset, resetAt, catalogOnly });
            this.#progress(undefined, batch.events.length);
            first = false; cursor = batch.cursor;
            if (batch.done) break;
            const prefetched = await next!;
            if ("error" in prefetched) throw prefetched.error;
            batch = prefetched.batch;
          }
          this.#indexed.set(cacheId, key);
          this.#progress(undefined, 0, 1);
          break;
        } catch (error) {
          await this.#send({ type: "abort-sync" }).catch(() => undefined);
          if (attempt > 0 || (reset && !(error instanceof SessionSourceReadError))) {
            if (!(error instanceof SessionSourceReadError)) throw error;
            this.#failedSessionIds.add(summary.sessionId);
            this.#indexed.delete(`usage:${summary.sessionId}`);
            this.#indexed.delete(`catalog:${summary.sessionId}`);
            this.#catalogFingerprints?.delete(summary.sessionId);
            // Quarantine only this derived projection; never delete Session files.
            // Failure remains explicit in the response and is retried next query.
            await this.#send({ type: "sync", sources: [], activeSessionIds: (this.#summaries ?? []).filter(item => !this.#failedSessionIds.has(item.sessionId)).map(item => item.sessionId) });
            if (sessionId !== undefined) throw error;
            break;
          }
          reset = true; cursor = undefined;
        } finally { await next; }
      }
    }
  }

  async #send(message: Record<string, unknown>): Promise<WorkerResult> {
    const worker = await this.#getWorker();
    const id = randomUUID();
    return new Promise<WorkerResult>((resolve, reject) => {
      const timer = setTimeout(() => this.#onWorkerError(new WorkerTimeoutError("Usage Worker timed out; retry after the current operation stops.")), 60_000);
      this.#pending.set(id, { resolve, reject, timer });
      try { worker.postMessage({ ...message, id }); }
      catch (error) { clearTimeout(timer); this.#pending.delete(id); reject(error); }
    });
  }

  async #getWorker(): Promise<Worker> {
    if (this.#worker) return this.#worker;
    if (this.#workerStart) return this.#workerStart;
    this.#workerStart = Promise.resolve().then(async () => {
      // Native synchronous SQL can outlive terminate() being requested. Wait
      // for its actual exit before another Worker can acquire the owner lease.
      await this.#workerStopping;
      if (this.#disposed) throw new Error("Usage read model disposed.");
      const worker = new Worker(join(__dirname, "usage-read-model-worker.js"), { workerData: { dataRoot: this.#dataRoot } });
      worker.on("message", (reply: WorkerReply) => this.#onReply(reply));
      worker.on("error", error => { if (this.#worker === worker) this.#onWorkerError(error); });
      worker.on("exit", code => { if (this.#worker === worker) this.#onWorkerError(new Error(`Usage read model worker exited with code ${code}.`)); });
      this.#worker = worker;
      return worker;
    }).finally(() => { this.#workerStart = undefined; });
    return this.#workerStart;
  }

  #onReply(reply: WorkerReply): void {
    const pending = this.#pending.get(reply.id);
    if (!pending) return;
    if ("heartbeat" in reply) { pending.timer.refresh(); return; }
    this.#pending.delete(reply.id);
    clearTimeout(pending.timer);
    if (reply.ok === true) pending.resolve(reply.result ?? null);
    else pending.reject(new Error(reply.error));
  }

  #onWorkerError(error: Error): void {
    const worker = this.#worker;
    this.#worker = undefined;
    this.#indexed.clear();
    this.#catalogFingerprints = undefined;
    for (const pending of this.#pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.#pending.clear();
    if (worker) this.#workerStopping = worker.terminate().catch(() => undefined);
  }

  async #restartWorker(): Promise<void> {
    const worker = this.#worker;
    this.#worker = undefined;
    this.#indexed.clear();
    this.#catalogFingerprints = undefined;
    if (worker) await worker.terminate().catch(() => undefined);
    await this.#workerStopping;
  }

  async #resetDerivedDatabase(): Promise<void> {
    await this.#send({ type: "reset-database" });
    this.#indexed.clear();
  }
}

function fingerprintCatalog(summary: Summary): string {
  return JSON.stringify([summary.sessionId, summary.throughJournalSeq, summary.title, summary.createdAt, summary.updatedAt, summary.workspaceRoot, summary.worktree, summary.pinned, summary.archived, summary.completedTurnCount, summary.accessState, summary.agentForm, summary.agentMode, summary.agentModeRevision, summary.lineage, summary.querySource?.stamp]);
}

function toCatalogRow(summary: Summary): CatalogRow {
  return { sessionId: summary.sessionId, title: summary.title, revision: summary.throughJournalSeq, createdAt: summary.createdAt, updatedAt: summary.updatedAt, workspaceRoot: summary.workspaceRoot, ...(summary.worktree ? { worktree: summary.worktree } : {}), pinned: summary.pinned, archived: summary.archived, accessState: summary.accessState, isChildSession: summary.lineage !== null, agentRunCount: summary.completedTurnCount, agentForm: summary.agentForm, agentMode: summary.agentMode, agentModeRevision: summary.agentModeRevision, querySource: summary.querySource };
}
