import { describe, expect, it } from "vitest";
import { appendOrMergeSegment, createCompactionBlock, createEmptyStreamingState, streamingStateToBlocks } from "@actspace/client/live";

// 14 T13：每个 live 块都带所属 run 的 runId。
describe("live block identity", () => {
  it("stamps every live block with the run it belongs to", () => {
    const state = createEmptyStreamingState();
    state.segments.push(
      { type: "user_message", block: { kind: "user", id: "turn:run-1:steer:m-1", content: "steer", createdAt: "2026-10-06T00:00:00.000Z" } },
      { type: "thinking", text: "thinking" },
      { type: "text", text: "reply" },
      { type: "tool", toolCallId: "call-1" },
      { type: "compaction", agentRunId: "run-1" },
      { type: "workspace_preparation", agentRunId: "run-1" },
    );
    state.activeTools.set("call-1", { toolName: "read", preview: { kind: "read", filePath: "a.ts", displayText: "Read a.ts" } as never });
    state.activeCompactions.set("run-1", createCompactionBlock({ agentRunId: "run-1", status: "running" }));
    state.activeWorkspacePreparations.set("run-1", { kind: "workspace_preparation", id: "turn:run-1:workspace-preparation:0", status: "running", sourceWorkspaceRoot: "/w", baseBranch: "main", createdAt: "2026-10-06T00:00:00.000Z" });
    state.waitingForModel = true;

    const blocks = streamingStateToBlocks(state, "run-1");
    expect(blocks.map((block) => block.kind)).toEqual(["user", "thinking", "assistant", "read", "context_compaction", "workspace_preparation", "status"]);
    expect(blocks.every((block) => block.runId === "run-1")).toBe(true);
    expect(blocks.some((block) => "sourceSeq" in block)).toBe(false);
  });

  it("skips a streaming thinking segment that only holds a zero-width space", () => {
    const state = createEmptyStreamingState();
    state.segments.push({ type: "thinking", text: "\u200B" }, { type: "text", text: "reply" });
    expect(streamingStateToBlocks(state, "run-1").map((block) => block.kind)).toEqual(["assistant"]);
  });

  it("times a finished thinking segment from its first to its last delta", () => {
    const state = createEmptyStreamingState();
    appendOrMergeSegment(state.segments, "thinking", "先看", {}, 1000);
    appendOrMergeSegment(state.segments, "thinking", "代码。", {}, 4000);
    state.segments.push({ type: "tool", toolCallId: "call-1" });
    state.activeTools.set("call-1", { toolName: "read", preview: { kind: "read", filePath: "a.ts", displayText: "Read a.ts" } as never });
    const [thinking] = streamingStateToBlocks(state, "run-1");
    expect(thinking).toMatchObject({ kind: "thinking", status: "completed", startedAtMs: 1000, durationMs: 3000 });
  });

  it("counts a single-delta finished thinking as one second, and leaves a running one untimed", () => {
    const state = createEmptyStreamingState();
    appendOrMergeSegment(state.segments, "thinking", "短。", {}, 5000);
    appendOrMergeSegment(state.segments, "text", "reply", {}, 5000);
    appendOrMergeSegment(state.segments, "thinking", "又想了一下", { messageId: "m-2" }, 7000);
    const blocks = streamingStateToBlocks(state, "run-1");
    expect(blocks[0]).toMatchObject({ kind: "thinking", status: "completed", durationMs: 1000 });
    expect(blocks[2]).toMatchObject({ kind: "thinking", status: "running", startedAtMs: 7000 });
    expect(blocks[2]).not.toHaveProperty("durationMs");
  });

  it("keeps a compaction block's own runId, and leaves blocks unstamped without a run", () => {
    expect(createCompactionBlock({ agentRunId: "compact-task", status: "failed" }).runId).toBe("compact-task");
    const state = createEmptyStreamingState();
    state.segments.push({ type: "text", text: "orphan" });
    expect(streamingStateToBlocks(state)[0]).not.toHaveProperty("runId");
  });
});
