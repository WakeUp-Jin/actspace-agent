import type { RuntimeV2JsonValue, RuntimeV2LiveEvent, RuntimeV2SessionSnapshot } from "@actspace/shared/runtime-v2";
import { liveOverlayFromEvent, type ClientLiveOverlay } from "./live-overlay.js";
import { emptyClientSessionCell, type ClientSessionCell } from "./session-snapshot.js";

export type ClientSessionListener = (cell: ClientSessionCell, overlay: ClientLiveOverlay | null) => void;

/** Framework-neutral Session-bound projection store. */
export class ClientSessionStore {
  #selectedSessionId: string | null = null;
  readonly #cells = new Map<string, ClientSessionCell>();
  readonly #overlays = new Map<string, ClientLiveOverlay>();
  readonly #listeners = new Set<ClientSessionListener>();
  #batchDepth = 0;
  readonly #pendingEmits = new Set<string>();

  get selectedSessionId(): string | null {
    return this.#selectedSessionId;
  }

  select(sessionId: string | null): ClientSessionCell | null {
    if (sessionId !== null && sessionId.length === 0) throw new TypeError("Selected Session id must be non-empty.");
    this.#selectedSessionId = sessionId;
    if (sessionId === null) return null;
    const cell = this.#cells.get(sessionId) ?? emptyClientSessionCell(sessionId);
    this.#cells.set(sessionId, Object.freeze({ ...cell, requestGeneration: cell.requestGeneration + 1, status: "loading" }));
    this.#emit(sessionId);
    return this.#cells.get(sessionId)!;
  }

  beginRequest(sessionId: string, options: { readonly preserveReady?: boolean; readonly notify?: boolean } = {}): number {
    const cell = this.#cell(sessionId);
    const status = options.preserveReady && cell.snapshot !== null ? cell.status : "loading";
    const next = Object.freeze({ ...cell, requestGeneration: cell.requestGeneration + 1, status, error: null });
    this.#cells.set(sessionId, next);
    if (options.notify !== false) this.#emit(sessionId);
    return next.requestGeneration;
  }

  /** Apply a snapshot and its revision-bound projections as one renderer update. */
  batch<T>(fn: () => T): T {
    this.#batchDepth += 1;
    try {
      return fn();
    } finally {
      this.#batchDepth -= 1;
      if (this.#batchDepth === 0 && this.#pendingEmits.size > 0) {
        const sessionIds = [...this.#pendingEmits];
        this.#pendingEmits.clear();
        for (const sessionId of sessionIds) this.#emitNow(sessionId);
      }
    }
  }

  applySnapshot(snapshot: RuntimeV2SessionSnapshot, options: { readonly requestGeneration?: number; readonly runtimeInstanceId?: string } = {}): boolean {
    const cell = this.#cell(snapshot.sessionId);
    if (options.requestGeneration !== undefined && options.requestGeneration !== cell.requestGeneration) return false;
    if (cell.snapshot !== null && snapshot.throughJournalSeq < cell.snapshot.throughJournalSeq) return false;
    if (options.runtimeInstanceId !== undefined && cell.runtimeInstanceId !== null && options.runtimeInstanceId !== cell.runtimeInstanceId) {
      this.#overlays.delete(snapshot.sessionId);
    }
    this.#cells.set(snapshot.sessionId, Object.freeze({
      ...cell,
      snapshot,
      status: "ready",
      error: null,
      runtimeInstanceId: options.runtimeInstanceId ?? cell.runtimeInstanceId,
      liveGap: false,
    }));
    const overlay = this.#overlays.get(snapshot.sessionId);
    if (overlay !== undefined && overlay.throughJournalSeq <= snapshot.throughJournalSeq) {
      this.#overlays.delete(snapshot.sessionId);
    }
    this.#emit(snapshot.sessionId);
    return true;
  }

  applyLiveEvent(event: RuntimeV2LiveEvent): boolean {
    const cell = this.#cell(event.sessionId);
    if (cell.runtimeInstanceId !== null && cell.runtimeInstanceId !== event.runtimeInstanceId) {
      this.#cells.set(event.sessionId, Object.freeze({ ...cell, runtimeInstanceId: event.runtimeInstanceId, lastLiveSeq: event.liveSeq, liveGap: true, status: "stale" as const }));
      this.#overlays.delete(event.sessionId);
      this.#emit(event.sessionId);
      return false;
    }
    if (event.liveSeq <= cell.lastLiveSeq) return false;
    const gap = cell.lastLiveSeq >= 0 && event.liveSeq !== cell.lastLiveSeq + 1;
    const nextCell = Object.freeze({ ...cell, runtimeInstanceId: event.runtimeInstanceId, lastLiveSeq: event.liveSeq, liveGap: gap || event.kind === "resync-required", status: gap || event.kind === "resync-required" ? "stale" as const : cell.status });
    this.#cells.set(event.sessionId, nextCell);
    if (gap || event.kind === "resync-required") this.#overlays.delete(event.sessionId);
    else this.#overlays.set(event.sessionId, liveOverlayFromEvent(event));
    this.#emit(event.sessionId);
    return !gap && event.kind !== "resync-required";
  }

  applyProjectionValue(input: { readonly sessionId: string; readonly key: string; readonly throughJournalSeq: number; readonly value: RuntimeV2JsonValue }): boolean {
    const cell = this.#cell(input.sessionId);
    if (!Number.isSafeInteger(input.throughJournalSeq) || input.throughJournalSeq < -1) throw new TypeError("Projection seq must be an integer >= -1.");
    if (cell.snapshot !== null && input.throughJournalSeq < cell.snapshot.throughJournalSeq) return false;
    if (input.throughJournalSeq < (cell.projectionRevisions[input.key] ?? -1)) return false;
    const nextValues = Object.freeze({ ...cell.projectionValues, [input.key]: input.value });
    const nextRevisions = Object.freeze({ ...cell.projectionRevisions, [input.key]: input.throughJournalSeq });
    this.#cells.set(input.sessionId, Object.freeze({ ...cell, projectionValues: nextValues, projectionRevisions: nextRevisions }));
    this.#emit(input.sessionId);
    return true;
  }

  markError(sessionId: string, error: unknown, requestGeneration?: number): boolean {
    const cell = this.#cell(sessionId);
    if (requestGeneration !== undefined && requestGeneration !== cell.requestGeneration) return false;
    this.#cells.set(sessionId, Object.freeze({ ...cell, status: "error", error: error instanceof Error ? error.message : String(error) }));
    this.#emit(sessionId);
    return true;
  }

  get(sessionId: string): ClientSessionCell {
    return this.#cell(sessionId);
  }

  getOverlay(sessionId: string): ClientLiveOverlay | null {
    return this.#overlays.get(sessionId) ?? null;
  }

  subscribe(listener: ClientSessionListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #cell(sessionId: string): ClientSessionCell {
    if (sessionId.length === 0) throw new TypeError("Session id must be non-empty.");
    return this.#cells.get(sessionId) ?? emptyClientSessionCell(sessionId);
  }

  #emit(sessionId: string): void {
    if (this.#batchDepth > 0) {
      this.#pendingEmits.add(sessionId);
      return;
    }
    this.#emitNow(sessionId);
  }

  #emitNow(sessionId: string): void {
    const cell = this.#cells.get(sessionId)!;
    const overlay = this.#overlays.get(sessionId) ?? null;
    for (const listener of [...this.#listeners]) listener(cell, overlay);
  }
}
