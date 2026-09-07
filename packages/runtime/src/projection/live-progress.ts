import { randomUUID } from "node:crypto";
import type { RuntimeV2LiveEvent, RuntimeV2SessionSnapshot, RuntimeV2ToolRunningPhase } from "@actspace/shared/runtime-v2";
import { redactProjectionText } from "./redaction.js";

export type LiveProgressInput = {
  readonly sessionId: string;
  readonly throughJournalSeq?: number;
  readonly agentRunId?: string;
  readonly pluginId?: string;
  readonly name?: string;
  readonly callId?: string;
  readonly phase?: RuntimeV2ToolRunningPhase;
  readonly message?: string | null;
  readonly current?: number | null;
  readonly total?: number | null;
  readonly runtimeInstanceId?: string;
};

export type LiveCursor = { readonly runtimeInstanceId: string; readonly liveSeq: number };

export type LiveHandshake = {
  readonly snapshot: RuntimeV2SessionSnapshot;
  readonly events: readonly RuntimeV2LiveEvent[];
  readonly cursor: LiveCursor;
  readonly resyncRequired: boolean;
};

export type LiveProgressOptions = {
  readonly runtimeInstanceId?: string;
  readonly maxBuffer?: number;
  readonly onDiagnostic?: (code: "LIVE_EVENT_DROPPED" | "LIVE_CURSOR_GAP", details: Record<string, string>) => void;
};

export class LiveProgressHub {
  readonly runtimeInstanceId: string;
  readonly #maxBuffer: number;
  readonly #onDiagnostic: LiveProgressOptions["onDiagnostic"];
  readonly #events: RuntimeV2LiveEvent[] = [];
  readonly #terminalCalls = new Set<string>();
  readonly #runs = new Map<string, string>();
  #nextSeq = 0;

  constructor(options: LiveProgressOptions = {}) {
    this.runtimeInstanceId = options.runtimeInstanceId ?? randomUUID();
    this.#maxBuffer = Math.max(1, options.maxBuffer ?? 256);
    this.#onDiagnostic = options.onDiagnostic;
  }

  registerRun(sessionId: string, agentRunId: string): void {
    this.#runs.set(sessionId, agentRunId);
  }

  markTerminal(sessionId: string, callId: string): void {
    this.#terminalCalls.add(`${sessionId}:${callId}`);
  }

  publish(input: LiveProgressInput): RuntimeV2LiveEvent | null {
    if (input.runtimeInstanceId !== undefined && input.runtimeInstanceId !== this.runtimeInstanceId) return this.drop("LIVE_EVENT_DROPPED", "runtime-changed");
    const activeRun = this.#runs.get(input.sessionId);
    if (activeRun !== undefined && input.agentRunId !== undefined && activeRun !== input.agentRunId) return this.drop("LIVE_EVENT_DROPPED", "agent-run-changed");
    if (input.callId !== undefined && this.#terminalCalls.has(`${input.sessionId}:${input.callId}`)) return this.drop("LIVE_EVENT_DROPPED", "late-terminal-event");
    if (input.current !== undefined && input.current !== null && (!Number.isFinite(input.current) || input.current < 0)) return this.drop("LIVE_EVENT_DROPPED", "invalid-current");
    if (input.total !== undefined && input.total !== null && (!Number.isFinite(input.total) || input.total < 0)) return this.drop("LIVE_EVENT_DROPPED", "invalid-total");
    const event: RuntimeV2LiveEvent = Object.freeze({
      kind: input.callId === undefined ? "runtime-live" : "tool-progress",
      schemaVersion: 1,
      runtimeInstanceId: this.runtimeInstanceId,
      liveSeq: this.#nextSeq++,
      throughJournalSeq: input.throughJournalSeq ?? -1,
      sessionId: input.sessionId,
      ...(input.message === undefined ? {} : { message: input.message === null ? null : redactProjectionText(input.message) }),
      ...(input.pluginId === undefined ? {} : { pluginId: input.pluginId }),
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.callId === undefined ? {} : { callId: input.callId }),
      ...(input.phase === undefined ? {} : { phase: input.phase }),
      ...(input.current === undefined ? {} : { current: input.current }),
      ...(input.total === undefined ? {} : { total: input.total }),
    });
    this.#events.push(event);
    while (this.#events.length > this.#maxBuffer) this.#events.shift();
    return event;
  }

  handshake(sessionId: string, snapshot: () => RuntimeV2SessionSnapshot, afterCursor?: LiveCursor): LiveHandshake {
    const capturedSeq = this.#nextSeq - 1;
    const view = snapshot();
    const cursor = Object.freeze({ runtimeInstanceId: this.runtimeInstanceId, liveSeq: capturedSeq });
    if (afterCursor === undefined) return Object.freeze({ snapshot: view, events: Object.freeze([]), cursor, resyncRequired: false });
    if (afterCursor.runtimeInstanceId !== this.runtimeInstanceId) return this.resync(view, cursor, "runtime-changed");
    const oldest = this.#events[0]?.liveSeq ?? this.#nextSeq;
    if (afterCursor.liveSeq < oldest - 1) {
      this.#onDiagnostic?.("LIVE_CURSOR_GAP", { sessionId, after: String(afterCursor.liveSeq), oldest: String(oldest) });
      return this.resync(view, cursor, "gap");
    }
    const events = this.#events.filter((event) => event.sessionId === sessionId && event.liveSeq > afterCursor.liveSeq && event.liveSeq <= capturedSeq);
    return Object.freeze({ snapshot: view, events: Object.freeze(events), cursor, resyncRequired: false });
  }

  get cursor(): LiveCursor {
    return Object.freeze({ runtimeInstanceId: this.runtimeInstanceId, liveSeq: this.#nextSeq - 1 });
  }

  private resync(snapshot: RuntimeV2SessionSnapshot, cursor: LiveCursor, reason: "gap" | "runtime-changed"): LiveHandshake {
    const event: RuntimeV2LiveEvent = Object.freeze({ kind: "resync-required", schemaVersion: 1, runtimeInstanceId: this.runtimeInstanceId, liveSeq: cursor.liveSeq, throughJournalSeq: snapshot.throughJournalSeq, sessionId: snapshot.sessionId, reason });
    return Object.freeze({ snapshot, events: Object.freeze([event]), cursor, resyncRequired: true });
  }

  private drop(code: "LIVE_EVENT_DROPPED", reason: string): null {
    this.#onDiagnostic?.(code, { reason });
    return null;
  }
}
