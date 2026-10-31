import { validateSessionEvents, type EventCodecRegistry, type SessionEventEnvelopeV1 } from "@actspace/session-journal";

export type SideChatBoundary = {
  /** Last parent seq copied into the side chat (inclusive). */
  readonly boundarySeq: number;
  /** Completed parent Turns inside the copied prefix. */
  readonly inheritedTurnCount: number;
  /** The parent was mid-Turn; that Turn stays with the parent. */
  readonly runningTurnExcluded: boolean;
};

export class SideChatError extends Error {
  constructor(readonly code: "SIDE_CHAT_NO_COMPLETED_TURN", message: string) {
    super(message);
    this.name = "SideChatError";
  }
}

/**
 * Pick where a side chat forks: the whole Journal when the parent is idle,
 * otherwise the end of the last completed Turn. A prefix must be balanced and
 * hold no queued inbox message, or the side chat would claim the parent's input.
 */
export function resolveSideChatBoundary(events: readonly SessionEventEnvelopeV1[], registry: EventCodecRegistry): SideChatBoundary {
  const turnEnds: number[] = [];
  for (const event of events) if (event.type === "turn/end") turnEnds.push(event.seq);
  const full = validateSessionEvents(events, registry);
  const runningTurnExcluded = full.relations.openTurnId !== null;
  // Checked newest first; the idle tail keeps trailing mode or title events.
  const candidates = runningTurnExcluded ? turnEnds : [...turnEnds, events.length - 1];
  for (let index = candidates.length - 1; index >= 0; index--) {
    const boundarySeq = candidates[index]!;
    if (boundarySeq < 0 || !isQuietPrefix(events.slice(0, boundarySeq + 1), registry)) continue;
    const inheritedTurnCount = turnEnds.filter(seq => seq <= boundarySeq).length;
    if (inheritedTurnCount === 0) break;
    return Object.freeze({ boundarySeq, inheritedTurnCount, runningTurnExcluded });
  }
  throw new SideChatError("SIDE_CHAT_NO_COMPLETED_TURN", "主会话还没有完成的一轮，暂时不能开侧边对话。");
}

function isQuietPrefix(events: readonly SessionEventEnvelopeV1[], registry: EventCodecRegistry): boolean {
  try {
    const { accessState, relations } = validateSessionEvents(events, registry);
    return (accessState === "read-write" || accessState === "degraded") && relations.openTurnId === null && relations.openStepId === null &&
      relations.openRequestIds.length === 0 && relations.openToolCallIds.length === 0 && relations.pendingInboxMessageIds.length === 0;
  } catch {
    return false;
  }
}
