import type { MessageBlock } from "@actspace/shared";
import { approvalAnchorIndex, buildTranscript, exploreSummary, mergeTranscript, toolBlockForCall } from "../transcript-model";

const at = "2026-10-17T00:00:00.000Z";
const user = (id: string, runId = "r1"): MessageBlock => ({ kind: "user", id, runId, content: id, createdAt: at });
const text = (id: string, content: string, extra: Partial<MessageBlock> = {}): MessageBlock => ({ kind: "assistant", id, content, createdAt: at, ...extra } as MessageBlock);
const read = (id: string, renderKey?: string): MessageBlock => ({ kind: "read", id, filePath: `/a/${id}`, displayText: id, createdAt: at, ...(renderKey ? { renderKey } : {}) });
const grep = (id: string): MessageBlock => ({ kind: "grep", id, pattern: "x", displayText: id, createdAt: at });
const bash = (id: string, renderKey: string): MessageBlock => ({ kind: "bash", id, renderKey, createdAt: at, status: "running", title: "bash", command: "ls" });

it("groups adjacent explore blocks and counts files and searches", () => {
  const items = buildTranscript([user("u"), read("a"), read("b"), grep("c"), text("t", "done"), read("d")], { blocks: [], runId: null });
  expect(items.map(item => item.type)).toEqual(["block", "explore", "block", "explore"]);
  const first = items[1]!;
  expect(first.type === "explore" && exploreSummary(first.blocks)).toEqual({ files: 2, searches: 1, running: false });
});

it("returns an empty transcript for an empty session", () => {
  expect(buildTranscript([], { blocks: [], runId: null })).toEqual([]);
});

it("replaces live tool blocks and duplicated text once they are durable", () => {
  const durable = [user("u"), text("e1", "hello", { runId: "r1", renderKey: "turn:r1:assistant:0" }), bash("e2", "turn:r1:tool:c1")];
  const live = [text("turn:r1:assistant:0", "hello"), bash("turn:r1:tool:c1", "turn:r1:tool:c1"), text("turn:r1:assistant:1", "wor")];
  const entries = mergeTranscript(durable, { blocks: live, runId: "r1" });
  expect(entries.map(entry => entry.block.kind === "assistant" ? entry.block.content : entry.block.kind)).toEqual(["user", "hello", "bash", "wor"]);
});

it("keeps in-flight text of a run joined midway even if its key collides with durable text", () => {
  const durable = [text("e1", "old", { runId: "r1", renderKey: "turn:r1:assistant:0" })];
  const live = [text("turn:r1:assistant:0", "streaming")];
  const entries = mergeTranscript(durable, { blocks: live, runId: "r1" });
  expect(entries).toHaveLength(2);
  expect(new Set(entries.map(entry => entry.key)).size).toBe(2);
});

it("never shows live user blocks", () => {
  expect(mergeTranscript([user("u")], { blocks: [user("steer")], runId: "r1" })).toHaveLength(1);
});

it("locates the tool block and anchor index of an approval call", () => {
  const items = buildTranscript([user("u"), bash("e", "turn:r1:tool:c9"), text("t", "x")], { blocks: [], runId: null });
  expect(approvalAnchorIndex(items, "c9")).toBe(1);
  expect(approvalAnchorIndex(items, "nope")).toBe(-1);
  expect(toolBlockForCall(items, "c9")?.kind).toBe("bash");
});
