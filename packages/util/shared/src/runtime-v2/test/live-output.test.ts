import { describe, expect, it } from "vitest";
import { LiveOutputBuffer, mergePieces } from "../live-output";

const delta = (
  sessionId: string,
  agentRunId: string,
  messageId: string,
  message: string,
  kind: "assistant-delta" | "reasoning-delta" = "assistant-delta",
) => ({ kind, sessionId, agentRunId, messageId, message, requestId: "q", turnId: "t" });

describe("live output buffer", () => {
  it("accumulates text and thinking per message, merging consecutive pieces into one segment", () => {
    const buffer = new LiveOutputBuffer();
    expect(buffer.accept(delta("s", "r", "m1", "想", "reasoning-delta"))).toBe(1);
    expect(buffer.accept(delta("s", "r", "m1", "一想", "reasoning-delta"))).toBe(2);
    expect(buffer.accept(delta("s", "r", "m1", "你好"))).toBe(3);
    expect(buffer.accept(delta("s", "r", "m1", "，世界"))).toBe(4);
    expect(buffer.baseline("s")).toEqual({
      runId: "r",
      revision: 4,
      segments: [
        { kind: "thinking", messageId: "m1", requestId: "q", text: "想一想" },
        { kind: "text", messageId: "m1", requestId: "q", text: "你好，世界" },
      ],
    });
  });

  it("ignores everything except non-empty text and reasoning deltas", () => {
    const buffer = new LiveOutputBuffer();
    expect(buffer.accept({ kind: "run-state", sessionId: "s", agentRunId: "r", message: "running" })).toBeNull();
    expect(
      buffer.accept({ kind: "tool-call-delta", sessionId: "s", agentRunId: "r", messageId: "m", argumentsDelta: "{}" }),
    ).toBeNull();
    expect(buffer.accept(delta("s", "r", "m", ""))).toBeNull();
    expect(buffer.accept(null)).toBeNull();
    expect(buffer.revision).toBe(0);
    expect(buffer.baseline("s")).toEqual({ runId: null, revision: 0, segments: [] });
  });

  it("drops a settled message but keeps the revision, so frames up to it are still cut", () => {
    const buffer = new LiveOutputBuffer();
    buffer.accept(delta("s", "r", "m1", "first"));
    buffer.accept(delta("s", "r", "m2", "second"));
    buffer.settle("s", "m1");
    expect(buffer.baseline("s")).toEqual({
      runId: "r",
      revision: 2,
      segments: [{ kind: "text", messageId: "m2", requestId: "q", text: "second" }],
    });
    buffer.settle("s", "m2");
    expect(buffer.baseline("s")).toEqual({ runId: "r", revision: 2, segments: [] });
  });

  it("starts over when the run changes and clears only the run it was asked to", () => {
    const buffer = new LiveOutputBuffer();
    buffer.accept(delta("s", "r1", "m1", "old"));
    buffer.accept(delta("s", "r2", "m2", "new"));
    expect(buffer.baseline("s")).toEqual({
      runId: "r2",
      revision: 2,
      segments: [{ kind: "text", messageId: "m2", requestId: "q", text: "new" }],
    });
    buffer.clear("s", "r1");
    expect(buffer.baseline("s").runId).toBe("r2");
    buffer.clear("s", "r2");
    expect(buffer.baseline("s")).toEqual({ runId: null, revision: 2, segments: [] });
  });

  it("keeps one monotonic revision across sessions and runs", () => {
    const buffer = new LiveOutputBuffer();
    buffer.accept(delta("a", "r", "m", "x"));
    buffer.accept(delta("b", "r", "m", "y"));
    buffer.clear("a");
    expect(buffer.accept(delta("a", "r2", "m", "z"))).toBe(3);
    expect(buffer.baseline("b").revision).toBe(3);
  });

  it("splits a long delta into pieces and pages them by revision", () => {
    const buffer = new LiveOutputBuffer();
    const long = "a".repeat(8192 * 5 + 10);
    expect(buffer.accept(delta("s", "r", "m", long))).toBe(6);
    expect(buffer.describe("s")).toEqual({ runId: "r", revision: 6 });
    const first = buffer.page("s", "r", 0)!;
    expect(first.chunks.map((piece) => piece.revision)).toEqual([1, 2, 3, 4]);
    expect(first.next).toBe(4);
    const second = buffer.page("s", "r", first.next)!;
    expect(second.chunks.map((piece) => piece.revision)).toEqual([5, 6]);
    expect(buffer.page("s", "r", second.next)!.chunks).toEqual([]);
    expect(mergePieces([...first.chunks, ...second.chunks])).toEqual([
      { kind: "text", messageId: "m", requestId: "q", text: long },
    ]);
    expect(buffer.page("s", "other-run", 0)).toBeNull();
    expect(buffer.page("missing", "r", 0)).toBeNull();
  });
});
