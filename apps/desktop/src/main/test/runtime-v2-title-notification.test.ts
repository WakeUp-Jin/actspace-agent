// @vitest-environment node
import { expect, it, vi } from "vitest";
import { observeSessionRevisions } from "../runtime-v2/session-revision-observer";

it("preserves title changes when later journal events are coalesced", async () => {
  let listener!: (this: { sessionId: string }, event: { seq: number; type: string }) => void;
  const publish = vi.fn();
  const stop = observeSessionRevisions({ on: (_name: string, callback: typeof listener) => { listener = callback; return () => undefined; } } as unknown as Parameters<typeof observeSessionRevisions>[0], publish);
  try {
    listener.call({ sessionId: "s" }, { seq: 1, type: "session/title-set" });
    listener.call({ sessionId: "s" }, { seq: 2, type: "assistant/message" });
    await vi.waitFor(() => expect(publish).toHaveBeenCalledWith("s", 2, true));
    listener.call({ sessionId: "s" }, { seq: 3, type: "assistant/message" });
    await vi.waitFor(() => expect(publish).toHaveBeenLastCalledWith("s", 3, false));
  } finally { stop(); }
});
