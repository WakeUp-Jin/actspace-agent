import { HostError, isRecord } from "@actspace/shared/host-protocol";
/** Transient text until the journal records the completed message. Pages never truncate output. */
export class HostLiveOutput {
  readonly #sessions = new Map<string, { runId: string; revision: number; chunks: { kind: string; messageId: string; text: string }[] }>();
  accept(event: unknown): void {
    if (!isRecord(event) || typeof event.sessionId !== "string" || typeof event.agentRunId !== "string") return;
    if (event.kind !== "assistant-delta" && event.kind !== "reasoning-delta") return;
    if (typeof event.message !== "string" || typeof event.messageId !== "string") return;
    let state = this.#sessions.get(event.sessionId);
    if (!state || state.runId !== event.agentRunId) { state = { runId: event.agentRunId, revision: 0, chunks: [] }; this.#sessions.set(event.sessionId, state); }
    // Small independent chunks fit the wire bound even for a single oversized provider delta.
    for (let offset = 0; offset < event.message.length; offset += 8192) state.chunks.push({ kind: event.kind, messageId: event.messageId, text: event.message.slice(offset, offset + 8192) });
    state.revision++;
  }
  describe(sessionId: string) { const state = this.#sessions.get(sessionId); return state ? { runId: state.runId, revision: state.revision, chunks: state.chunks.length } : null; }
  page(sessionId: string, runId: string, offset: number) {
    const state = this.#sessions.get(sessionId);
    if (!state || state.runId !== runId) throw new HostError("CONFLICT", "Output belongs to another Run; refresh snapshot", true);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > state.chunks.length) throw new TypeError("Invalid output offset");
    const chunks = state.chunks.slice(offset, offset + 4);
    return { runId, revision: state.revision, offset, next: offset + chunks.length, total: state.chunks.length, chunks };
  }
  clear(sessionId: string, runId: string) { if (this.#sessions.get(sessionId)?.runId === runId) this.#sessions.delete(sessionId); }
}
