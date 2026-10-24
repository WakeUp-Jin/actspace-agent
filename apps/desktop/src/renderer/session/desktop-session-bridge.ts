import { ClientSessionStore } from "@actspace/client/sessions";
import type { RuntimeV2DesktopSessionProjection, RuntimeV2LiveEvent, RuntimeV2SessionSnapshot, RuntimeV2SessionProjectionInput, RuntimeV2SessionObservation } from "@actspace/shared/runtime-v2";

export type DesktopSessionTransport = {
  readonly inspectSession: (input: RuntimeV2SessionProjectionInput) => Promise<RuntimeV2DesktopSessionProjection>;
  readonly observeSession?: (input: RuntimeV2SessionProjectionInput) => Promise<RuntimeV2SessionObservation>;
  readonly subscribeLive: (listener: (event: RuntimeV2LiveEvent) => void) => () => void;
};
export type DesktopSessionApi = {
  readonly getSessionProjectionSnapshot: DesktopSessionTransport["inspectSession"];
  readonly onSessionLiveEvent: (listener: (envelope: { readonly event: RuntimeV2LiveEvent }) => void) => () => void;
  readonly getSessionObservation?: (input: RuntimeV2SessionProjectionInput) => Promise<RuntimeV2SessionObservation>;
};
export type DesktopSessionBridgeOptions = {
  /** refresh 失败后的重试间隔；用完仍失败就停下，错误留在 cell 的 `status/error` 上。 */
  readonly retryDelaysMs?: readonly number[];
  /**
   * 流式增量（`assistant/chunk` 的 journal-update、assistant / reasoning delta）先排队，交给它延后统一应用
   * （例如按帧），一批只通知一次。其他事件到达时先按顺序应用排队的增量。不传时每个事件立即应用。
   */
  readonly scheduleStreamFlush?: (flush: () => void) => void;
};

/** 流式输出期间每个 delta 都会来的 live 事件；只改正文，不改会话结构。 */
function isStreamIncrement(event: RuntimeV2LiveEvent): boolean {
  return event.kind === "assistant-delta" || event.kind === "reasoning-delta"
    || (event.kind === "journal-update" && event.update?.event.type === "assistant/chunk");
}
const REFRESH_RETRY_DELAYS_MS = [1000, 2000, 4000] as const;

export function createDesktopSessionBridge(api: DesktopSessionApi, store = new ClientSessionStore(), options: DesktopSessionBridgeOptions = {}): DesktopSessionBridge {
  return new DesktopSessionBridge({ inspectSession: async input => {
    if (!api.getSessionObservation) return api.getSessionProjectionSnapshot(input);
    const observation = await api.getSessionObservation(input);
    return { kind: "session-projection", schemaVersion: 1, sessionId: observation.sessionId, throughJournalSeq: observation.projection.throughJournalSeq, snapshot: observation.snapshot, values: observation.projection.values, window: observation.window ?? { events: [], fromSeq: observation.projection.throughJournalSeq + 1, throughJournalSeq: observation.projection.throughJournalSeq, beforeSeq: null, turnOffset: 0, requestOffset: 0 }, activeMessageIds: observation.activeMessageIds, deferredToolCalls: observation.deferredToolCalls, watermarks: observation.watermarks };
  }, ...(api.getSessionObservation ? { observeSession: api.getSessionObservation } : {}), subscribeLive: listener => api.onSessionLiveEvent(({ event }) => listener(event)) }, store, options);
}

