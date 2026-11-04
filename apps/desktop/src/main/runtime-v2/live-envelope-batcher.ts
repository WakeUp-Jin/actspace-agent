import type { RuntimeV2DesktopLiveEnvelope } from "@actspace/shared/runtime-v2";

/** Window in which consecutive stream chunks share one IPC message. */
export const LIVE_BATCH_INTERVAL_MS = 33;

/** A journal chunk is the only envelope that arrives per streamed token; everything else is rare and goes out at once. */
export function isStreamChunkEnvelope(envelope: RuntimeV2DesktopLiveEnvelope): boolean {
  const event = envelope.event;
  return event.kind === "journal-update" && event.update?.event.type === "assistant/chunk";
}

/**
 * Collapses runs of consecutive chunk envelopes into one message every `intervalMs`.
 * Order is preserved: a non-chunk envelope flushes the pending chunks before it is sent.
 * The batch message is the last envelope plus `batch` (all of them, oldest first); a lone chunk is sent as is.
 */
export class LiveEnvelopeBatcher {
  readonly #pending: RuntimeV2DesktopLiveEnvelope[] = [];
  #timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private readonly send: (message: RuntimeV2DesktopLiveEnvelope) => void, private readonly intervalMs = LIVE_BATCH_INTERVAL_MS) {}

  push(envelope: RuntimeV2DesktopLiveEnvelope): void {
    if (!isStreamChunkEnvelope(envelope)) { this.flush(); this.send(envelope); return; }
    this.#pending.push(envelope);
    this.#timer ??= setTimeout(() => { this.#timer = undefined; this.flush(); }, this.intervalMs);
  }

  /** Send what is pending now. Safe to call at any time (run end, abort, window close). */
  flush(): void {
    if (this.#timer !== undefined) { clearTimeout(this.#timer); this.#timer = undefined; }
    if (this.#pending.length === 0) return;
    const batch = this.#pending.splice(0);
    const last = batch[batch.length - 1]!;
    this.send(batch.length === 1 ? last : { ...last, batch });
  }

  dispose(): void { this.flush(); }
}
