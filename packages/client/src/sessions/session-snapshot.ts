import type { RuntimeV2JsonValue, RuntimeV2SessionSnapshot } from "@actspace/shared/runtime-v2";

export type ClientSessionSnapshot = RuntimeV2SessionSnapshot;

export type ClientSessionStatus = "idle" | "loading" | "ready" | "stale" | "error";

export type ClientSessionCell = {
  readonly sessionId: string;
  readonly snapshot: ClientSessionSnapshot | null;
  readonly status: ClientSessionStatus;
  readonly error: string | null;
  readonly requestGeneration: number;
  readonly runtimeInstanceId: string | null;
  readonly lastLiveSeq: number;
  readonly liveGap: boolean;
  readonly projectionValues: Readonly<Record<string, RuntimeV2JsonValue>>;
  readonly projectionRevisions: Readonly<Record<string, number>>;
};

export function emptyClientSessionCell(sessionId: string): ClientSessionCell {
  return Object.freeze({
    sessionId,
    snapshot: null,
    status: "idle",
    error: null,
    requestGeneration: 0,
    runtimeInstanceId: null,
    lastLiveSeq: -1,
    liveGap: false,
    projectionValues: {},
    projectionRevisions: {},
  });
}
