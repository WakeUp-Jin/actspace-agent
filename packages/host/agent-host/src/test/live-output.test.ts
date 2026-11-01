import { expect, it } from "vitest";
import { HostLiveOutput } from "../live-output.js";
it("pages a large current reply without truncating or mixing another Run", () => {
  const output = new HostLiveOutput(), text = "内容🙂".repeat(200000);
  output.accept({ sessionId: "s", agentRunId: "r", kind: "assistant-delta", messageId: "m", message: text });
  let offset = 0, restored = "";
  const size = output.describe("s")!.chunks;
  while (offset < size) {
    const page = output.page("s", "r", offset);
    expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThan(1024 * 1024);
    restored += page.chunks.map(chunk => chunk.text).join(""); offset = page.next;
  }
  expect(restored).toBe(text);
  expect(() => output.page("s", "other", 0)).toThrow("another Run");
  output.clear("s", "other"); expect(output.describe("s")).not.toBeNull();
  output.clear("s", "r"); expect(output.describe("s")).toBeNull();
});
