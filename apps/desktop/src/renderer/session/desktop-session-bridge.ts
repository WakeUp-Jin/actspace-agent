import { ClientSessionStore, selectTrajectory } from "@actspace/client/sessions";
import type { RuntimeV2DesktopSessionProjection, RuntimeV2LiveEvent, RuntimeV2SessionSnapshot, RuntimeV2SessionProjectionInput } from "@actspace/shared/runtime-v2";

export type DesktopSessionTransport = {
  readonly inspectSession: (sessionId: string, trajectoryFromSeq?: number) => Promise<RuntimeV2DesktopSessionProjection>;
  readonly subscribeLive: (listener: (event: RuntimeV2LiveEvent) => void) => () => void;
};

export type DesktopSessionApi = {
  readonly getSessionProjectionSnapshot: (input: RuntimeV2SessionProjectionInput) => Promise<RuntimeV2DesktopSessionProjection>;
  readonly onSessionLiveEvent: (listener: (envelope: { readonly event: RuntimeV2LiveEvent }) => void) => () => void;
};

export function createDesktopSessionBridge(api: DesktopSessionApi, store = new ClientSessionStore()): DesktopSessionBridge {
  return new DesktopSessionBridge({
    inspectSession: (sessionId, trajectoryFromSeq) => api.getSessionProjectionSnapshot({ sessionId, ...(trajectoryFromSeq === undefined ? {} : { trajectoryFromSeq }) }),
    subscribeLive: (listener) => api.onSessionLiveEvent((envelope) => listener(envelope.event)),
  }, store);
}

/**
 * Desktop-only adapter. It translates Electron/preload callbacks into the
 * framework-neutral ClientSessionStore and owns no Journal or projection fold.
 */
export class DesktopSessionBridge {
  readonly store: ClientSessionStore;
  #unsubscribeLive: (() => void) | undefined;
  #refreshPromises = new Map<string, Promise<void>>();
  #refreshTargets = new Map<string, number>();
  #historyStarts = new Map<string, number>();
  #historyLoads = new Map<string, Promise<void>>();
  #disposed = false;

  constructor(private readonly transport: DesktopSessionTransport, store = new ClientSessionStore()) {
    this.store = store;
  }

  start(): void {
    this.#disposed = false;
    if (this.#unsubscribeLive !== undefined) return;
    this.#unsubscribeLive = this.transport.subscribeLive((event) => {
      this.store.applyLiveEvent(event);
      if (this.store.selectedSessionId !== event.sessionId) return;
      const currentTarget = this.#refreshTargets.get(event.sessionId) ?? -1;
      this.#refreshTargets.set(event.sessionId, Math.max(currentTarget, event.throughJournalSeq));
      if (this.store.get(event.sessionId).liveGap) this.#refreshTargets.set(event.sessionId, Number.MAX_SAFE_INTEGER);
      this.#scheduleRefresh(event.sessionId);
    });
  }

  async open(sessionId: string): Promise<RuntimeV2SessionSnapshot> {
    if (this.#disposed) throw new Error("Session bridge disposed.");
    this.store.select(sessionId);
    const requestGeneration = this.store.beginRequest(sessionId);
    try {
      return await this.#load(sessionId, requestGeneration, true);
    } catch (error) {
      this.store.markError(sessionId, error, requestGeneration);
      throw error;
    }
  }

  loadEarlierHistory(sessionId: string): Promise<void> {
    const pending = this.#historyLoads.get(sessionId);
    if (pending) return pending;
    const from = selectTrajectory(this.store.get(sessionId))?.history?.previousFromSeq;
    if (from == null || this.#disposed || this.store.selectedSessionId !== sessionId) return Promise.resolve();
    // Update before requesting so a concurrent live refresh also includes this page.
    this.#historyStarts.set(sessionId, from);
    const generation = this.store.beginRequest(sessionId, { preserveReady: true, notify: false });
    const load = this.#load(sessionId, generation, true).then(() => undefined).finally(() => this.#historyLoads.delete(sessionId));
    this.#historyLoads.set(sessionId, load);
    return load;
  }

  #scheduleRefresh(sessionId: string): void {
    if (this.#refreshPromises.has(sessionId)) return;
    const refresh = this.#drainRefresh(sessionId).finally(() => {
      this.#refreshPromises.delete(sessionId);
      if (this.#refreshTargets.has(sessionId) && this.store.selectedSessionId === sessionId) {
        this.#scheduleRefresh(sessionId);
      }
    });
    this.#refreshPromises.set(sessionId, refresh);
  }

  async #drainRefresh(sessionId: string): Promise<void> {
    while (!this.#disposed && this.store.selectedSessionId === sessionId) {
      const target = this.#refreshTargets.get(sessionId);
      if (target === undefined) return;
      this.#refreshTargets.delete(sessionId);
      const cell = this.store.get(sessionId);
      const current = Math.max(cell.snapshot?.throughJournalSeq ?? -1, ...Object.values(cell.projectionRevisions));
      if (target !== Number.MAX_SAFE_INTEGER && target <= current) return;
      // Background refreshes must not make an already-rendered Session look
      // loading while the durable projection is being refreshed.
      const requestGeneration = this.store.beginRequest(sessionId, { preserveReady: true, notify: false });
      try {
        await this.#load(sessionId, requestGeneration, false);
      } catch (error) {
        this.store.markError(sessionId, error, requestGeneration);
        return;
      }
    }
  }

  async #load(sessionId: string, requestGeneration: number, strictSelection: boolean): Promise<RuntimeV2SessionSnapshot> {
    const envelope = await this.transport.inspectSession(sessionId, this.#historyStarts.get(sessionId));
    const snapshot = envelope.snapshot;
    if (this.#disposed || this.store.selectedSessionId !== sessionId) {
      if (strictSelection) throw new Error("Session selection changed while loading.");
      return snapshot;
    }
    if (envelope.sessionId !== sessionId || snapshot.sessionId !== sessionId || envelope.throughJournalSeq !== snapshot.throughJournalSeq) throw new Error("Session projection revision mismatch.");
    for (const value of Object.values(envelope.values)) {
      if (value && typeof value === "object" && !Array.isArray(value) && 'throughJournalSeq' in value && (value.throughJournalSeq !== envelope.throughJournalSeq || value.sessionId !== sessionId)) throw new Error("Projection value revision mismatch.");
    }
    const applied = this.store.batch(() => {
      const appliedSnapshot = this.store.applySnapshot(snapshot, { requestGeneration });
      if (!appliedSnapshot) return false;
      for (const [key, value] of Object.entries(envelope.values)) {
        if (value !== undefined) this.store.applyProjectionValue({ sessionId, key, throughJournalSeq: envelope.throughJournalSeq, value });
      }
      return true;
    });
    if (applied) {
      const from = selectTrajectory(this.store.get(sessionId))?.history?.fromSeq;
      if (from !== undefined) this.#historyStarts.set(sessionId, Math.min(from, this.#historyStarts.get(sessionId) ?? from));
    }
    return snapshot;
  }

  dispose(): void {
    this.#disposed = true;
    this.#unsubscribeLive?.();
    this.#unsubscribeLive = undefined;
    this.#refreshTargets.clear();
    this.#refreshPromises.clear();
    this.#historyLoads.clear();
  }
}
