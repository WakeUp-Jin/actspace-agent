import type { RuntimeLiveEvent } from "@actspace/shared/runtime-v2";

export type ClientLiveOverlay = {
  readonly runtimeInstanceId: string;
  readonly liveSeq: number;
  readonly throughJournalSeq: number;
  readonly kind: RuntimeLiveEvent["kind"];
  readonly message: string | null;
  readonly callId: string | null;
  readonly phase: RuntimeLiveEvent["phase"] | null;
};

export function liveOverlayFromEvent(event: RuntimeLiveEvent): ClientLiveOverlay {
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
