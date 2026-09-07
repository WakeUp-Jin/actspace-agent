import type { EventCodecRegistry } from "./codec-registry.js";
import type { SessionEventEnvelopeV1 } from "./event-envelope.js";
import { SessionError } from "./errors.js";
import { createSessionHeader, type SessionCreatedWithV1, type SessionHeaderV1 } from "./header.js";
import { validateSessionEvents } from "./invariant-validator.js";

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
  readonly origin?: "fork" | "delegation";
}): SessionForkSeed {
  if (!Number.isSafeInteger(options.boundarySeq) || options.boundarySeq < -1 || options.boundarySeq >= options.parentEvents.length) {
    throw new SessionError("INVALID_FORK_BOUNDARY", `Fork boundary ${options.boundarySeq} is outside the persisted Journal.`);
  }
  const events = options.parentEvents.slice(0, options.boundarySeq + 1);
  const validation = validateSessionEvents(events, options.registry);
  if (validation.accessState === "browse-only" || validation.accessState === "corrupt") {
    throw new SessionError("INVALID_FORK_BOUNDARY", `Cannot fork a ${validation.accessState} Session.`);
  }
  if (
    validation.relations.openTurnId !== null ||
    validation.relations.openStepId !== null ||
    validation.relations.openRequestIds.length > 0 ||
    validation.relations.openToolCallIds.length > 0
  ) {
    throw new SessionError("INVALID_FORK_BOUNDARY", "Fork boundary must be balanced with no dangling request or tool call.");
  }
  const parentDepth = options.parentHeader.lineage?.delegationDepth ?? 0;
  const origin = options.origin ?? "fork";
  const header = createSessionHeader({
    sessionId: options.newSessionId,
    createdAt: options.createdAt,
    ...(options.parentHeader.cwd === undefined ? {} : { cwd: options.parentHeader.cwd }),
    lineage: {
      parentSessionId: options.parentHeader.sessionId,
      parentBoundarySeq: options.boundarySeq,
      origin,
      delegationDepth: origin === "delegation" ? parentDepth + 1 : parentDepth,
    },
    createdWith: options.createdWith,
  });
  return Object.freeze({ header, events: Object.freeze([...events]) });
}
