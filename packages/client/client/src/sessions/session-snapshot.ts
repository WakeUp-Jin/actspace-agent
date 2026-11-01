import type { RuntimeV2EventWindow, RuntimeV2JsonValue, RuntimeV2SessionSnapshot, RuntimeV2ReadModelWatermarks } from "@actspace/shared/runtime-v2";

export type ClientSessionSnapshot = RuntimeV2SessionSnapshot;

export type ClientSessionStatus = "idle" | "loading" | "ready" | "stale" | "error";

export type ClientSessionCell = {
  readonly sessionId: string;
  readonly snapshot: ClientSessionSnapshot | null;
  readonly window: RuntimeV2EventWindow | null;
  readonly deferredToolCalls: readonly string[];
  readonly status: ClientSessionStatus;
  readonly error: string | null;
  readonly requestGeneration: number;
  readonly runtimeInstanceId: string | null;
  readonly lastLiveSeq: number;
  readonly liveGap: boolean;
  readonly projectionValues: Readonly<Record<string, RuntimeV2JsonValue>>;
  readonly projectionRevisions: Readonly<Record<string, number>>;
  readonly watermarks: RuntimeV2ReadModelWatermarks | null;
};

export function emptyClientSessionCell(sessionId: string): ClientSessionCell {
  return Object.freeze({
    sessionId,
    snapshot: null,
    window: null,
    deferredToolCalls: [],
    status: "idle",
    error: null,
    requestGeneration: 0,
    runtimeInstanceId: null,
    lastLiveSeq: -1,
    liveGap: false,
    projectionValues: {},
    projectionRevisions: {},
    watermarks: null,
  });
}
