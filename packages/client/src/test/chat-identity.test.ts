import { describe, expect, it } from "vitest";
import type { RuntimeV2SessionSnapshot, SessionEventEnvelopeV1 } from "@actspace/shared/runtime-v2";
import { projectChatEvents, projectSubagentList, projectChatSession, projectSubagentTranscript } from "../sessions/chat.js";

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
  it("recovers pending text and reasoning in Journal order without changing ordinary live projections", () => {
    const journal = [
      envelope(1, "turn/start", { agentRunId: "run-1", turnId: "turn-1" }),
      envelope(2, "request/context", { requestId: "request-1", turnId: "turn-1", stepId: "step-1", snapshot: { prepared: {} } }),
      envelope(3, "assistant/chunk", { messageId: "a-1", requestId: "request-1", kind: "reasoning-delta", content: "think " }),
      envelope(4, "assistant/chunk", { messageId: "a-1", requestId: "request-1", kind: "assistant-delta", content: "line 1\n" }),
      envelope(5, "assistant/chunk", { messageId: "a-1", requestId: "request-1", kind: "assistant-delta", content: "line 2\n" }),
      envelope(6, "assistant/chunk", { messageId: "a-1", requestId: "request-1", kind: "reasoning-delta", content: "more" }),
    ];
    expect(projectChatSession(snapshot([]), journal, "/w").events).toEqual([]);
    const recovered = projectChatSession(snapshot([]), journal, "/w", { includePendingChunks: true });
    expect(recovered.events).toMatchObject([
      { type: "thinking", agentRunId: "run-1", turnId: "turn-1", llmCallId: "request-1", payload: { content: "think more" } },
      { type: "assistant_message", agentRunId: "run-1", payload: { content: "line 1\nline 2\n" } },
    ]);
    expect(recovered.events.every(event => event.sourceSeq === undefined)).toBe(true);
    expect(recovered.messageBlocks).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "assistant", content: "line 1\nline 2\n" })]));
  });

  it("replaces recovered chunks with the completed message exactly once", () => {
    const journal = [
      envelope(1, "assistant/chunk", { agentRunId: "run-1", messageId: "a-1", kind: "assistant-delta", content: "partial" }),
      envelope(2, "assistant/message", { agentRunId: "run-1", messageId: "a-1" }, { kind: "append", node: { kind: "assistant", messageId: "a-1", content: "complete" } }),
      envelope(3, "assistant/chunk", { agentRunId: "run-2", messageId: "a-2", kind: "assistant-delta", content: "next" }),
    ];
    const events = projectChatSession(snapshot(["a-1"]), journal, "/w", { includePendingChunks: true }).events;
    expect(events.map(event => [event.type, (event.payload as { content?: string }).content])).toEqual([
      ["assistant_message", "complete"], ["assistant_message", "next"],
    ]);
    expect(projectSubagentTranscript(snapshot(["a-1"]), journal)).toEqual(events);
  });

  it("restores the complete pending command from durable call facts for a new observer", () => {
    const pending = { ...snapshot([]), tools: [{ callId: "pending", name: "bash", state: "running", artifacts: [], failure: null }] } as RuntimeV2SessionSnapshot;
    const command = `printf '%s' '${"long command ".repeat(400)}'`;
    const journal = [envelope(8, "tool/call", { agentRunId: "run-1", callId: "pending", name: "bash", args: { command, cwd: "/w" } })];
    const blocks = projectChatSession(pending, journal, "/w").messageBlocks!;
    expect(blocks).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "bash", command, status: "running" })]));
    expect(projectSubagentTranscript(pending, journal).filter(event => event.type === "tool_result")).toHaveLength(1);
  });
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
