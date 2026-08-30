import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";
import type { SessionSurfaceView } from "@actspace/session-journal";
import { effectiveSessionEvents } from "@actspace/session-journal";

export type SessionProjection = {
  readonly eventCount: number;
  readonly lastSeq: number;
  readonly surface: SessionSurfaceView;
  readonly pendingInboxMessageIds: readonly string[];
  readonly openTurnId: string | null;
  readonly openStepId: string | null;
  readonly openRequestIds: readonly string[];
};

export function createSessionProjection(
  events: readonly SessionEventEnvelopeV1[],
  surface: SessionSurfaceView,
  relations: {
    readonly pendingInboxMessageIds: readonly string[];
    readonly openTurnId: string | null;
    readonly openStepId: string | null;
    readonly openRequestIds: readonly string[];
  },
): SessionProjection {
  return Object.freeze({
    eventCount: effectiveSessionEvents(events).length,
    lastSeq: events.length - 1,
    surface,
    pendingInboxMessageIds: relations.pendingInboxMessageIds,
    openTurnId: relations.openTurnId,
    openStepId: relations.openStepId,
    openRequestIds: relations.openRequestIds,
  });
}
