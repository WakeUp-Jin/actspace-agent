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
export function createDesktopSessionBridge(api: DesktopSessionApi, store = new ClientSessionStore()): DesktopSessionBridge {
  return new DesktopSessionBridge({ inspectSession: async input => {
    if (!api.getSessionObservation) return api.getSessionProjectionSnapshot(input);
    const observation = await api.getSessionObservation(input);
    return { kind: "session-projection", schemaVersion: 1, sessionId: observation.sessionId, throughJournalSeq: observation.projection.throughJournalSeq, snapshot: observation.snapshot, values: observation.projection.values, window: observation.window ?? { events: [], fromSeq: observation.projection.throughJournalSeq + 1, throughJournalSeq: observation.projection.throughJournalSeq, beforeSeq: null, turnOffset: 0, requestOffset: 0 }, activeMessageIds: observation.activeMessageIds, deferredToolCalls: observation.deferredToolCalls, watermarks: observation.watermarks };
  }, ...(api.getSessionObservation ? { observeSession: api.getSessionObservation } : {}), subscribeLive: listener => api.onSessionLiveEvent(({ event }) => listener(event)) }, store);
}

/** One event window for every target, with independent Host values and live overlays. */
export class DesktopSessionBridge {
  #unsubscribeLive: (() => void) | undefined;
  #disposed = false;
  readonly #refreshes = new Map<string, Promise<void>>();
  readonly #pendingRefresh = new Set<string>();
  readonly #historyLoads = new Map<string, Promise<void>>();
  constructor(private readonly transport: DesktopSessionTransport, readonly store = new ClientSessionStore()) {}
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
    const job = (async () => {
      while (this.#pendingRefresh.delete(sessionId) && !this.#disposed && this.store.selectedSessionId === sessionId) {
        try { await this.#load({ sessionId }, this.store.get(sessionId).requestGeneration); }
        catch { return; }
      }
    })().finally(() => { this.#refreshes.delete(sessionId); if (this.#pendingRefresh.has(sessionId)) this.#refresh(sessionId); });
    this.#refreshes.set(sessionId, job);
  }
  async #load(input: RuntimeV2SessionProjectionInput, generation: number): Promise<RuntimeV2SessionSnapshot> {
    try {
      const envelope = await this.transport.inspectSession(input);
      if (envelope.sessionId !== input.sessionId) throw new Error("Session projection identity mismatch.");
      if (!this.#disposed) this.store.applyEnvelope(envelope, generation);
      return envelope.snapshot;
    } catch (error) { this.store.markError(input.sessionId, error, generation); throw error; }
  }
  dispose(): void { this.#disposed = true; this.#unsubscribeLive?.(); this.#unsubscribeLive = undefined; this.#pendingRefresh.clear(); }
}
