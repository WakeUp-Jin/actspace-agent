import { describe, expect, it } from "vitest";
import type { RuntimeV2SessionSnapshot, SessionEventEnvelopeV1 } from "@actspace/shared/runtime-v2";
import { projectChatSession, projectSubagentList, subagentChildrenWithoutModel } from "../sessions/chat.js";
import { FixedRendererStreamAdapter } from "../live/stream-adapter.js";

// S3 第 7 步：agent 卡片读 subagent/* 新事件；五个管理工具的行名；收件箱两种新来源转成 BackgroundNotice。
function snapshot(toolCallIds: readonly string[] = []): RuntimeV2SessionSnapshot {
  return {
    kind: "session-snapshot", schemaVersion: 1, sessionId: "s", createdAt: "2026-11-04T00:00:00.000Z", updatedAt: "2026-11-04T00:00:00.000Z", workspaceRoot: null, throughJournalSeq: 20, permissionMode: "default", accessState: "read-write",
    agentForm: "agent", metadata: { title: null, pinned: false, archived: false },
    messages: toolCallIds.map(callId => ({ kind: "tool-result", messageId: `result-${callId}`, callId, content: "" })) as RuntimeV2SessionSnapshot["messages"], tools: [], pendingInbox: [], todos: [], delegations: [], usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0, costUsd: null },
    activity: { turnCount: 1, completedTurnCount: 1, stepCount: 0, activeTurnId: null, activeStepId: null, compactionCount: 0, activeCompactionId: null, lastCompactionSummary: null, timing: { llmMs: 0, ttftMs: 0, ttftSteps: 0, decodeMs: 0, decodeTokens: 0 } }, lineage: null,
  };
}

function envelope(seq: number, type: string, data: SessionEventEnvelopeV1["data"]): SessionEventEnvelopeV1 {
  return { recordKind: "event", seq, type, eventVersion: 1, criticality: "required", time: "2026-11-04T00:00:00.000Z", source: { ownerPluginId: "@actspace/core" }, data, surface: null, provenance: { sourceEventSeqs: [], contributorIds: [], runtimeSelectionSeq: null } };
}

const TRANSCRIPT = "/data/sessions/s/subagents/sa-1.md";

function journal(extra: SessionEventEnvelopeV1[] = []): SessionEventEnvelopeV1[] {
  return [
    envelope(1, "turn/start", { agentRunId: "run-1", turnId: "turn-1" }),
    envelope(2, "tool/call", { agentRunId: "run-1", callId: "call-agent", name: "agent", args: { description: "Map the repo", prompt: "look around", agent_preset: "explore" } }),
    envelope(3, "subagent/spawned", { agentId: "sa-1", kind: "local", preset: "explore", description: "Map the repo", transcriptPath: TRANSCRIPT, callId: "call-agent", createdAt: "2026-11-04T00:00:01.000Z" }),
    envelope(4, "subagent/activation", { op: "start", agentId: "sa-1", activationId: "act-1", trigger: "spawn", callId: "call-agent", background: true, model: "deepseek:deepseek-flash", startedAt: "2026-11-04T00:00:01.000Z" }),
    envelope(5, "tool/result", { agentRunId: "run-1", callId: "call-agent", name: "agent", status: "completed", summary: "agent completed", modelOutput: [{ type: "text", text: "Started sa-1" }] }),
    ...extra,
  ];
}

