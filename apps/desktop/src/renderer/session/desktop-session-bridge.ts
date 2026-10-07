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
};
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
  readonly #historyLoads = new Map<string, Promise<void>>();
  readonly #retryTimers = new Map<ReturnType<typeof setTimeout>, () => void>();
  readonly #retryDelaysMs: readonly number[];
  constructor(private readonly transport: DesktopSessionTransport, readonly store = new ClientSessionStore(), options: DesktopSessionBridgeOptions = {}) {
    this.#retryDelaysMs = options.retryDelaysMs ?? REFRESH_RETRY_DELAYS_MS;
  }
  start(): void {
    this.#disposed = false;
    this.#unsubscribeLive ??= this.transport.subscribeLive(event => {
      const applied = this.store.applyLiveEvent(event);
      if (this.store.selectedSessionId !== event.sessionId) return;
      const type = event.update?.event.type;
      if (!applied || event.kind === "resync-required" || type === "compaction/end" || type === "recovery/end" || type === "surface/replaced") {
        this.#pendingRefresh.add(event.sessionId); this.#refresh(event.sessionId);
      }
    });
  }
  async open(sessionId: string): Promise<RuntimeV2SessionSnapshot> {
    if (this.#disposed) throw new Error("Session bridge disposed.");
    this.store.select(sessionId);
    const generation = this.store.beginRequest(sessionId);
    return this.#load({ sessionId }, generation);
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
    const current = () => !this.#disposed && this.store.selectedSessionId === sessionId;
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
    this.#disposed = true; this.#unsubscribeLive?.(); this.#unsubscribeLive = undefined; this.#pendingRefresh.clear();
    // 等待中的重试立即结束，循环看到 disposed 后退出。
    for (const [timer, resolve] of this.#retryTimers) { clearTimeout(timer); resolve(); }
    this.#retryTimers.clear();
  }
}
