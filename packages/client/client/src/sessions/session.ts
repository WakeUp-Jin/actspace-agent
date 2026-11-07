import { surfaceNode } from "@actspace/shared/runtime-v2";
import type { RuntimeV2DesktopSessionProjection, RuntimeV2EventWindow, RuntimeV2JsonValue, RuntimeV2LiveEvent, RuntimeV2SessionSnapshot, RuntimeV2SessionUpdate } from "@actspace/shared/runtime-v2";
import { liveOverlayFromEvent, type ClientLiveOverlay } from "./live-overlay.js";
import { emptyClientSessionCell, type ClientSessionCell } from "./session-snapshot.js";

const TRANSACTION_BOUNDARIES: ReadonlySet<string> = new Set(["compaction/start", "compaction/end", "recovery/start", "recovery/committed"]);

/**
 * Whether the journal currently sits inside a compaction/recovery transaction (the last boundary event is a `/start`).
 * Windows are immutable, so the answer is memoized per window object: `applyJournalUpdate` seeds the next window from the
 * previous answer plus the one appended event (O(1)); only a window that came from elsewhere (a snapshot/page merge) is
 * scanned once, backwards, without copying.
 */
const pendingTransactionByWindow = new WeakMap<RuntimeV2EventWindow, boolean>();

function hasPendingTransaction(window: RuntimeV2EventWindow): boolean {
  const known = pendingTransactionByWindow.get(window);
  if (known !== undefined) return known;
  let pending = false;
  for (let index = window.events.length - 1; index >= 0; index--) {
    const type = window.events[index]!.type;
    if (TRANSACTION_BOUNDARIES.has(type)) { pending = type.endsWith("/start"); break; }
  }
  pendingTransactionByWindow.set(window, pending);
  return pending;
}

export type ClientSessionListener = (cell: ClientSessionCell, overlay: ClientLiveOverlay | null) => void;

