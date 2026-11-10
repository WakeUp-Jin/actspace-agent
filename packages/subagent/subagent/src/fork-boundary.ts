import { validateSessionEvents, type EventCodecRegistry, type SessionEventEnvelopeV1 } from "@actspace/session-journal";
import type { RuntimeV2AgentMode } from "@actspace/shared/runtime-v2";

export type ForkBoundary = {
  /** Last parent seq the fork copies (inclusive). */
  readonly boundarySeq: number;
  /** The parent's open Turn, which the fork closes with `turn/end` `reason: "forked"`. */
  readonly turnId: string;
  /** The Agent mode of that Turn: the fork runs in it so it sees the same tools and prompt. */
  readonly mode: RuntimeV2AgentMode;
};

export class ForkBoundaryError extends Error {
  constructor(readonly code: "FORK_CALL_NOT_FOUND" | "FORK_BOUNDARY_UNBALANCED", message: string) {
    super(message);
    this.name = "ForkBoundaryError";
  }
}

/**
 * Where `agent_fork` cuts the parent (design 02 §8.1): in the Turn that holds the call, the last
 * `step/end` before the Step making the call; when that Step is the Turn's first, the event right
 * before its `step/start`. Every tool call up to there has its result, so the copy is a valid context.
 */
export function resolveForkBoundary(events: readonly SessionEventEnvelopeV1[], registry: EventCodecRegistry, callId: string): ForkBoundary {
  const call = events.findIndex(event => event.type === "tool/call" && callIdOf(event) === callId);
  if (call < 0) throw new ForkBoundaryError("FORK_CALL_NOT_FOUND", `Tool call ${callId} is not in the parent Session.`);
  const turnId = field(events[call], "turnId");
  const turnStart = lastIndexBefore(events, call, event => event.type === "turn/start");
  const stepStart = lastIndexBefore(events, call, event => event.type === "step/start");
  if (turnStart < 0 || stepStart < turnStart) throw new ForkBoundaryError("FORK_CALL_NOT_FOUND", `Tool call ${callId} is outside a Step.`);
  const turnStartEvent = events[turnStart];
  if (turnId !== undefined && field(turnStartEvent, "turnId") !== turnId) throw new ForkBoundaryError("FORK_CALL_NOT_FOUND", `Tool call ${callId} is outside its Turn.`);
  const stepEnd = lastIndexBefore(events, stepStart, (event, index) => index > turnStart && event.type === "step/end");
  const boundary = stepEnd >= 0 ? events[stepEnd] : events[stepStart - 1];
  if (!isBalancedPrefix(events.slice(0, boundary.seq + 1), registry)) {
    throw new ForkBoundaryError("FORK_BOUNDARY_UNBALANCED", "The conversation before this step has an unfinished tool call or request.");
  }
  const mode = field(turnStartEvent, "mode");
  return Object.freeze({ boundarySeq: boundary.seq, turnId: field(turnStartEvent, "turnId")!, mode: mode === "plan" || mode === "chat" ? mode : "agent" });
}

/** `isQuietPrefix` of side chats without "the Turn has ended" and "no queued inbox message": the fork closes the Turn and drops the parent's queued notices. */
function isBalancedPrefix(events: readonly SessionEventEnvelopeV1[], registry: EventCodecRegistry): boolean {
  try {
    const { accessState, relations } = validateSessionEvents(events, registry);
    return (accessState === "read-write" || accessState === "degraded") && relations.openStepId === null && relations.openRequestIds.length === 0 && relations.openToolCallIds.length === 0;
  } catch {
    return false;
  }
}

function lastIndexBefore(events: readonly SessionEventEnvelopeV1[], end: number, match: (event: SessionEventEnvelopeV1, index: number) => boolean): number {
  for (let index = end - 1; index >= 0; index--) if (match(events[index], index)) return index;
  return -1;
}

function callIdOf(event: SessionEventEnvelopeV1): string | undefined {
  return field(event, "callId") ?? field(event, "toolCallId");
}

function field(event: SessionEventEnvelopeV1, name: string): string | undefined {
  const data = event.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return undefined;
  const value = (data as Record<string, unknown>)[name];
  return typeof value === "string" ? value : undefined;
}
