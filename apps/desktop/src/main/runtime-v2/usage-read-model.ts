import type { ContextHistoryResult } from "./context-history-query";
import { isDelegatedSession, sideChatParentId } from "@actspace/shared/session-list-page";
import type { ContextHistoryState } from "./context-history-projection";
import { AsyncLocalStorage } from "node:async_hooks";
import { ReadModelScheduler } from "./read-model-scheduler";
import type { UsageQueryProgress, SessionListPage, SessionListPageInput, UsageActivitySnapshot, UsageStatisticsGetInput, UsageStatisticsSnapshot } from "@actspace/shared";
import { Worker } from "node:worker_threads";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { RuntimeV2GlobalSessionSummary } from "@actspace/shared/runtime-v2";

type QuerySource = import("@actspace/session-storage").SessionQuerySource;
type Summary = Omit<RuntimeV2GlobalSessionSummary, "usage"> & { querySource?: QuerySource };
type Reader = {
  sessionQuerySource?(sessionId: string): Promise<QuerySource | null>;
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
  sideChatParentId?: string;
  agentRunCount: number;
  agentForm?: string;
  agentMode?: string;
  agentModeRevision?: number;
  querySource?: QuerySource;
};
type QueryScope = { requestId?: string; foreground: boolean; summaries?: readonly Summary[]; syncTotal?: number; lightweightSources: boolean; partialInventory: boolean; failedSessionIds: Set<string>; cancelled?: boolean };
type SourceState = { building?: boolean; revision: number | null; cursor?: string; stamp?: string; codecSetDigest?: string };
type WorkerResult = ContextHistoryResult | ContextHistoryState | UsageActivitySnapshot | UsageStatisticsSnapshot | SessionListPage | SourceState | null;
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
  #catalogFingerprints: Map<string, string> | undefined;
  #disposed = false;
  #requests = new Map<string, UsageQueryProgress>();
  #queued = 0;
  #scope = new AsyncLocalStorage<QueryScope>();
  #scheduler = new ReadModelScheduler();
  #catalogLock: Promise<unknown> = Promise.resolve();
  #fallbackLock: Promise<void> = Promise.resolve();
  #syncJobs = new Map<string, { key: string; waiters: Set<QueryScope>; task: Promise<void> }>();
  #initializing?: Promise<void>;
  #activeSqlRequest?: string;
  #contextHistory = new Map<string, { key: string; result: ContextHistoryResult | null; fallback?: boolean; indexedThroughSeq?: number; error?: string; task?: Promise<void>; consumers: Map<string, number> }>();
  get #currentRequest() { return this.#scope.getStore()?.requestId; }
  set #currentRequest(value: string | undefined) { this.#scope.getStore()!.requestId = value; }
  get #summaries() { return this.#scope.getStore()!.summaries; }
  set #summaries(value: readonly Summary[] | undefined) { this.#scope.getStore()!.summaries = value; }
  get #syncTotal() { return this.#scope.getStore()!.syncTotal; }
  set #syncTotal(value: number | undefined) { this.#scope.getStore()!.syncTotal = value; }
  get #lightweightSources() { return this.#scope.getStore()!.lightweightSources; }
  set #lightweightSources(value: boolean) { this.#scope.getStore()!.lightweightSources = value; }
  get #partialInventory() { return this.#scope.getStore()!.partialInventory; }
  set #partialInventory(value: boolean) { this.#scope.getStore()!.partialInventory = value; }
  get #failedSessionIds() { return this.#scope.getStore()!.failedSessionIds; }
  set #failedSessionIds(value: Set<string>) { this.#scope.getStore()!.failedSessionIds = value; }

  constructor(reader: Reader, dataRoot: string) {
    this.#reader = reader;
    this.#dataRoot = dataRoot;
  }

  releaseContext(sessionId: string, consumerId: string): void { this.#contextHistory.get(sessionId)?.consumers.delete(consumerId); }
  contextHistory(source: QuerySource, consumerId: string, retry = false) {
    const id = source.header.sessionId;
    const key = `${source.throughSeq}:${source.stamp}:${source.codecSetDigest ?? ""}`;
    let entry = this.#contextHistory.get(id);
    if (!entry) {
      if (this.#contextHistory.size >= 16) {
        const idle = [...this.#contextHistory].find(([, item]) => !item.task && ![...item.consumers.values()].some(until => until > Date.now()));
        if (idle) this.#contextHistory.delete(idle[0]); else throw new Error("Context query budget exceeded.");
      }
      entry = { key: "", result: null, consumers: new Map() }; this.#contextHistory.set(id, entry);
    }
    for (const [consumer, until] of entry.consumers) if (until <= Date.now()) entry.consumers.delete(consumer);
    entry.consumers.set(consumerId, Date.now() + 20_000);
    if (!entry.task && (entry.key !== key || (retry && entry.error))) {
      entry.key = key; entry.error = undefined; entry.fallback = false;
      const item = entry;
      item.task = this.#serialize(async () => {
        const demand = () => { if (this.#disposed || ![...item.consumers.values()].some(until => until > Date.now())) throw new Error("Context query paused."); };
        demand();
        item.result = await this.#send({ type: "context-query", sessionId: id }) as ContextHistoryResult | null;
        let state = await this.#send({ type: "context-source-state", source }) as ContextHistoryState | null;
        item.indexedThroughSeq = state?.revision ?? -1;
        if (state && !state.building && state.revision === source.throughSeq && state.stamp === source.stamp && state.codec === (source.codecSetDigest ?? "")) return;
        let reset = !state?.cursor || state.projector_version !== 1 || state.revision > source.throughSeq || state.codec !== (source.codecSetDigest ?? "") || (state.revision === source.throughSeq && state.stamp !== source.stamp);
        for (let attempt = 0; attempt < 2; attempt++) {
          let cursor = reset ? undefined : state?.cursor ?? undefined; let first = true;
          try {
            for (;;) {
              demand();
              if (!this.#reader.readSessionEventBatch) throw new Error("Session provider does not support bounded Context reads.");
              const batch = await this.#reader.readSessionEventBatch(id, { throughSeq: source.throughSeq, ...(cursor ? { cursor } : {}) });
              if (!batch.done && batch.cursor === cursor) throw new Error("Context query made no progress.");
              demand();
              await this.#send({ type: "context-journal", source, events: batch.events, cursor: batch.cursor, first, final: batch.done, reset });
              cursor = batch.cursor; first = false;
              item.indexedThroughSeq = batch.done ? source.throughSeq : batch.events.at(-1)?.seq ?? item.indexedThroughSeq;
              if (batch.done) break;
            }
            item.result = await this.#send({ type: "context-query", sessionId: id }) as ContextHistoryResult | null;
            break;
          } catch (error) {
            if (attempt || reset || !(error instanceof Error) || !/cursor.*invalid|invalidated/i.test(error.message)) throw error;
            reset = true; state = null;
          }
        }
      }, true).catch(async error => {
        if (error instanceof Error && /paused/.test(error.message)) { item.key = ""; return; }
        item.error = "历史索引暂不可用，请重试。";
        if (this.#disposed || error instanceof WorkerTimeoutError || source.throughSeq >= 5000 || !this.#reader.readSessionEventBatch) return;
        try {
          const events: import("@actspace/session-journal").SessionEventEnvelopeV1[] = [];
          let cursor: string | undefined, bytes = 0;
          for (;;) {
            if (![...item.consumers.values()].some(until => until > Date.now())) return;
            const batch = await this.#reader.readSessionEventBatch(id, { throughSeq: source.throughSeq, ...(cursor ? { cursor } : {}) });
            bytes += Buffer.byteLength(JSON.stringify(batch.events));
            if (bytes > 8 * 1024 * 1024 || events.length + batch.events.length > 5000) return;
            events.push(...batch.events);
            if (batch.done) break;
            if (cursor === batch.cursor) return;
            cursor = batch.cursor;
          }
          item.result = await this.#send({ type: "context-fallback", source, events }) as ContextHistoryResult | null;
          item.fallback = true;
        } catch { /* Keep the visible index error; never expand the fallback budget. */ }
      }).finally(() => { item.task = undefined; });
    }
    return { result: entry.result, syncing: !!entry.task, error: entry.error, fallback: entry.fallback, indexedThroughSeq: entry.indexedThroughSeq };
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
      const runningSql = this.#activeSqlRequest === requestId && this.#queued === 1 && this.#syncJobs.size === 0;
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
    }, input.scope === "session" || !!input.sessionId).finally(() => this.#requests.delete(requestId));
  }

  getSessionPage(input: SessionListPageInput): Promise<SessionListPage> {
    return this.#serialize(async () => {
      this.#summaries = await this.#readSummaries();
      try {
        if (this.#lightweightSources) await this.#syncChanged(true);
        else await this.#syncCatalog();
        return this.#sessionResult(await this.#send({ type: "query", request: "sessions", input }) as SessionListPage);
      } catch (error) {
        if (error instanceof WorkerTimeoutError) throw error;
        if (this.#disposed || (error instanceof Error && /^Usage (?:(result|search) exceeds|cursor invalid)/.test(error.message))) throw error;
        try {
          if (error instanceof Error && /schema|malformed|not a database/i.test(error.message)) { await this.#resetDerivedDatabase(); }
          if (this.#lightweightSources) await this.#syncChanged(true);
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

  #fallbackSessionPage(input: SessionListPageInput, reason: unknown): Promise<SessionListPage> {
    return this.#withFallback(() => this.#fallbackSessionPageLocked(input, reason));
  }
  async #withFallback<T>(operation: () => Promise<T>): Promise<T> {
    const prior = this.#fallbackLock; let release!: () => void;
    this.#fallbackLock = new Promise<void>(resolve => { release = resolve; });
    await prior;
    try { this.#progress(); return await operation(); } finally { release(); }
  }
  async #fallbackSessionPageLocked(input: SessionListPageInput, reason: unknown): Promise<SessionListPage> {
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

  #serialize<T>(operation: () => Promise<T>, foreground = false): Promise<T> {
    if (this.#queued >= 8) return Promise.reject(new Error("Usage query queue is full; retry shortly."));
    this.#queued++;
    const scope: QueryScope = { foreground, lightweightSources: false, partialInventory: false, failedSessionIds: new Set() };
    return this.#scope.run(scope, async () => {
      if (this.#disposed) throw new Error("Usage read model disposed.");
      try { await this.#ensureDatabase().catch(error => { if (error instanceof WorkerTimeoutError || this.#disposed) throw error; }); return await operation(); }
      finally { scope.cancelled = true; }
    }).finally(() => { this.#queued--; });
  }

  #ensureDatabase(): Promise<void> {
    if (!this.#initializing) this.#initializing = (async () => {
      try { await this.#send({ type: "source-state", sessionId: "" }); }
      catch (error) {
        if (!(error instanceof Error) || !/schema|malformed|not a database|file is not a database/i.test(error.message)) throw error;
        await this.#resetDerivedDatabase();
        await this.#send({ type: "source-state", sessionId: "" });
      }
    })().catch(error => { this.#initializing = undefined; throw error; });
    return this.#initializing;
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
    const sessionId = (message.input.scope ?? (message.input.sessionId ? "session" : "global")) === "session" ? message.input.sessionId ?? "" : undefined;
    this.#summaries = await this.#readSummaries(sessionId);
    if (this.#reader.sessionQuerySources && !this.#lightweightSources) throw new Error("Session provider does not support bounded Usage queries. Session history and details remain available.");
    if (sessionId !== undefined && this.#failedSessionIds.has(sessionId)) throw new Error("Requested Session is unreadable.");
    try {
      await this.#syncChanged(false, sessionId);
      this.#progress("querying");
      return await this.#send({ type: "query", request: message.kind, input: message.input });
    } catch (firstError) {
      if (firstError instanceof SessionSourceReadError || firstError instanceof WorkerTimeoutError) throw firstError;
      if (this.#disposed || (firstError instanceof Error && /^Usage (?:(result|search) exceeds|cursor invalid)/.test(firstError.message))) throw firstError;
      if (this.#currentRequest && this.#requests.get(this.#currentRequest)?.phase === "cancelled") { await this.#send({ type: "abort-sync" }).catch(() => undefined); throw firstError; }
      this.#progress("rebuilding");
      try {
        if (firstError instanceof Error && /schema|malformed|not a database/i.test(firstError.message)) { await this.#resetDerivedDatabase(); }
        await this.#syncChanged(false, sessionId);
        this.#progress("querying");
        return await this.#send({ type: "query", request: message.kind, input: message.input });
      } catch (error) {
        await this.#send({ type: "abort-sync" }).catch(() => undefined);
        this.#progress("fallback");
        return this.#fallback(message, error);

      }
    }
  }

  #fallback(message: { kind: "activity" | "statistics"; input: UsageStatisticsGetInput }, reason: unknown): Promise<WorkerResult> {
    return this.#withFallback(() => this.#fallbackLocked(message, reason));
  }
  async #fallbackLocked(message: { kind: "activity" | "statistics"; input: UsageStatisticsGetInput }, reason: unknown): Promise<WorkerResult> {
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
      const result = await this.#send({ type: "fallback-query", request: message.kind, input: message.input }) as UsageActivitySnapshot | UsageStatisticsSnapshot | null;
      if (result) result.readModel = { source: "session", status: "fallback", reason: reason instanceof Error ? reason.message : String(reason) };
      return result;
    } finally { await this.#send({ type: "fallback-end" }).catch(() => undefined); }
  }

  async #readSummaries(sessionId?: string): Promise<readonly Summary[]> {
    this.#partialInventory = sessionId !== undefined && !!this.#reader.sessionQuerySource;
    const single = this.#partialInventory ? await this.#reader.sessionQuerySource!(sessionId!) : undefined;
    if (this.#partialInventory && !single) throw new Error("Session provider does not support bounded single-Session queries.");
    const catalog = this.#partialInventory ? { sources: [single!], failedSessionIds: [] } : await this.#reader.sessionQuerySources?.();
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

  #syncCatalog(): Promise<void> {
    const task = this.#catalogLock.then(() => this.#syncCatalogUnlocked());
    this.#catalogLock = task.catch(() => undefined);
    return task;
  }
  async #syncCatalogUnlocked(): Promise<void> {
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
    if (!this.#partialInventory && (!previous || [...previous.keys()].some(id => !fingerprints.has(id)))) {
      await this.#send({ type: "sync", sources: [], activeSessionIds: summaries.map(summary => summary.sessionId) });
      for (const id of this.#indexed.keys()) if (!fingerprints.has(id.slice(id.indexOf(":") + 1))) this.#indexed.delete(id);
    }
    if (!this.#partialInventory) this.#catalogFingerprints = fingerprints;
    else for (const [id, value] of fingerprints) this.#catalogFingerprints?.set(id, value);
  }

  async #syncChanged(catalogOnly = false, sessionId?: string): Promise<void> {
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
      const waiter = this.#scope.getStore()!;
      let job = this.#syncJobs.get(cacheId);
      while (job && job.key !== key) { await job.task.catch(() => undefined); this.#progress(); job = this.#syncJobs.get(cacheId); }
      if (!job) {
        const waiters = new Set([waiter]);
        const scope: QueryScope = { ...waiter, requestId: undefined };
        const task = this.#scope.run(scope, () => this.#syncSource(summary, catalogOnly, sessionId, read, waiters));
        job = { key, waiters, task }; this.#syncJobs.set(cacheId, job);
        void task.finally(() => { if (this.#syncJobs.get(cacheId)?.task === task) this.#syncJobs.delete(cacheId); }).catch(() => undefined);
      } else job.waiters.add(waiter);
      try { await job.task; this.#progress(undefined, 0, 1); }
      finally { job.waiters.delete(waiter); }
    }
  }

  async #syncSource(summary: Summary, catalogOnly: boolean, sessionId: string | undefined, read: NonNullable<Reader["readSessionEventBatch"]>, waiters: Set<QueryScope>): Promise<void> {
      const demand = (events = 0) => {
        const live = [...waiters].filter(scope => !scope.cancelled && (!scope.requestId || (this.#requests.has(scope.requestId) && this.#requests.get(scope.requestId)?.phase !== "cancelled")));
        if (this.#disposed || !live.length) throw new Error("Usage query cancelled.");
        this.#scope.getStore()!.foreground = live.some(scope => scope.foreground);
        for (const scope of live) { const progress = scope.requestId ? this.#requests.get(scope.requestId) : undefined; if (progress) { progress.phase = "syncing"; progress.eventsRead += events; } }
      };
      demand();
      const cacheId = `${catalogOnly ? "catalog" : "usage"}:${summary.sessionId}`;
      const key = `${summary.throughJournalSeq}:${summary.querySource?.stamp ?? ""}:${summary.querySource?.codecSetDigest ?? ""}`;
      if (this.#indexed.get(cacheId) === key) { return; }
      const state = await this.#send({ type: "source-state", sessionId: summary.sessionId, catalogOnly, target: { throughSeq: summary.throughJournalSeq, stamp: summary.querySource?.stamp, codecSetDigest: summary.querySource?.codecSetDigest } }) as SourceState;
      const digest = summary.querySource?.codecSetDigest;
      // Existing v8 indexes stored the Runtime digest as the last stamp field.
      // Keep that read-only compatibility check; new writes persist it separately.
      const codecChanged = digest !== undefined && (state.codecSetDigest !== undefined ? state.codecSetDigest !== digest : !state.stamp?.endsWith(`:${digest}`));
      if (!state.building && !codecChanged && state.revision === summary.throughJournalSeq && state.cursor && (!summary.querySource || state.stamp === summary.querySource.stamp)) { this.#indexed.set(cacheId, key); return; }
      const source = { sessionId: summary.sessionId, title: summary.title, workspaceRoot: summary.workspaceRoot, throughJournalSeq: summary.throughJournalSeq, querySource: summary.querySource };
      let reset = codecChanged || !state.cursor || state.revision === null || state.revision > summary.throughJournalSeq || (state.revision === summary.throughJournalSeq && !!summary.querySource && state.stamp !== summary.querySource.stamp);
      let cursor = reset ? undefined : state.cursor;
      // An invalidated cursor rebuilds only this Session. Each committed batch
      // persists its cursor; rebuilding rows stay private until publication.
      for (let attempt = 0; attempt < 2; attempt++) {
        let first = true;
        type Batch = Awaited<ReturnType<typeof read>>;
        let next: Promise<{ batch: Batch } | { error: unknown }> | undefined;
        try {
          let batch = await read(summary.sessionId, { throughSeq: summary.throughJournalSeq, ...(cursor ? { cursor } : {}) });
          while (true) {
            demand();
            if (!batch.done && batch.cursor === cursor) throw new Error("Session provider made no query progress.");
            // One bounded lookahead overlaps provider parsing with SQL projection.
            // Capture rejection immediately; failures still roll back the Session.
            next = batch.done ? undefined : read(summary.sessionId, { throughSeq: summary.throughJournalSeq, cursor: batch.cursor }).then(batch => ({ batch }), error => ({ error }));
            await this.#send({ type: "journal", source, events: batch.events, cursor: batch.cursor, first, final: batch.done, reset, catalogOnly });
            demand(batch.events.length);
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
          if (error instanceof Error && /cancelled|timed out/.test(error.message)) throw error;
          await this.#send({ type: "abort-sync" }).catch(() => undefined);
          if (attempt > 0 || (reset && !(error instanceof SessionSourceReadError))) {
            if (!(error instanceof SessionSourceReadError)) throw error;
            this.#failedSessionIds.add(summary.sessionId);
            this.#indexed.delete(`usage:${summary.sessionId}`);
            this.#indexed.delete(`catalog:${summary.sessionId}`);
            this.#catalogFingerprints?.delete(summary.sessionId);
            // Quarantine only this derived projection; never delete Session files.
            // Failure remains explicit in the response and is retried next query.
            if (!this.#partialInventory) await this.#send({ type: "sync", sources: [], activeSessionIds: (this.#summaries ?? []).filter(item => !this.#failedSessionIds.has(item.sessionId)).map(item => item.sessionId) });
            if (sessionId !== undefined) throw error;
            break;
          }
          reset = true; cursor = undefined;
        } finally { await next; }
      }
  }

  #send(message: Record<string, unknown>): Promise<WorkerResult> {
    const scope = this.#scope.getStore();
    return this.#scheduler.run(scope?.foreground ?? false, async () => {
      this.#activeSqlRequest = scope?.requestId;
      try { return await this.#sendNow(message); }
      finally { this.#activeSqlRequest = undefined; }
    });
  }
  async #sendNow(message: Record<string, unknown>): Promise<WorkerResult> {
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
    this.#catalogFingerprints = undefined;
    for (const entry of this.#contextHistory.values()) { entry.key = ""; entry.result = null; entry.fallback = false; entry.indexedThroughSeq = -1; }
  }
}

function fingerprintCatalog(summary: Summary): string {
  return JSON.stringify([summary.sessionId, summary.throughJournalSeq, summary.title, summary.createdAt, summary.updatedAt, summary.workspaceRoot, summary.worktree, summary.pinned, summary.archived, summary.completedTurnCount, summary.accessState, summary.agentForm, summary.agentMode, summary.agentModeRevision, summary.lineage, summary.querySource?.stamp]);
}

function toCatalogRow(summary: Summary): CatalogRow {
  return { sessionId: summary.sessionId, title: summary.title, revision: summary.throughJournalSeq, createdAt: summary.createdAt, updatedAt: summary.updatedAt, workspaceRoot: summary.workspaceRoot, ...(summary.worktree ? { worktree: summary.worktree } : {}), pinned: summary.pinned, archived: summary.archived, accessState: summary.accessState, isChildSession: isDelegatedSession(summary.lineage), ...(sideChatParentId(summary.lineage) ? { sideChatParentId: sideChatParentId(summary.lineage) } : {}), agentRunCount: summary.completedTurnCount, agentForm: summary.agentForm, agentMode: summary.agentMode, agentModeRevision: summary.agentModeRevision, querySource: summary.querySource };
}
