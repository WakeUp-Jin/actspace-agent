import type { SessionEventEnvelopeV1, SessionSurfaceView } from "@actspace/session-journal";
import { effectiveSessionEvents } from "@actspace/session-journal";

export const SESSION_PROJECTION_STATE_VERSION = 1 as const;
export type SessionProjection = {
  readonly kind: "session-projection";
  readonly schemaVersion: typeof SESSION_PROJECTION_STATE_VERSION;
  readonly sessionId: string;
  readonly throughJournalSeq: number;
  readonly eventCount: number;
  readonly lastSeq: number;
  readonly surface: SessionSurfaceView;
  readonly pendingInboxMessageIds: readonly string[];
  readonly openTurnId: string | null;
  readonly openStepId: string | null;
  readonly openRequestIds: readonly string[];
};

export function createSessionProjection(
  sessionId: string,
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
    kind: "session-projection",
    schemaVersion: SESSION_PROJECTION_STATE_VERSION,
    sessionId,
    throughJournalSeq: events.at(-1)?.seq ?? -1,
    eventCount: effectiveSessionEvents(events).length,
    lastSeq: events.length - 1,
    surface,
    pendingInboxMessageIds: relations.pendingInboxMessageIds,
    openTurnId: relations.openTurnId,
    openStepId: relations.openStepId,
    openRequestIds: relations.openRequestIds,
  });
}
