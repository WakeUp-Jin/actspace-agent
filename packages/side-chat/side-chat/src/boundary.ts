import { validateSessionEvents, type EventCodecRegistry, type SessionEventEnvelopeV1 } from "@actspace/session-journal";

export type SideChatBoundary = {
  /** Last parent seq copied into the side chat (inclusive). */
  readonly boundarySeq: number;
  /** Completed parent Turns inside the copied prefix. */
  readonly inheritedTurnCount: number;
  /** The parent was mid-Turn; that Turn stays with the parent. */
  readonly runningTurnExcluded: boolean;
};

export class TurnForkError extends Error {
  constructor(readonly code: "FORK_TURN_NOT_FOUND" | "FORK_TURN_RUNNING" | "FORK_TURN_UNAVAILABLE", message: string) {
    super(message);
    this.name = "TurnForkError";
  }
}

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

/**
 * Pick where a fork from one assistant reply ends: right after that Turn's `turn/end`,
 * extended over the events that must travel with it (for example the Host's run-finish fact)
 * until the prefix is quiet and `closed` agrees. Later Turns never come along.
 */
export function resolveTurnBoundary(
  events: readonly SessionEventEnvelopeV1[],
  registry: EventCodecRegistry,
  turnId: string,
  closed: (prefix: readonly SessionEventEnvelopeV1[]) => boolean = () => true,
): number {
  const start = events.findIndex(event => event.type === "turn/start" && (event.data as { turnId?: unknown }).turnId === turnId);
  if (start < 0) throw new TurnForkError("FORK_TURN_NOT_FOUND", "找不到这一轮，无法从这里分叉。");
  const end = events.findIndex((event, index) => index > start && event.type === "turn/end" && (event.data as { turnId?: unknown }).turnId === turnId);
  if (end < 0) throw new TurnForkError("FORK_TURN_RUNNING", "请等待当前轮次结束后再分叉。");
  const next = events.findIndex((event, index) => index > end && event.type === "turn/start");
  const last = next < 0 ? events.length - 1 : next - 1;
  for (let boundarySeq = end; boundarySeq <= last; boundarySeq++) {
    const prefix = events.slice(0, boundarySeq + 1);
    if (isQuietPrefix(prefix, registry) && closed(prefix)) return boundarySeq;
  }
  throw new TurnForkError("FORK_TURN_UNAVAILABLE", "这一轮之后的状态还没有收尾，暂时不能从这里分叉。");
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
