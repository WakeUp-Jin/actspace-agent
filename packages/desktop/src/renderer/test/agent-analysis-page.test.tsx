import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentAnalysisIndexResult, AgentTraceEvent, AgentTraceSummary } from "@actspace/shared";
import { AgentAnalysisPage } from "../components/analysis/AgentAnalysisPage";

const summary: AgentTraceSummary = {
  schemaVersion: 1,
  sessionId: "session-1",
  agentRunId: "run-1",
  startedAt: "2026-07-30T10:00:00.000Z",
  endedAt: "2026-07-30T10:00:02.000Z",
  status: "completed",
  truncated: false,
  turnCount: 2,
  llmCallCount: 2,
  retryCount: 0,
  eventCount: 8,
  toolNames: ["glob"],
  modelNames: ["kimi-k2"],
  inputTokens: 300,
  outputTokens: 60,
  cacheReadTokens: 120,
  cacheWriteTokens: 0,
  durationMs: 1800,
  byteSize: 4096,
  turns: [
    { turnId: "turn-1", turnIndex: 1, startedAt: "2026-07-30T10:00:00.100Z", llmCallCount: 1, retryCount: 0, toolNames: ["glob"], modelNames: ["kimi-k2"], inputTokens: 100, outputTokens: 20, cacheReadTokens: 40, cacheWriteTokens: 0, durationMs: 600 },
    { turnId: "turn-2", turnIndex: 2, startedAt: "2026-07-30T10:00:01.000Z", llmCallCount: 1, retryCount: 0, toolNames: [], modelNames: ["kimi-k2"], inputTokens: 200, outputTokens: 40, cacheReadTokens: 80, cacheWriteTokens: 0, durationMs: 1200 },
  ],
};

const analysisIndex: AgentAnalysisIndexResult = {
  sessionId: "session-1",
  title: "Agent event analysis",
  totals: { agentRunCount: 1, turnCount: 2, llmCallCount: 2, inputTokens: 300, outputTokens: 60, cacheReadTokens: 120, cacheWriteTokens: 0, durationMs: 1800 },
  toolNames: ["glob"],
  runs: [{ ...summary, userMessagePreview: "检查 Agent 事件层级" }],
};

const events: AgentTraceEvent[] = [
  event("agent_run_start", "2026-07-30T10:00:00.000Z"),
  { ...event("turn_start", "2026-07-30T10:00:00.100Z"), turnId: "turn-1", turnIndex: 1 },
  request("turn-1", 1, "call-1", "2026-07-30T10:00:00.200Z", [{ role: "user", content: "检查 Agent 事件层级" }], ["glob"]),
  response("turn-1", 1, "call-1", "2026-07-30T10:00:00.800Z", [{ type: "toolCall", name: "glob", arguments: { pattern: "**/*.ts" } }], 100, 20, 600),
  { ...event("turn_start", "2026-07-30T10:00:01.000Z"), turnId: "turn-2", turnIndex: 2 },
  request("turn-2", 2, "call-2", "2026-07-30T10:00:01.100Z", [
    { role: "user", content: "检查 Agent 事件层级" },
    { role: "assistant", content: [{ type: "toolCall", name: "glob", arguments: { pattern: "**/*.ts" } }] },
    { role: "toolResult", toolName: "glob", content: [{ type: "text", text: "loop.ts\nbridge.ts" }] },
  ], ["glob", "read_file"]),
  response("turn-2", 2, "call-2", "2026-07-30T10:00:02.000Z", [
    { type: "thinking", thinking: "I should inspect loop.ts." },
    { type: "text", text: "一个 Agent Run 可以包含多个 Turn。" },
  ], 200, 40, 1200),
  event("agent_run_end", "2026-07-30T10:00:02.100Z"),
];

