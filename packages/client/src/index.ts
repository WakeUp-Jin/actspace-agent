import type { RuntimeV2LiveEvent, RuntimeV2SessionSnapshot } from "@actspace/shared/runtime-v2";

export type ClientProjectionBoundary = {
  readonly schemaVersion: 1;
  readonly sessionId: string;
  readonly snapshot: RuntimeV2SessionSnapshot;
};

export type ClientLiveEventBoundary = RuntimeV2LiveEvent;

export function toClientProjection(snapshot: RuntimeV2SessionSnapshot): ClientProjectionBoundary {
  return Object.freeze({ schemaVersion: 1, sessionId: snapshot.sessionId, snapshot });
}
