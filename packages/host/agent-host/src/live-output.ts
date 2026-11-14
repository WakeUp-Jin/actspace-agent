import { HostError, HostRequestError } from "@actspace/shared/host-protocol";
import { LiveOutputBuffer, type LiveOutputPage } from "@actspace/shared/runtime-v2";
/**
 * Transient text until the journal records the completed message (agent-spec-live-assistant-stream §5).
 * Pages are addressed by revision, so a message settling between pages never shifts what a client reads next.
 */
export class HostLiveOutput {
  readonly #buffer = new LiveOutputBuffer();
  /** Returns the live revision of a text/reasoning delta, null for other events. */
  accept(event: unknown): number | null {
    return this.#buffer.accept(event);
  }
  settle(sessionId: string, messageId: string): void {
    this.#buffer.settle(sessionId, messageId);
  }
  describe(sessionId: string) {
    return this.#buffer.describe(sessionId);
  }
  page(sessionId: string, runId: string, afterRevision: number): LiveOutputPage {
    if (!Number.isSafeInteger(afterRevision) || afterRevision < 0)
      throw new HostRequestError("Invalid output revision");
    const page = this.#buffer.page(sessionId, runId, afterRevision);
    if (!page) throw new HostError("CONFLICT", "Output belongs to another Run; refresh snapshot", true);
    return page;
  }
  clear(sessionId: string, runId: string) {
    this.#buffer.clear(sessionId, runId);
  }
}