/** One event window for every target, with independent Host values and live overlays. */
export class DesktopSessionBridge {
  #unsubscribeLive: (() => void) | undefined;
  #disposed = false;
  readonly #refreshes = new Map<string, Promise<void>>();
  readonly #pendingRefresh = new Set<string>();
  readonly #watched = new Map<string, number>();
  readonly #historyLoads = new Map<string, Promise<void>>();
  readonly #retryTimers = new Map<ReturnType<typeof setTimeout>, () => void>();
  readonly #retryDelaysMs: readonly number[];
  readonly #scheduleStreamFlush: ((flush: () => void) => void) | undefined;
  #queuedIncrements: RuntimeV2LiveEvent[] = [];
  constructor(private readonly transport: DesktopSessionTransport, readonly store = new ClientSessionStore(), options: DesktopSessionBridgeOptions = {}) {
    this.#retryDelaysMs = options.retryDelaysMs ?? REFRESH_RETRY_DELAYS_MS;
    this.#scheduleStreamFlush = options.scheduleStreamFlush;
  }
  start(): void {
    this.#disposed = false;
    this.#unsubscribeLive ??= this.transport.subscribeLive(event => {
      if (this.#scheduleStreamFlush && isStreamIncrement(event)) {
        this.#queuedIncrements.push(event);
        if (this.#queuedIncrements.length === 1) this.#scheduleStreamFlush(() => this.#flushIncrements());
        return;
      }
      this.#flushIncrements();
      this.#applyLive(event);
    });
  }
  #flushIncrements(): void {
    if (this.#queuedIncrements.length === 0) return;
    const queued = this.#queuedIncrements;
    this.#queuedIncrements = [];
    if (this.#disposed) return;
    this.store.batch(() => { for (const event of queued) this.#applyLive(event); });
  }
  #applyLive(event: RuntimeV2LiveEvent): void {
    const applied = this.store.applyLiveEvent(event);
    if (this.store.selectedSessionId !== event.sessionId && !this.#watched.has(event.sessionId)) return;
    const type = event.update?.event.type;
    if (!applied || event.kind === "resync-required" || type === "compaction/end" || type === "recovery/end" || type === "surface/replaced") {
      this.#pendingRefresh.add(event.sessionId); this.#refresh(event.sessionId);
    }
  }
  async open(sessionId: string): Promise<RuntimeV2SessionSnapshot> {
    if (this.#disposed) throw new Error("Session bridge disposed.");
    this.store.select(sessionId);
    const generation = this.store.beginRequest(sessionId);
    return this.#load({ sessionId }, generation);
  }
  /** Observe a related Session without changing the selected conversation. */
  watch(sessionId: string): () => void {
    this.#watched.set(sessionId, (this.#watched.get(sessionId) ?? 0) + 1);
    if (this.#watched.get(sessionId) === 1) {
      this.#pendingRefresh.add(sessionId);
      this.#refresh(sessionId);
    }
    return () => {
      const count = (this.#watched.get(sessionId) ?? 1) - 1;
      if (count > 0) this.#watched.set(sessionId, count);
      else { this.#watched.delete(sessionId); this.#pendingRefresh.delete(sessionId); }
    };
  }
  refreshRelated(sessionId: string): Promise<void> {
    if (!this.#watched.has(sessionId)) return Promise.resolve();
    this.#pendingRefresh.add(sessionId); this.#refresh(sessionId);
    return this.#refreshes.get(sessionId) ?? Promise.resolve();
  }
  loadEarlierHistory(sessionId: string): Promise<void> {
    const pending = this.#historyLoads.get(sessionId);
    if (pending) return pending;
    const beforeSeq = this.store.get(sessionId).window?.beforeSeq;
    if (beforeSeq == null || this.#disposed) return Promise.resolve();
    const generation = this.store.get(sessionId).requestGeneration;
    const job = this.#load({ sessionId, beforeSeq }, generation).then(() => undefined).finally(() => this.#historyLoads.delete(sessionId));
    this.#historyLoads.set(sessionId, job); return job;
  }
  #refresh(sessionId: string): void {
    if (this.#refreshes.has(sessionId)) return;
    const current = () => !this.#disposed && (this.store.selectedSessionId === sessionId || this.#watched.has(sessionId));
    const job = (async () => {
      while (this.#pendingRefresh.delete(sessionId) && current()) {
        // 失败时 #load 已经把错误写进 cell；按退避重试，成功的 applyEnvelope 会清掉错误。
        for (let attempt = 0; ; attempt++) {
          try { await this.#load({ sessionId }, this.store.get(sessionId).requestGeneration); break; }
          catch (error) {
            const delay = this.#retryDelaysMs[attempt];
            if (delay === undefined) { console.error("Session refresh failed after retries", error); return; }
            await this.#wait(delay);
            if (!current()) return;
          }
        }
      }
    })().finally(() => { this.#refreshes.delete(sessionId); if (this.#pendingRefresh.has(sessionId)) this.#refresh(sessionId); });
    this.#refreshes.set(sessionId, job);
  }
  #wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => { this.#retryTimers.delete(timer); resolve(); }, ms);
      this.#retryTimers.set(timer, resolve);
    });
  }
  async #load(input: RuntimeV2SessionProjectionInput, generation: number): Promise<RuntimeV2SessionSnapshot> {
    try {
      const envelope = await this.transport.inspectSession(input);
      if (envelope.sessionId !== input.sessionId) throw new Error("Session projection identity mismatch.");
      if (!this.#disposed) this.store.applyEnvelope(envelope, generation);
      return envelope.snapshot;
    } catch (error) { this.store.markError(input.sessionId, error, generation); throw error; }
  }
  dispose(): void {
    this.#watched.clear();
    this.#disposed = true; this.#unsubscribeLive?.(); this.#unsubscribeLive = undefined; this.#pendingRefresh.clear(); this.#queuedIncrements = [];
    // 等待中的重试立即结束，循环看到 disposed 后退出。
    for (const [timer, resolve] of this.#retryTimers) { clearTimeout(timer); resolve(); }
    this.#retryTimers.clear();
  }
}
