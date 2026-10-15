import { describe, expect, it } from "vitest";
import type { RuntimeV2SessionSnapshot, SessionEventEnvelopeV1 } from "@actspace/shared/runtime-v2";
import { projectChatEvents, projectSubagentList } from "../sessions/chat.js";

// 14 T12：投影出的事件带来源 envelope 的 seq；由多条 envelope 合成的 subagent 块只带 runId。
function snapshot(messageIds: string[]): RuntimeV2SessionSnapshot {
  return {
    kind: "session-snapshot", schemaVersion: 1, sessionId: "s", createdAt: "2026-10-06T00:00:00.000Z", updatedAt: "2026-10-06T00:00:00.000Z", workspaceRoot: null, throughJournalSeq: 3, permissionMode: "default", accessState: "read-write",
    agentForm: "agent", metadata: { title: null, pinned: false, archived: false },
    messages: messageIds.map((messageId, index) => ({ kind: index === 0 ? "user" : "assistant", messageId, content: "" })),
    tools: [], pendingInbox: [], todos: [], delegations: [], usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0, costUsd: null },
    activity: { turnCount: 1, completedTurnCount: 1, stepCount: 0, activeTurnId: null, activeStepId: null, compactionCount: 0, activeCompactionId: null, lastCompactionSummary: null, timing: { llmMs: 0, ttftMs: 0, ttftSteps: 0, decodeMs: 0, decodeTokens: 0 } }, lineage: null,
  };
}

function envelope(seq: number, type: string, data: SessionEventEnvelopeV1["data"], surface: SessionEventEnvelopeV1["surface"] = null): SessionEventEnvelopeV1 {
  return { recordKind: "event", seq, type, eventVersion: 1, criticality: "required", time: "2026-10-06T00:00:00.000Z", source: { ownerPluginId: "@actspace/core" }, data, surface, provenance: { sourceEventSeqs: [], contributorIds: [], runtimeSelectionSeq: null } };
}

describe("chat projection identity", () => {
  it("stamps each projected event with the seq of the envelope it came from", () => {
    const journal = [
      envelope(4, "user/message", { agentRunId: "run-1", messageId: "u-1", content: "question" }, { kind: "append", node: { kind: "user", messageId: "u-1", content: "question" } }),
      envelope(7, "assistant/message", { agentRunId: "run-1", messageId: "a-1", content: "answer" },
        { kind: "append", node: { kind: "assistant", messageId: "a-1", content: [{ type: "reasoning", text: "thinking it over" }, { type: "text", text: "answer" }] } }),
    ];
    const events = projectChatEvents(snapshot(["u-1", "a-1"]), journal);
    expect(events.map((event) => [event.type, event.agentRunId, event.sourceSeq])).toEqual([
      ["user_message", "run-1", 4],
      // 同一条 assistant envelope 投影出 thinking 和回复，两者共用 seq 7。
      ["thinking", "run-1", 7],
      ["assistant_message", "run-1", 7],
    ]);
  });

  it("leaves sourceSeq off the synthetic subagent block, which spans several envelopes", () => {
    const journal = [
      envelope(2, "tool/call", { agentRunId: "run-1", callId: "call-agent", name: "agent", args: { description: "Explore", prompt: "look" } }),
      envelope(5, "tool/result", { agentRunId: "run-1", callId: "call-agent", name: "agent", status: "completed", summary: "done" }),
    ];
    const blocks = projectSubagentList(snapshot([]), journal);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ id: "subagent:call-agent", runId: "run-1" });
    expect("sourceSeq" in blocks[0]!).toBe(false);
  });
});
