import { expect, it } from "vitest";
import { HostLiveOutput } from "../live-output.js";
const delta = (messageId: string, message: string, kind = "assistant-delta", agentRunId = "r") => ({ sessionId: "s", agentRunId, kind, messageId, message });
function replay(output: HostLiveOutput, runId: string, through: number) {
  let after = 0, restored = "";
  while (after < through) {
    const page = output.page("s", runId, after);
    expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThan(1024 * 1024);
    if (page.chunks.length === 0) break;
    restored += page.chunks.filter(chunk => chunk.revision <= through).map(chunk => chunk.text).join(""); after = page.next;
  }
  return restored;
}
it("pages a large current reply by revision without truncating or mixing another Run", () => {
  const output = new HostLiveOutput(), text = "内容🙂".repeat(200000);
  const revision = output.accept(delta("m", text))!;
  expect(output.describe("s")).toEqual({ runId: "r", revision });
  expect(replay(output, "r", revision)).toBe(text);
  expect(() => output.page("s", "other", 0)).toThrow("another Run");
  output.clear("s", "other"); expect(output.describe("s")).not.toBeNull();
  output.clear("s", "r"); expect(output.describe("s")).toBeNull();
});
it("drops a settled message, keeps paging stable across a settle, and ignores non-text events", () => {
  const output = new HostLiveOutput();
  expect(output.accept({ sessionId: "s", agentRunId: "r", kind: "run-state", message: "started" })).toBeNull();
  output.accept(delta("a", "first ")); output.accept(delta("a", "reply"));
  const through = output.accept(delta("b", "thinking", "reasoning-delta"))!;
  const first = output.page("s", "r", 0);
  output.settle("s", "a");
  // The next page continues after the last revision it returned; the settled text is gone, nothing shifts.
  expect(output.page("s", "r", first.next).chunks).toEqual([]);
  expect(replay(output, "r", through)).toBe("thinking");
  const later = output.accept(delta("b", "!", "reasoning-delta"))!;
  expect(later).toBeGreaterThan(through);
});