describe("AgentAnalysisPage", () => {
  beforeEach(() => {
    window.actspace = {
      ...window.actspace,
      getAgentAnalysisIndex: vi.fn(async () => analysisIndex),
      readAgentTrace: vi.fn(async () => ({ trace: summary, events })),
      clearAgentTraces: vi.fn(async () => ({ filesDeleted: 2, bytesFreed: 4096 })),
    };
  });

  it("renders the two-level navigation and structured request details", async () => {
    const user = userEvent.setup();
    render(<AgentAnalysisPage sessionId="session-1" onBack={() => {}} />);
    expect(await screen.findByText("检查 Agent 事件层级", { exact: false })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Turn 2" })).toBeInTheDocument();
    expect(screen.getByText("Thinking")).toBeInTheDocument();
    expect(screen.getByText("一个 Agent Run 可以包含多个 Turn。")).toBeInTheDocument();
    expect(screen.queryByText("读取本地文本文件，可指定行范围。")).not.toBeInTheDocument();
    expect(screen.queryByText("TOOL RESULT · glob")).not.toBeInTheDocument();
    expect(screen.queryByText("Settings / Analysis")).not.toBeInTheDocument();
    expect(screen.queryByText("Agent event analysis")).not.toBeInTheDocument();
    expect(screen.queryByText("返回设置")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "返回设置" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "清除当前会话分析记录" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /消息/ }));
    expect(screen.getByText("TOOL RESULT · glob")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /工具定义/ }));
    expect(screen.getAllByText("读取本地文本文件，可指定行范围。")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "筛选工具" }));
    expect(screen.getByRole("button", { name: "glob" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "read_file" })).not.toBeInTheDocument();
  });

  it("keeps raw request controls behind progressive disclosure", async () => {
    const user = userEvent.setup();
    render(<AgentAnalysisPage sessionId="session-1" onBack={() => {}} />);
    await screen.findByRole("heading", { name: "Turn 2" });

    expect(screen.queryByRole("button", { name: "请求 JSON" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "cURL" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /原始数据/ }));
    expect(screen.getByRole("button", { name: "请求 JSON" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "cURL" })).toBeInTheDocument();
  });

  it("opens the previous-request comparison without showing call ids", async () => {
    const user = userEvent.setup();
    render(<AgentAnalysisPage sessionId="session-1" onBack={() => {}} />);
    await screen.findByRole("heading", { name: "Turn 2" });
    await user.click(screen.getByRole("button", { name: "对比上次" }));
    expect(screen.getByRole("heading", { name: "Turn 1 → Turn 2" })).toBeInTheDocument();
    expect(screen.getByText("前 1 条消息未变化")).toBeInTheDocument();
    expect(screen.queryByText(/call-1|call-2/)).toBeNull();
    expect(screen.queryByText("对比对象")).not.toBeInTheDocument();
  });

  it("pages through adjacent request comparisons", async () => {
    const user = userEvent.setup();
    const turns = [
      ...summary.turns,
      { ...summary.turns[1], turnId: "turn-3", turnIndex: 3, startedAt: "2026-07-30T10:00:02.100Z", toolNames: ["read_file"] },
      { ...summary.turns[1], turnId: "turn-4", turnIndex: 4, startedAt: "2026-07-30T10:00:03.100Z", toolNames: [] },
    ];
    const pagedSummary = { ...summary, turnCount: 4, llmCallCount: 4, turns, toolNames: ["glob", "read_file"] };
    const pagedEvents = [
      ...events.slice(0, -1),
      { ...event("turn_start", "2026-07-30T10:00:02.100Z"), turnId: "turn-3", turnIndex: 3 },
      request("turn-3", 3, "call-3", "2026-07-30T10:00:02.200Z", [{ role: "user", content: "继续检查" }], ["read_file"]),
      response("turn-3", 3, "call-3", "2026-07-30T10:00:03.000Z", [{ type: "toolCall", name: "read_file", arguments: { path: "loop.ts" } }], 210, 30, 800),
      { ...event("turn_start", "2026-07-30T10:00:03.100Z"), turnId: "turn-4", turnIndex: 4 },
      request("turn-4", 4, "call-4", "2026-07-30T10:00:03.200Z", [{ role: "user", content: "完成检查" }], ["read_file"]),
      response("turn-4", 4, "call-4", "2026-07-30T10:00:04.000Z", [{ type: "text", text: "完成。" }], 220, 35, 800),
      event("agent_run_end", "2026-07-30T10:00:04.100Z"),
    ];
    window.actspace = {
      ...window.actspace,
      getAgentAnalysisIndex: vi.fn(async () => ({ ...analysisIndex, runs: [{ ...pagedSummary, userMessagePreview: "检查 Agent 事件层级" }] })),
      readAgentTrace: vi.fn(async () => ({ trace: pagedSummary, events: pagedEvents })),
    };

    render(<AgentAnalysisPage sessionId="session-1" onBack={() => {}} />);
    await screen.findByRole("heading", { name: "Turn 4" });
    await user.click(screen.getByRole("button", { name: /Turn 2/ }));
    await user.click(screen.getByRole("button", { name: "对比上次" }));
    expect(screen.getByRole("heading", { name: "Turn 1 → Turn 2" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "查看下一组请求对比" }));
    expect(screen.getByRole("heading", { name: "Turn 2 → Turn 3" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "查看下一组请求对比" }));
    expect(screen.getByRole("heading", { name: "Turn 3 → Turn 4" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看下一组请求对比" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "查看上一组请求对比" }));
    expect(screen.getByRole("heading", { name: "Turn 2 → Turn 3" })).toBeInTheDocument();
  });

  it("moves selection to the first visible Turn and shows a filter empty state", async () => {
    const user = userEvent.setup();
    render(<AgentAnalysisPage sessionId="session-1" onBack={() => {}} />);
    await screen.findByRole("heading", { name: "Turn 2" });
    const search = screen.getByPlaceholderText("搜索用户输入、模型、工具或 Turn…");
    await user.click(screen.getByRole("button", { name: "筛选工具" }));

    await user.type(search, "turn 1");
    expect(await screen.findByRole("heading", { name: "Turn 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "glob" })).toBeInTheDocument();

    await user.clear(search);
    await user.type(search, "turn 2");
    expect(await screen.findByRole("heading", { name: "Turn 2" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "glob" })).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, "不存在的模型");
    expect(screen.getByText("没有符合当前搜索和 Tools 筛选条件的 Turn。")).toBeInTheDocument();
  });
});

function event(type: AgentTraceEvent["type"], timestamp: string): AgentTraceEvent {
  return { schemaVersion: 1, timestamp, sessionId: "session-1", agentRunId: "run-1", type, payload: {} };
}

function request(turnId: string, turnIndex: number, llmCallId: string, timestamp: string, messages: unknown[], toolNames: string[]): AgentTraceEvent {
  return {
    ...event("llm_request", timestamp),
    turnId,
    turnIndex,
    llmCallId,
    attempt: 1,
    payload: {
      provider: "kimi",
      model: "kimi-k2",
      systemPrompt: "You are ActSpace.",
      messages,
      tools: toolNames.map((name) => ({
        name,
        description: name === "read_file" ? "读取本地文本文件，可指定行范围。" : "查找文件。",
        parameters: { type: "object", required: ["path"], properties: { path: { type: "string", description: "文件路径" } } },
      })),
    },
  };
}

function response(turnId: string, turnIndex: number, llmCallId: string, timestamp: string, content: unknown[], input: number, output: number, durationMs: number): AgentTraceEvent {
  return {
    ...event("llm_response", timestamp),
    turnId,
    turnIndex,
    llmCallId,
    attempt: 1,
    payload: {
      durationMs,
      stopReason: content.some((block) => (block as { type?: string }).type === "toolCall") ? "toolUse" : "stop",
      message: { provider: "kimi", model: "kimi-k2", content, usage: { input, output, cacheRead: input * 0.4, cacheWrite: 0 } },
    },
  };
}
