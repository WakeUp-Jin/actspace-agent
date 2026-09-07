import type { SessionEventEnvelopeV1, SessionJournal, SessionSurfaceView } from "@actspace/session-journal";
import { effectiveSessionEvents } from "@actspace/session-journal";
import type { ProjectionChange, RuntimeV2ProjectionKey, RuntimeV2ProjectionRevision, SessionProjectionSnapshot } from "@actspace/shared/runtime-v2";

export const SESSION_PROJECTION_STATE_VERSION = 1 as const;
export const SESSION_PROJECTION_KEY = "session" as const satisfies RuntimeV2ProjectionKey;
export const SURFACE_PROJECTION_KEY = "surface" as const satisfies RuntimeV2ProjectionKey;

export type CanonicalSurfaceProjection = {
  readonly key: typeof SURFACE_PROJECTION_KEY;
  readonly stateVersion: typeof SESSION_PROJECTION_STATE_VERSION;
  readonly view: SessionSurfaceView;
};

/**
 * The only renderer-facing Surface adapter. SessionJournal owns Surface
 * eligibility and replacement validation; this function only packages its
 * already-folded view for projection consumers.
 */
export function projectCanonicalSurface(journal: Pick<SessionJournal, "surface">): CanonicalSurfaceProjection {
  return Object.freeze({
    key: SURFACE_PROJECTION_KEY,
    stateVersion: SESSION_PROJECTION_STATE_VERSION,
    view: journal.surface,
  });
}

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
    // Keep the projection runtime compatible with the older Node versions
    // still used by some workspace test runners; the event collection only
    // needs a last-element lookup and does not require Array.prototype.at.
    throughJournalSeq: events.length === 0 ? -1 : (events[events.length - 1]?.seq ?? -1),
    eventCount: effectiveSessionEvents(events).length,
    lastSeq: events.length - 1,
    surface,
    pendingInboxMessageIds: relations.pendingInboxMessageIds,
    openTurnId: relations.openTurnId,
    openStepId: relations.openStepId,
    openRequestIds: relations.openRequestIds,
  });
}

export type SessionProjectionRevision = RuntimeV2ProjectionRevision & {
  readonly projectionKey: typeof SESSION_PROJECTION_KEY;
  readonly stateVersion: typeof SESSION_PROJECTION_STATE_VERSION;
};

export function createSessionProjectionRevision(sessionId: string, throughJournalSeq: number): SessionProjectionRevision {
  if (sessionId.length === 0) throw new TypeError("Session projection requires a non-empty sessionId.");
  if (!Number.isSafeInteger(throughJournalSeq) || throughJournalSeq < -1) throw new TypeError("Session projection seq must be an integer >= -1.");
  return Object.freeze({
    schemaVersion: SESSION_PROJECTION_STATE_VERSION,
    sessionId,
    throughJournalSeq,
    projectionKey: SESSION_PROJECTION_KEY,
    stateVersion: SESSION_PROJECTION_STATE_VERSION,
  });
}

export function toSessionProjectionSnapshot(
  projection: SessionProjection,
): SessionProjectionSnapshot {
  const values = Object.freeze({
    [SESSION_PROJECTION_KEY]: projection,
  });
  return Object.freeze({
    kind: "session-projection",
    schemaVersion: SESSION_PROJECTION_STATE_VERSION,
    sessionId: projection.sessionId,
    throughJournalSeq: projection.throughJournalSeq,
    values,
  });
}

export function toProjectionChange(
  projection: SessionProjection,
  changedKeys: readonly RuntimeV2ProjectionKey[] = [SESSION_PROJECTION_KEY],
): ProjectionChange {
  return Object.freeze({
    kind: "projection-change",
    revision: createSessionProjectionRevision(projection.sessionId, projection.throughJournalSeq),
    changedKeys: Object.freeze([...new Set(changedKeys)]),
    values: Object.freeze({ [SESSION_PROJECTION_KEY]: projection }),
  });
}
