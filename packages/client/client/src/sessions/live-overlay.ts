import type { RuntimeV2LiveEvent } from "@actspace/shared/runtime-v2";

export type ClientLiveOverlay = {
  readonly runtimeInstanceId: string;
  readonly liveSeq: number;
  readonly throughJournalSeq: number;
  readonly kind: RuntimeV2LiveEvent["kind"];
  readonly message: string | null;
  readonly callId: string | null;
  readonly phase: RuntimeV2LiveEvent["phase"] | null;
};

export function liveOverlayFromEvent(event: RuntimeV2LiveEvent): ClientLiveOverlay {
  return Object.freeze({
    runtimeInstanceId: event.runtimeInstanceId,
    liveSeq: event.liveSeq,
    throughJournalSeq: event.throughJournalSeq,
    kind: event.kind,
    message: event.message ?? null,
    callId: event.callId ?? null,
    phase: event.phase ?? null,
  });
}
