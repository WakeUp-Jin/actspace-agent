import { GlobalSessionIndex, SessionProjectionCache, type ProjectionCacheRead } from "@actspace/session-projection-cache";
import type { RuntimeV2DesktopSessionProjection, RuntimeV2SessionProjectionInput, RuntimeV2SessionUpdate, RuntimeV2ProjectionValues, RuntimeV2JsonValue, RuntimeV2SessionObservation, RuntimeV2ReadModelWatermarks, RuntimeV2WindowSupportFact } from "@actspace/shared/runtime-v2";
import { randomUUID } from "node:crypto";
import type { RuntimeV2SessionListItem, RuntimeV2SessionSnapshot } from "@actspace/shared/runtime-v2";
import type { EventCodecRegistry } from "@actspace/session-journal";
import type { SessionHandle } from "@actspace/session-persistence";
import { SessionHandle as RuntimeSessionHandle } from "@actspace/session-persistence";
import { createSessionHeader } from "@actspace/session-journal";
import { SessionStore } from "@actspace/session-persistence";
import { applySessionRecovery, classifySessionRecoveryAccess, type SessionRecoveryAccess } from "@actspace/session-persistence";
import { SessionReadModel } from "../projection/durable-session.js";
import type { RendererAllowlist } from "../projection/tool-dto.js";
import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";

export class RuntimeSessionController {
  readonly store: SessionStore;
  readonly #open = new Map<string, SessionHandle>();
  readonly #ephemeral = new Set<string>();
  readonly #models = new Map<string, SessionReadModel>();
  readonly #changes = new Map<string, Map<number, RuntimeV2ProjectionValues>>();
  readonly #projectionListeners = new Set<(update: RuntimeV2SessionUpdate) => void>();
  readonly #cache: SessionProjectionCache;
  readonly #globalIndex: GlobalSessionIndex;
  #globalIndexBuild: Promise<void> | undefined;
  #globalIndexLoadedFromDisk = false;