/** Framework-neutral Session-bound projection store. */
export class ClientSessionStore {
  #selectedSessionId: string | null = null;
  readonly #cells = new Map<string, ClientSessionCell>();
  readonly #overlays = new Map<string, ClientLiveOverlay>();
  readonly #listeners = new Set<ClientSessionListener>();
  #batchDepth = 0;
  readonly #pendingEmits = new Set<string>();
  /** Sessions whose Journal was rewound: the next envelope replaces the cell instead of merging into the longer old one. */
  readonly #resetting = new Set<string>();

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
    // liveSeq is process-wide; other sessions can legitimately occupy the intervening seqs.
    const gap = event.kind === "journal-update" && event.update !== undefined && cell.window !== null && event.update.event.seq > cell.window.throughJournalSeq + 1;
    const nextCell = Object.freeze({ ...cell, runtimeInstanceId: event.runtimeInstanceId, lastLiveSeq: event.liveSeq, liveGap: gap || event.kind === "resync-required", status: gap || event.kind === "resync-required" ? "stale" as const : cell.status });
    this.#cells.set(event.sessionId, nextCell);
    if (gap || event.kind === "resync-required") this.#overlays.delete(event.sessionId);
    else if (event.kind === "journal-update" && event.update) return this.applyJournalUpdate(event.update);
    else this.#overlays.set(event.sessionId, liveOverlayFromEvent(event));
    this.#emit(event.sessionId);
    return !gap && event.kind !== "resync-required";
  }

  /**
   * The Session's Journal was rewound (agent-edit-resend-rewind.md §5.4): its seqs restart below what this cell holds.
   * Reads already in flight are discarded and Journal updates are refused until the next envelope, which replaces the
   * snapshot, window and values outright. The old content stays visible until then.
   */
  reset(sessionId: string): void {
    const cell = this.#cells.get(sessionId);
    if (cell === undefined) return;
    this.#resetting.add(sessionId);
    this.#overlays.delete(sessionId);
    this.#cells.set(sessionId, Object.freeze({ ...cell, requestGeneration: cell.requestGeneration + 1 }));
  }

  isResetting(sessionId: string): boolean { return this.#resetting.has(sessionId); }

  applyEnvelope(envelope: RuntimeV2DesktopSessionProjection, requestGeneration?: number): boolean {
    const cell = this.#cell(envelope.sessionId);
    if (requestGeneration !== undefined && requestGeneration !== cell.requestGeneration) return false;
    if (envelope.snapshot.sessionId !== envelope.sessionId || envelope.snapshot.throughJournalSeq !== envelope.throughJournalSeq) throw new Error("Session projection revision mismatch.");
    if (this.#resetting.delete(envelope.sessionId)) {
      const values: Record<string, RuntimeV2JsonValue> = {};
      const revisions: Record<string, number> = {};
      for (const [key, value] of Object.entries(envelope.values)) if (value !== undefined) { values[key] = value; revisions[key] = envelope.throughJournalSeq; }
      this.#overlays.delete(envelope.sessionId);
      this.#cells.set(envelope.sessionId, Object.freeze({ ...cell, snapshot: envelope.snapshot, window: envelope.window, deferredToolCalls: [...envelope.deferredToolCalls], watermarks: envelope.watermarks ?? null,
        projectionValues: Object.freeze(values), projectionRevisions: Object.freeze(revisions), status: "ready" as const, error: null, liveGap: false }));
      this.#emit(envelope.sessionId);
      return true;
    }
    const older = cell.snapshot !== null && envelope.throughJournalSeq < cell.snapshot.throughJournalSeq;
    const sameRevision = cell.snapshot !== null && envelope.throughJournalSeq === cell.snapshot.throughJournalSeq;
    if (sameRevision && Object.keys(cell.projectionValues).length > 0 && JSON.stringify(envelope.values) !== JSON.stringify(cell.projectionValues)) {
      this.#cells.set(envelope.sessionId, Object.freeze({ ...cell, status: "stale", liveGap: true }));
      this.#emit(envelope.sessionId);
      return false;
    }
    const priorWindow = cell.window;
    const incoming = envelope.window;
    let window = incoming;
    if (priorWindow && incoming.fromSeq <= priorWindow.throughJournalSeq + 1 && incoming.throughJournalSeq >= priorWindow.fromSeq - 1) {
      const bySeq = new Map(priorWindow.events.map(event => [event.seq, event]));
      for (const event of incoming.events) if (!older || !bySeq.has(event.seq)) bySeq.set(event.seq, event);
      const earliest = incoming.fromSeq < priorWindow.fromSeq ? incoming : priorWindow;
      window = { ...earliest, events: [...bySeq.values()].sort((a, b) => a.seq - b.seq), throughJournalSeq: Math.max(incoming.throughJournalSeq, priorWindow.throughJournalSeq) };
    }
    this.batch(() => {
      const active = new Set(envelope.activeMessageIds);
      const messages = new Map(cell.snapshot?.messages.map(message => [message.messageId, message]));
      for (const message of envelope.snapshot.messages) if (!older || !messages.has(message.messageId)) messages.set(message.messageId, message);
      const tools = new Map(cell.snapshot?.tools.map(tool => [tool.callId, tool]));
      for (const tool of envelope.snapshot.tools) if (!older || !tools.has(tool.callId)) tools.set(tool.callId, tool);
      const snapshot = { ...(older ? cell.snapshot! : envelope.snapshot), messages: [...messages.values()].filter(message => older || active.has(message.messageId)), tools: [...tools.values()] };
      this.applySnapshot(snapshot, { requestGeneration });
      const current = this.#cell(envelope.sessionId);
      this.#cells.set(envelope.sessionId, Object.freeze({ ...current, window, watermarks: envelope.watermarks ?? current.watermarks, deferredToolCalls: [...new Set([...cell.deferredToolCalls, ...envelope.deferredToolCalls])] }));
      if (!older) {
        const values: Record<string, RuntimeV2JsonValue> = {};
        const revisions: Record<string, number> = {};
        for (const [key, value] of Object.entries(envelope.values)) {
          if (value === undefined) continue;
          const currentRevision = current.projectionRevisions[key];
          const newer = currentRevision !== undefined && currentRevision >= envelope.throughJournalSeq;
          values[key] = newer ? current.projectionValues[key]! : value;
          revisions[key] = newer ? currentRevision : envelope.throughJournalSeq;
        }
        this.#cells.set(envelope.sessionId, Object.freeze({ ...this.#cell(envelope.sessionId), projectionValues: Object.freeze(values), projectionRevisions: Object.freeze(revisions) }));
      }
      this.#emit(envelope.sessionId);
    });
    return true;
  }

  applyJournalUpdate(update: RuntimeV2SessionUpdate): boolean {
    const cell = this.#cell(update.sessionId);
    if (!cell.window || !cell.snapshot || this.#resetting.has(update.sessionId)) return false;
    const event = update.event;
    if (event.seq <= cell.window.throughJournalSeq) return true;
    if (event.seq !== cell.window.throughJournalSeq + 1 || update.throughJournalSeq !== event.seq) return false;
    const snapshot = cell.snapshot;
    const pendingTransaction = hasPendingTransaction(cell.window);
    const node = !pendingTransaction && event.surface?.kind === "append" ? surfaceNode(event) : null;
    const messages = node ? snapshot.messages.concat([{ kind: node.kind, messageId: node.messageId, content: node.content, ...(node.kind === "tool-result" ? { callId: node.callId } : {}) }]) : snapshot.messages;
    const values: Record<string, RuntimeV2JsonValue | undefined> = { ...cell.projectionValues, ...update.values };
    const tools = update.tool ? withToolUpdated(snapshot.tools, update.tool) : snapshot.tools;
    const nextSnapshot = { ...snapshot, throughJournalSeq: event.seq, updatedAt: event.time, messages, tools,
      metadata: (values.metadata ?? snapshot.metadata) as RuntimeV2SessionSnapshot["metadata"],
      todos: (values.todos ?? snapshot.todos) as RuntimeV2SessionSnapshot["todos"],
      usage: (values.providerUsage ?? snapshot.usage) as RuntimeV2SessionSnapshot["usage"],
      activity: (values.sessionStats ?? snapshot.activity) as RuntimeV2SessionSnapshot["activity"],
      delegations: (values.delegations ?? snapshot.delegations) as RuntimeV2SessionSnapshot["delegations"],
      pendingInbox: (values.pendingInbox ?? snapshot.pendingInbox) as RuntimeV2SessionSnapshot["pendingInbox"],
      agentMode: (values.agentMode as { mode?: RuntimeV2SessionSnapshot["agentMode"] } | undefined)?.mode ?? snapshot.agentMode,
      agentModeRevision: (values.agentMode as { revision?: number } | undefined)?.revision ?? snapshot.agentModeRevision,
      permissionMode: (values.permissionMode ?? snapshot.permissionMode) as RuntimeV2SessionSnapshot["permissionMode"],
    };
    const revisions = { ...cell.projectionRevisions };
    for (const key of Object.keys(update.values)) revisions[key] = event.seq;
    // Published arrays are never mutated (consumers compare array identity/length across renders), so appending is one native copy.
    const nextWindow: RuntimeV2EventWindow = { ...cell.window, events: cell.window.events.concat([event]), throughJournalSeq: event.seq };
    pendingTransactionByWindow.set(nextWindow, TRANSACTION_BOUNDARIES.has(event.type) ? event.type.endsWith("/start") : pendingTransaction);
    this.#cells.set(update.sessionId, Object.freeze({ ...cell, snapshot: nextSnapshot, projectionValues: values as Record<string, RuntimeV2JsonValue>, projectionRevisions: revisions,
      window: nextWindow,
      liveGap: false, status: "ready" }));
    this.#emit(update.sessionId);
    return true;
  }

  applyProjectionValue(input: { readonly sessionId: string; readonly key: string; readonly throughJournalSeq: number; readonly value: RuntimeV2JsonValue }): boolean {
    const cell = this.#cell(input.sessionId);
    if (!Number.isSafeInteger(input.throughJournalSeq) || input.throughJournalSeq < -1) throw new TypeError("Projection seq must be an integer >= -1.");
    if (this.#resetting.has(input.sessionId)) return false;
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

  /** The stored cell, or null when the Session holds none; unlike `get`, never fabricates an empty cell. */
  peek(sessionId: string): ClientSessionCell | null {
    return this.#cells.get(sessionId) ?? null;
  }

  /**
   * Drop a Session's cell and live overlay; a later `get` returns an empty cell and the next open reloads it.
   * Does not notify: callers evict only Sessions nobody is observing (never the selected one).
   */
  evict(sessionId: string): boolean {
    if (sessionId === this.#selectedSessionId) return false;
    this.#resetting.delete(sessionId);
    this.#overlays.delete(sessionId);
    this.#pendingEmits.delete(sessionId);
    return this.#cells.delete(sessionId);
  }

  /** Session ids that currently hold a cell; for LRU bookkeeping and memory checks. */
  cellIds(): string[] {
    return [...this.#cells.keys()];
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

/** The updated tool moves to the end of the list (its latest activity); other tools keep their order. */
function withToolUpdated(tools: RuntimeV2SessionSnapshot["tools"], tool: RuntimeV2SessionSnapshot["tools"][number]): RuntimeV2SessionSnapshot["tools"] {
  let at = -1;
  for (let index = tools.length - 1; index >= 0; index--) if (tools[index]!.callId === tool.callId) { at = index; break; }
  if (at === -1) return tools.concat([tool]);
  const next = tools.slice(0, at).concat(tools.slice(at + 1));
  next.push(tool);
  return next;
}
