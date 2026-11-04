import type { EventCodecRegistry } from "./codec-registry.js";
import type { SessionEventEnvelopeV1 } from "./event-envelope.js";
import { SessionError } from "./errors.js";
import { createSessionHeader, type SessionCreatedWithV1, type SessionHeaderV1, type SessionLineageOrigin } from "./header.js";
import { validateSessionEvents } from "./invariant-validator.js";

/** `createdWith.presetId` of an `agent_fork` child: a delegation that copies the parent's context and runs as the main agent. */
export const FORKED_SUBAGENT_PRESET_ID = "actspace.subagent.fork";

export type SessionForkSeed = {
  readonly header: SessionHeaderV1;
  readonly events: readonly SessionEventEnvelopeV1[];
};

export function createSessionForkSeed(options: {
  readonly parentHeader: SessionHeaderV1;
  readonly parentEvents: readonly SessionEventEnvelopeV1[];
  readonly boundarySeq: number;
  readonly newSessionId: string;
  readonly createdAt: string;
  readonly createdWith: SessionCreatedWithV1;
  readonly registry: EventCodecRegistry;
  readonly origin?: SessionLineageOrigin;
  /** The `agent_fork` call of a forked subagent (`origin: "delegation"`), whose Turn is still open at the boundary. */
  readonly parentCallId?: string;
}): SessionForkSeed {
  if (!Number.isSafeInteger(options.boundarySeq) || options.boundarySeq < -1 || options.boundarySeq >= options.parentEvents.length) {
    throw new SessionError("INVALID_FORK_BOUNDARY", `Fork boundary ${options.boundarySeq} is outside the persisted Journal.`);
  }
  const events = options.parentEvents.slice(0, options.boundarySeq + 1);
  const validation = validateSessionEvents(events, options.registry);
  if (validation.accessState === "browse-only" || validation.accessState === "corrupt") {
    throw new SessionError("INVALID_FORK_BOUNDARY", `Cannot fork a ${validation.accessState} Session.`);
  }
  const origin = options.origin ?? "fork";
  // A forked subagent copies the parent mid-Turn and closes that Turn itself (design 02 §8.3).
  if (
    (validation.relations.openTurnId !== null && origin !== "delegation") ||
    validation.relations.openStepId !== null ||
    validation.relations.openRequestIds.length > 0 ||
    validation.relations.openToolCallIds.length > 0
  ) {
    throw new SessionError("INVALID_FORK_BOUNDARY", "Fork boundary must be balanced with no dangling request or tool call.");
  }
  const parentDepth = options.parentHeader.lineage?.delegationDepth ?? 0;
  const header = createSessionHeader({
    sessionId: options.newSessionId,
    createdAt: options.createdAt,
    ...(options.parentHeader.cwd === undefined ? {} : { cwd: options.parentHeader.cwd }),
    ...(options.parentHeader.worktree ? { worktree: options.parentHeader.worktree } : {}),
    lineage: {
      parentSessionId: options.parentHeader.sessionId,
      parentBoundarySeq: options.boundarySeq,
      origin,
      delegationDepth: origin === "delegation" ? parentDepth + 1 : parentDepth,
      ...(origin === "delegation" ? { inheritedThroughSeq: options.boundarySeq, ...(options.parentCallId === undefined ? {} : { parentCallId: options.parentCallId }) } : {}),
    },
    createdWith: options.createdWith,
  });
  return Object.freeze({ header, events: Object.freeze([...events]) });
}