  subscribeProjection(listener: (update: RuntimeV2SessionUpdate) => void): () => void { this.#projectionListeners.add(listener); return () => { this.#projectionListeners.delete(listener); }; }

  private liveModel(session: SessionHandle): SessionReadModel {
    let model = this.#models.get(session.header.sessionId);
    if (!model) { model = new SessionReadModel(session.header, this.options.registry, this.options.rendererAllowlist).replay(session.journal.events); this.#models.set(session.header.sessionId, model); return model; }
    const seq = model.projections.throughSeq(session.header.sessionId);
    for (const event of session.journal.events.slice(seq + 1)) {
      const values = model.apply(event)?.values ?? {};
      const changes = this.#changes.get(session.header.sessionId) ?? new Map();
      changes.set(event.seq, values); this.#changes.set(session.header.sessionId, changes);
    }
    return model;
  }

  private async readModel(sessionId: string): Promise<{ model: SessionReadModel; snapshot: RuntimeV2SessionSnapshot; read?: ProjectionCacheRead }> {
    const live = this.#open.get(sessionId);
    if (live) { const model = this.liveModel(live); return { model, snapshot: model.snapshot(live.journal.validation.accessState) }; }
    const read = await this.#cache.read(sessionId);
    const model = new SessionReadModel(read.header, this.options.registry, this.options.rendererAllowlist);
    model.projections.restore(sessionId, read.checkpoint);
    return { model, snapshot: model.snapshot(read.accessState), read };
  }

  private summary(snapshot: RuntimeV2SessionSnapshot, profileId: string): import("@actspace/shared/runtime-v2").RuntimeV2GlobalSessionSummary {
    return { sessionId: snapshot.sessionId, throughJournalSeq: snapshot.throughJournalSeq, summaryVersion: 1, createdAt: snapshot.createdAt, updatedAt: snapshot.updatedAt, workspaceRoot: snapshot.workspaceRoot, profileId, title: snapshot.metadata.title, pinned: snapshot.metadata.pinned, archived: snapshot.metadata.archived, completedTurnCount: snapshot.activity.completedTurnCount, usage: snapshot.usage, accessState: snapshot.accessState, lineage: snapshot.lineage };
  }

  private async ensureGlobalIndex(): Promise<void> {
    if (this.#globalIndexLoadedFromDisk) return;
    if (this.#globalIndexBuild) return this.#globalIndexBuild;
    this.#globalIndexBuild = (async () => {
      const loaded = await this.#globalIndex.load();
      if (!loaded) {
        const summaries = [] as import("@actspace/shared/runtime-v2").RuntimeV2GlobalSessionSummary[];
        for (const sessionId of await this.store.listSessionIds()) {
          try { const { snapshot, model } = await this.readModel(sessionId); summaries.push(this.summary(snapshot, model.header.createdWith.profileId)); }
          catch { /* corrupt sessions remain visible through the failed count */ }
        }
        this.#globalIndex.replaceAll(summaries);
        await this.#globalIndex.save();
      }
      this.#globalIndexLoadedFromDisk = true;
    })().finally(() => { this.#globalIndexBuild = undefined; });
    return this.#globalIndexBuild;
  }

  async readProjection(input: RuntimeV2SessionProjectionInput): Promise<RuntimeV2DesktopSessionProjection> {
    const source = await this.readModel(input.sessionId);
    const { model, snapshot, read } = source;
    const live = this.#open.get(input.sessionId);
    const events = live?.journal.events;
    const end = snapshot.throughJournalSeq + 1;
    const starts = read?.starts ?? turnStarts(events ?? []);
    const requestSeqs = read?.requests ?? (events ?? []).filter(event => event.type === "request/header").map(event => event.seq);
    const before = input.beforeSeq ?? end;
    if (!Number.isSafeInteger(before) || before < 0 || before > end || (input.afterSeq !== undefined && (!Number.isSafeInteger(input.afterSeq) || input.afterSeq < -1 || input.afterSeq >= end))) throw new Error("Invalid history cursor.");
    const candidates = starts.filter(seq => seq < before);
    const from = input.afterSeq !== undefined ? input.afterSeq + 1 : candidates.length <= 10 ? 0 : candidates[candidates.length - 10]!;
    const until = input.afterSeq !== undefined ? end : before;
    let journal = events ? events.slice(from, until) : await this.#cache.events(read!, from, until);
    const maxEvents = Math.max(1, Math.min(input.maxWindowEvents ?? 200, 2_000));
    const maxBytes = Math.max(4_096, Math.min(input.maxWindowBytes ?? 256_000, 2_000_000));
    while (journal.length > maxEvents || JSON.stringify(journal).length > maxBytes) {
      if (journal.length <= 1) break;
      journal = journal.slice(1);
    }
    const windowFrom = journal[0]?.seq ?? until;
    const messageIds = new Set(journal.flatMap(event => event.surface ? [event.surface.node.messageId] : []));
    const callIds = new Set(journal.flatMap(event => {
      const data = eventData(event);
      return data && typeof data.callId === "string" ? [data.callId] : [];
    }));
    const deferredToolCalls = input.includeToolDetails ? [] : [...callIds].filter(callId => journal.some(event => {
      const data = eventData(event);
      return data?.callId === callId && JSON.stringify(event).length > 24_000;
    }));
    const deferred = new Set(deferredToolCalls);
    const boundedJournal = journal.map(event => {
      const data = eventData(event);
      return data && typeof data.callId === "string" && deferred.has(data.callId) ? boundToolEvent(event) : event;
    });
    const windowSnapshot = { ...snapshot,
      messages: snapshot.messages.filter(message => messageIds.has(message.messageId)).map(message => message.kind === "tool-result" && message.callId && deferred.has(message.callId) ? { ...message, content: "" } : message),
      tools: snapshot.tools.filter(tool => callIds.has(tool.callId)).map(tool => deferred.has(tool.callId) ? { ...tool, modelOutput: null, detail: [] } : tool),
    };
    const projectionValues = model.projections.snapshot(input.sessionId).values;
    const values = publicValues(projectionValues);
    const support: RuntimeV2WindowSupportFact[] = [];
    const surface = projectionValues.surface;
    if (surface && typeof surface === "object" && !Array.isArray(surface) && typeof (surface as Record<string, unknown>).replaceGeneration === "number") support.push({ kind: "surface", replaceGeneration: (surface as Record<string, number>).replaceGeneration });
    for (const callId of callIds) support.push({ kind: "tool-call", callId, eventSeqs: journal.filter(event => eventData(event)?.callId === callId).map(event => event.seq) });
    return { kind: "session-projection", schemaVersion: 1, sessionId: input.sessionId, throughJournalSeq: snapshot.throughJournalSeq,
      snapshot: windowSnapshot, values, activeMessageIds: snapshot.messages.map(message => message.messageId), deferredToolCalls,
      watermarks: watermarksFor(this.#open.get(input.sessionId), snapshot.throughJournalSeq, until - 1),
      window: { events: boundedJournal, fromSeq: windowFrom, throughJournalSeq: until - 1, beforeSeq: windowFrom > 0 ? windowFrom : null, turnOffset: starts.filter(seq => seq < windowFrom).length, requestOffset: requestSeqs.filter(seq => seq < windowFrom).length, support, deferredDetails: deferredToolCalls.map(callId => ({ sessionId: input.sessionId, callId, kind: "tool" as const })) } };
  }

  async readObservation(input: RuntimeV2SessionProjectionInput): Promise<RuntimeV2SessionObservation> {
    const envelope = await this.readProjection(input);
    const projection = Object.freeze({ kind: "session-projection" as const, schemaVersion: 1 as const, sessionId: envelope.sessionId, throughJournalSeq: envelope.throughJournalSeq, values: envelope.values });
    return Object.freeze({ kind: "session-observation" as const, schemaVersion: 1 as const, sessionId: envelope.sessionId, projection, snapshot: envelope.snapshot, window: envelope.window, activeMessageIds: envelope.activeMessageIds, deferredToolCalls: envelope.deferredToolCalls, watermarks: envelope.watermarks ?? watermarksFor(this.#open.get(input.sessionId), envelope.throughJournalSeq, envelope.window.throughJournalSeq) });
  }

  async browseToolDetail(sessionId: string, callId: string) {
    const source = await this.readModel(sessionId);
    const tool = source.snapshot.tools.find(item => item.callId === callId);
    if (!tool) throw new Error("Tool detail is unavailable.");
    const sequences = source.read?.calls[callId];
    const journal = sequences ? (await Promise.all(sequences.map(seq => this.#cache.events(source.read!, seq, seq + 1)))).flat() : (this.#open.get(sessionId)?.journal.events ?? []).filter(event => event.data && typeof event.data === "object" && !Array.isArray(event.data) && (event.data as Record<string, unknown>).callId === callId);
    return { snapshot: { ...source.snapshot, tools: [tool] }, journal, history: { before: null, throughJournalSeq: source.snapshot.throughJournalSeq } };
  }

  async browseSessions() {
    await this.ensureGlobalIndex();
    const items: RuntimeV2SessionListItem[] = this.#globalIndex.values().map(summary => ({ sessionId: summary.sessionId, createdAt: summary.createdAt, updatedAt: summary.updatedAt, workspaceRoot: summary.workspaceRoot, profileId: summary.profileId, accessState: summary.accessState, metadata: { title: summary.title, pinned: summary.pinned, archived: summary.archived }, lineage: summary.lineage, completedTurnCount: summary.completedTurnCount }));
    const known = new Set(items.map(item => item.sessionId));
    const failed = (await this.store.listSessionIds()).filter(sessionId => !known.has(sessionId)).length;
    items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.sessionId.localeCompare(b.sessionId));
    return { items, indexing: false, failed };
  }
  async globalSessionSummaries(): Promise<readonly import("@actspace/shared/runtime-v2").RuntimeV2GlobalSessionSummary[]> { await this.ensureGlobalIndex(); return this.#globalIndex.values(); }
  constructor(readonly options: { dataRoot: string; runtimeId: string; registry: EventCodecRegistry; profileId: string; manifestDigest: string; plugins: readonly { id: string; version: string }[]; rendererAllowlist?: RendererAllowlist; beforeRecovery?: (session: SessionHandle, store: SessionStore) => Promise<void>; onEvent?: (sessionId: string, event: SessionEventEnvelopeV1) => void | Promise<void>; onFlush?: (sessionId: string, throughSeq: number) => void | Promise<void>; onCreated?: (sessionId: string) => void | Promise<void>; onDisposed?: (sessionId: string, outcome: { readonly ok: boolean; readonly error?: unknown }) => void | Promise<void> }, store?: SessionStore) { this.store = store ?? new SessionStore({ dataRoot: options.dataRoot, runtimeId: options.runtimeId, registry: options.registry }); this.#cache = new SessionProjectionCache({ root: options.dataRoot, codecs: options.registry, createRegistry: header => new SessionReadModel(header, options.registry, options.rendererAllowlist).projections }); this.#globalIndex = new GlobalSessionIndex(options.dataRoot); }
  private onEvent(sessionId: string): (event: SessionEventEnvelopeV1) => void | Promise<void> {
    return event => {
      const model = this.#models.get(sessionId);
      if (model) {
        const current = model.projections.throughSeq(sessionId);
        const change = event.seq > current ? model.apply(event) : null;
        const values = this.#changes.get(sessionId)?.get(event.seq) ?? change?.values ?? {};
        this.#changes.get(sessionId)?.delete(event.seq);
        const callId = event.data && typeof event.data === "object" && !Array.isArray(event.data) ? (event.data as Record<string, unknown>).callId : undefined;
        const tool = (values.tools as RuntimeV2SessionSnapshot["tools"] | undefined)?.find(item => item.callId === callId);
        const update = { sessionId, throughJournalSeq: event.seq, event, values: publicValues(values), ...(tool ? { tool } : {}) };
        for (const listener of this.#projectionListeners) { try { listener(update); } catch { /* observers cannot block accepted facts */ } }
      }
      return this.options.onEvent?.(sessionId, event);
    };
  }
  private onFlush(sessionId: string): (throughSeq: number) => void | Promise<void> { return async throughSeq => {
    // The persistence callback is the durability barrier. Build or refresh the
    // cold-read checkpoint only after the Journal has reached that barrier.
    await this.options.onFlush?.(sessionId, throughSeq);
    if (!this.#ephemeral.has(sessionId)) {
      await this.#cache.read(sessionId).catch(() => undefined);
      await this.ensureGlobalIndex();
      const live = this.#open.get(sessionId);
      const model = live ? this.liveModel(live) : undefined;
      if (live && model) this.#globalIndex.replace(this.summary(model.snapshot(live.journal.validation.accessState), this.options.profileId));
      await this.#globalIndex.save();
    }
  }; }
  async create(sessionId: string = randomUUID(), cwd?: string): Promise<SessionHandle> { const session = await this.store.create({ sessionId, createdAt: new Date().toISOString(), ...(cwd === undefined ? {} : { cwd }), lineage: null, createdWith: { profileId: this.options.profileId, runtimeContractVersion: "actspace.runtime.v2", manifestDigest: this.options.manifestDigest, plugins: this.options.plugins, codecSetDigest: this.options.registry.digest } }, { onEvent: this.onEvent(sessionId), onFlush: this.onFlush(sessionId) }); this.#open.set(sessionId, session); const model = this.liveModel(session); if (this.#globalIndexLoadedFromDisk) { this.#globalIndex.replace(this.summary(model.snapshot(session.journal.validation.accessState), this.options.profileId)); void this.#globalIndex.save().catch(() => undefined); } await this.options.onCreated?.(sessionId); return session; }
  async createEphemeral(sessionId: string = randomUUID(), cwd?: string): Promise<SessionHandle> { const header = createSessionHeader({ sessionId, createdAt: new Date().toISOString(), ...(cwd === undefined ? {} : { cwd }), lineage: null, createdWith: { profileId: this.options.profileId, runtimeContractVersion: "actspace.runtime.v2", manifestDigest: this.options.manifestDigest, plugins: this.options.plugins, codecSetDigest: this.options.registry.digest } }); const session = RuntimeSessionHandle.createEphemeral({ header, registry: this.options.registry, onEvent: this.onEvent(sessionId), onFlush: this.onFlush(sessionId) }); this.#open.set(sessionId, session); this.liveModel(session); this.#ephemeral.add(sessionId); await this.options.onCreated?.(sessionId); return session; }
  async resume(sessionId: string): Promise<SessionHandle> { const existing = this.#open.get(sessionId); if (existing !== undefined) return existing; const session = await this.store.open(sessionId, { onEvent: this.onEvent(sessionId), onFlush: this.onFlush(sessionId) }); try { this.liveModel(session); await this.options.beforeRecovery?.(session, this.store); await applySessionRecovery(session); this.#open.set(sessionId, session); this.liveModel(session); await this.options.onCreated?.(sessionId); return session; } catch (error) { await session.close().catch(() => undefined); throw error; } }
  getOpen(sessionId: string): SessionHandle | undefined { return this.#open.get(sessionId); }
  closeOpen(sessionId: string): void { this.#open.delete(sessionId); this.#ephemeral.delete(sessionId); this.#models.delete(sessionId); this.#changes.delete(sessionId); }
  snapshot(session: SessionHandle): RuntimeV2SessionSnapshot { return this.liveModel(session).snapshot(session.journal.validation.accessState); }
  async inspect(sessionId: string): Promise<RuntimeV2SessionSnapshot> { return (await this.readModel(sessionId)).snapshot; }
  async recoveryAccess(sessionId: string): Promise<SessionRecoveryAccess> { const open = this.#open.get(sessionId); if (open !== undefined) return open.durabilityState === "blocked" ? "read-only" : "read-write"; return classifySessionRecoveryAccess(await this.store.inspect(sessionId)); }
  async inspectEvents(sessionId: string): Promise<readonly SessionEventEnvelopeV1[]> { const open = this.#open.get(sessionId); if (open !== undefined) return open.journal.events; const inspection = await this.store.inspect(sessionId); if (inspection.header === null || inspection.validation === null) throw new Error(`Session ${sessionId} is corrupt.`); return inspection.events; }
  async list(): Promise<readonly RuntimeV2SessionListItem[]> { return (await this.browseSessions()).items; }
  async export(sessionId: string): Promise<string> { const open = this.#open.get(sessionId); if (open !== undefined && this.#ephemeral.has(sessionId)) return [open.header, ...open.journal.events].map((record) => JSON.stringify(record)).join("\n") + "\n"; const inspection = await this.store.inspect(sessionId); if (inspection.header === null) throw new Error(`Session ${sessionId} has no header.`); return [inspection.header, ...inspection.events].map((record) => JSON.stringify(record)).join("\n") + "\n"; }
  openSessions(): readonly SessionHandle[] { return Object.freeze([...this.#open.values()]); }
  async flushAll(): Promise<void> { for (const session of this.#open.values()) await session.flush(); }
  async closeAll(): Promise<void> {
    await this.#cache.idle();
    const entries = [...this.#open];
    this.#open.clear();
    await Promise.all(entries.map(async ([sessionId, session]) => {
      let error: unknown;
      try {
        if (session.journal.events.at(-1)?.type !== "session/end-seed") await session.append({ type: "session/end-seed", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { sessionId: session.header.sessionId, lastSeq: session.lastSeq }, surface: null });
        await session.flush();
        await session.close();
      } catch (caught) { error = caught; }
      this.#models.delete(session.header.sessionId);
      this.#changes.delete(session.header.sessionId);
      this.#ephemeral.delete(sessionId);
      await this.options.onDisposed?.(session.header.sessionId, error === undefined ? { ok: true } : { ok: false, error });
      if (error !== undefined) throw error;
    }));
    this.#ephemeral.clear();
  }
}

function publicValues(values: RuntimeV2ProjectionValues): RuntimeV2ProjectionValues {
  return Object.fromEntries(Object.entries(values).filter(([key]) => !["surface", "tools", "updatedAt"].includes(key)));
}

function boundToolEvent(event: SessionEventEnvelopeV1): SessionEventEnvelopeV1 {
  const data = eventData(event);
  if (!data) return event;
  const bounded: Record<string, RuntimeV2JsonValue> = { deferredDetail: true };
  for (const key of ["agentRunId", "turnId", "stepId", "requestId", "callId", "toolCallId", "pluginId", "name", "status", "phase"] as const) {
    const value = data[key];
    if (value !== undefined) bounded[key] = value;
  }
  if (typeof data.summary === "string") bounded.summary = data.summary.slice(0, 1_000);
  if (data.failure !== undefined) bounded.failure = data.failure;
  return { ...event, data: bounded, surface: event.surface ? { ...event.surface, node: { ...event.surface.node, content: "" } } : null };
}
function eventData(event: SessionEventEnvelopeV1): Readonly<Record<string, RuntimeV2JsonValue>> | null {
  return event.data !== null && typeof event.data === "object" && !Array.isArray(event.data) ? event.data as Readonly<Record<string, RuntimeV2JsonValue>> : null;
}
function turnStarts(events: readonly SessionEventEnvelopeV1[]): number[] {
  const starts: number[] = []; let floor = 0;
  for (const event of events) {
    if (event.type === "turn/start") starts.push(floor);
    if (event.type === "turn/end") floor = event.seq + 1;
  }
  return starts;
}

function watermarksFor(session: SessionHandle | undefined, projectionThroughSeq: number, windowThroughSeq: number): RuntimeV2ReadModelWatermarks {
  return { acceptedThroughSeq: session?.acceptedSeq ?? projectionThroughSeq, durableThroughSeq: session?.durableSeq ?? projectionThroughSeq, projectionThroughSeq, windowThroughSeq, indexGeneration: null };
}