describe("subagent cards from subagent/* events", () => {
  it("fills kind, preset, description, activation count and transcript path while running", () => {
    const [block] = projectSubagentList(snapshot(), journal());
    expect(block).toMatchObject({
      kind: "agent", description: "Map the repo", status: "running", subagentKind: "local", preset: "explore", activationCount: 1,
      transcriptPath: TRANSCRIPT, model: "deepseek:deepseek-flash", background: true,
      transcriptRef: { kind: "subagent_transcript", sessionId: "s", runId: "sa-1", path: TRANSCRIPT },
    });
    expect((block as { agentKind?: string }).agentKind).toBeUndefined();
  });

  it("follows the latest activation: a continuation counts, an interrupt shows as aborted", () => {
    const settled = journal([
      envelope(6, "subagent/activation", { op: "settle", agentId: "sa-1", activationId: "act-1", status: "completed", summary: "done", result: "Found 3 packages", delivery: "notified", endedAt: "2026-11-04T00:01:00.000Z" }),
    ]);
    expect(projectSubagentList(snapshot(), settled)[0]).toMatchObject({ status: "completed", activationCount: 1, summary: "Found 3 packages" });
    const continued = [...settled,
      envelope(7, "tool/call", { agentRunId: "run-1", callId: "call-send", name: "send_message", args: { agent_id: "sa-1", message: "Also check docs" } }),
      envelope(8, "subagent/activation", { op: "start", agentId: "sa-1", activationId: "act-2", trigger: "message", senderId: "s", callId: "call-send", background: true, startedAt: "2026-11-04T00:02:00.000Z" }),
      envelope(9, "subagent/activation", { op: "settle", agentId: "sa-1", activationId: "act-2", status: "interrupted", summary: "stopped", delivery: "notified", endedAt: "2026-11-04T00:03:00.000Z" }),
    ];
    expect(projectSubagentList(snapshot(), continued)).toHaveLength(1);
    expect(projectSubagentList(snapshot(), continued)[0]).toMatchObject({ status: "aborted", activationCount: 2 });
  });

  it("asks for request models only while an activation has none", () => {
    const withoutModel = journal().map(event => event.type === "subagent/activation" ? { ...event, data: { ...(event.data as object), model: undefined } } as SessionEventEnvelopeV1 : event);
    expect(subagentChildrenWithoutModel(withoutModel)).toEqual([{ childSessionId: "sa-1", finished: false }]);
    expect(subagentChildrenWithoutModel(journal())).toEqual([]);
  });

  it("names the management tool rows and shows the message sent", () => {
    const events = journal([
      envelope(6, "tool/call", { agentRunId: "run-1", callId: "call-send", name: "send_message", args: { agent_id: "sa-1", message: "Also check docs" } }),
      envelope(7, "tool/result", { agentRunId: "run-1", callId: "call-send", name: "send_message", status: "completed", summary: "send_message completed" }),
      envelope(8, "tool/call", { agentRunId: "run-1", callId: "call-stop", name: "interrupt_agent", args: { agent_id: "sa-1" } }),
      envelope(9, "tool/result", { agentRunId: "run-1", callId: "call-stop", name: "interrupt_agent", status: "completed", summary: "interrupt_agent completed" }),
      ...(["wait_agent", "list_agents", "list_subagent_models"] as const).flatMap((name, index) => [
        envelope(10 + index * 2, "tool/call", { agentRunId: "run-1", callId: `call-${name}`, name, args: {} }),
        envelope(11 + index * 2, "tool/result", { agentRunId: "run-1", callId: `call-${name}`, name, status: "completed", summary: `${name} completed` }),
      ]),
    ]);
    const callIds = events.flatMap(event => event.type === "tool/call" ? [String((event.data as { callId: string }).callId)] : []);
    const titles = projectChatSession(snapshot(callIds), events, "/w").events
      .flatMap(event => event.type === "tool_result" && event.payload.uiPreview?.kind === "generic" ? [event.payload.uiPreview] : []);
    expect(titles.map(preview => preview.title)).toEqual(["发消息给 Map the repo", "停止 Map the repo", "等待子智能体", "查看子智能体", "查看可选模型"]);
    expect(titles[0]!.content).toContain("Also check docs");
  });
});

describe("inbox notices from subagents", () => {
  it("turns subagent completion notices and agent messages into background notices", () => {
    const adapter = new FixedRendererStreamAdapter(() => undefined);
    const seen: unknown[] = [];
    adapter.subscribe(event => { if (event.type === "background_notice_claimed") seen.push(event.notice); });
    const base = { kind: "inbox-claimed", sessionId: "s", agentRunId: "run-2", turnId: "turn-2", content: "<subagent_notification />" } as const;
    adapter.accept({ ...base, messageId: "m1", source: "subagent_notification", notice: { taskId: "sa-1", kind: "subagent", title: "Map the repo", status: "completed" } });
    adapter.accept({ ...base, messageId: "m2", source: "agent_message", notice: { taskId: "sa-1", kind: "agent_message", title: "Map the repo", status: "message" } });
    adapter.accept({ ...base, messageId: "m3", source: "steer", notice: { taskId: "x", kind: "subagent", title: "x", status: "completed" } });
    expect(seen).toEqual([
      { taskId: "sa-1", taskKind: "subagent", title: "Map the repo", status: "completed" },
      { taskId: "sa-1", taskKind: "agent_message", title: "Map the repo", status: "message" },
    ]);
  });
});
