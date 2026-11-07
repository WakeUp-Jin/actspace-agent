import { describe, expect, it } from "vitest";
import type { RuntimeV2SessionSnapshot, SessionEventEnvelopeV1 } from "@actspace/shared/runtime-v2";
import { projectChatEvents, projectChatSession, projectSubagentTranscript } from "../sessions/chat.js";

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
  it("never shows journaled chunks of old Sessions, including orphans a crash left behind", () => {
    const journal = [
      envelope(1, "turn/start", { agentRunId: "run-1", turnId: "turn-1" }),
      envelope(2, "request/context", { requestId: "request-1", turnId: "turn-1", stepId: "step-1", snapshot: { prepared: {} } }),
      envelope(3, "assistant/chunk", { messageId: "a-1", requestId: "request-1", kind: "reasoning-delta", content: "think " }),
      envelope(4, "assistant/chunk", { messageId: "a-1", requestId: "request-1", kind: "assistant-delta", content: "line 1\n" }),
    ];
    expect(projectChatSession(snapshot([]), journal, "/w").events).toEqual([]);
    expect(projectSubagentTranscript(snapshot([]), journal)).toEqual([]);
  });

  it("adds the child's live baseline to the subagent transcript until the message settles", () => {
    const journal = [
      envelope(1, "assistant/message", { agentRunId: "run-1", messageId: "a-1", content: "complete" }, { kind: "append" }),
    ];
    const pending = { runId: "run-1", revision: 9, segments: [
      { kind: "text" as const, messageId: "a-1", text: "complete" },
      { kind: "thinking" as const, messageId: "a-2", text: "pondering" },
      { kind: "text" as const, messageId: "a-2", text: "next" },
    ] };
    const events = projectSubagentTranscript(snapshot(["a-1"]), journal, pending);
    expect(events.map(event => [event.type, (event.payload as { content?: string }).content])).toEqual([
      ["assistant_message", "complete"], ["thinking", "pondering"], ["assistant_message", "next"],
    ]);
    expect(projectSubagentTranscript(snapshot(["a-1"]), journal)).toEqual(projectChatSession(snapshot(["a-1"]), journal, "/w").events);
  });

  it("restores the complete pending command from durable call facts for a new observer", () => {
    const pending = { ...snapshot([]), tools: [{ callId: "pending", name: "bash", state: "running", artifacts: [], failure: null }] } as RuntimeV2SessionSnapshot;
    const command = `printf '%s' '${"long command ".repeat(400)}'`;
    const journal = [envelope(8, "tool/call", { agentRunId: "run-1", callId: "pending", name: "bash", args: { command, cwd: "/w" } })];
    const blocks = projectChatSession(pending, journal, "/w").messageBlocks!;
    expect(blocks).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "bash", command, status: "running" })]));
    expect(projectSubagentTranscript(pending, journal).filter(event => event.type === "tool_result")).toHaveLength(1);
  });
  it("drops a reasoning block that only holds a zero-width space", () => {
    const journal = [
      envelope(7, "assistant/message", { agentRunId: "run-1", messageId: "a-1", content: [{ type: "reasoning", text: "\u200B" }, { type: "text", text: "answer" }] },
        { kind: "append" }),
    ];
    const events = projectChatEvents(snapshot(["a-1"]), journal);
    expect(events.map((event) => event.type)).toEqual(["assistant_message"]);
  });
  it("stamps each projected event with the seq of the envelope it came from", () => {
    const journal = [
      envelope(4, "user/message", { agentRunId: "run-1", messageId: "u-1", content: "question" }, { kind: "append" }),
      envelope(7, "assistant/message", { agentRunId: "run-1", messageId: "a-1", content: [{ type: "reasoning", text: "thinking it over" }, { type: "text", text: "answer" }] },
        { kind: "append" }),
    ];
    const events = projectChatEvents(snapshot(["u-1", "a-1"]), journal);
    expect(events.map((event) => [event.type, event.agentRunId, event.sourceSeq])).toEqual([
      ["user_message", "run-1", 4],
      // 同一条 assistant envelope 投影出 thinking 和回复，两者共用 seq 7。
      ["thinking", "run-1", 7],
      ["assistant_message", "run-1", 7],
    ]);
  });
});
