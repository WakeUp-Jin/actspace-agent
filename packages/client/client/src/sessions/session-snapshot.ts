import type {
  RuntimeEventWindow,
  RuntimeJsonValue,
  RuntimeSessionSnapshot,
  RuntimeReadModelWatermarks,
} from "@actspace/shared/runtime-v2";

export type ClientSessionSnapshot = RuntimeSessionSnapshot;

export type ClientSessionStatus = "idle" | "loading" | "ready" | "stale" | "error";

export type ClientSessionCell = {
  readonly sessionId: string;
  readonly snapshot: ClientSessionSnapshot | null;
  readonly window: RuntimeEventWindow | null;
  readonly deferredToolCalls: readonly string[];
  readonly status: ClientSessionStatus;
  readonly error: string | null;
  readonly requestGeneration: number;
  readonly runtimeInstanceId: string | null;
  readonly lastLiveSeq: number;
  readonly liveGap: boolean;
  readonly projectionValues: Readonly<Record<string, RuntimeJsonValue>>;
  readonly projectionRevisions: Readonly<Record<string, number>>;
  readonly watermarks: RuntimeReadModelWatermarks | null;
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
