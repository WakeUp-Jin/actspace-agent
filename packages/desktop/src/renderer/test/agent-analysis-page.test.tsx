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
  toolNames: ["glob", "read_file"],
  modelNames: ["kimi-k2"],
  inputTokens: 300,
  outputTokens: 60,
  cacheReadTokens: 120,
  cacheWriteTokens: 0,
  durationMs: 1800,
  byteSize: 4096,
  turns: [
    { turnId: "turn-1", turnIndex: 1, startedAt: "2026-07-30T10:00:00.100Z", llmCallCount: 1, retryCount: 0, toolNames: ["glob"], modelNames: ["kimi-k2"], inputTokens: 100, outputTokens: 20, cacheReadTokens: 40, cacheWriteTokens: 0, durationMs: 600 },
    { turnId: "turn-2", turnIndex: 2, startedAt: "2026-07-30T10:00:01.000Z", llmCallCount: 1, retryCount: 0, toolNames: ["glob", "read_file"], modelNames: ["kimi-k2"], inputTokens: 200, outputTokens: 40, cacheReadTokens: 80, cacheWriteTokens: 0, durationMs: 1200 },
  ],
};

const analysisIndex: AgentAnalysisIndexResult = {
  sessionId: "session-1",
  title: "Agent event analysis",
  totals: { agentRunCount: 1, turnCount: 2, llmCallCount: 2, inputTokens: 300, outputTokens: 60, cacheReadTokens: 120, cacheWriteTokens: 0, durationMs: 1800 },
  toolNames: ["glob", "read_file"],
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
    render(<AgentAnalysisPage sessionId="session-1" onBack={() => {}} />);
    expect(await screen.findByText("检查 Agent 事件层级", { exact: false })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Turn 2" })).toBeInTheDocument();
    expect(screen.getByText("读取本地文本文件，可指定行范围。")).toBeInTheDocument();
    expect(screen.getByText("TOOL RESULT · glob")).toBeInTheDocument();
    expect(screen.getByText("Thinking")).toBeInTheDocument();
    expect(screen.getByText("一个 Agent Run 可以包含多个 Turn。")).toBeInTheDocument();
  });

  it("opens the previous-request comparison without showing call ids", async () => {
    const user = userEvent.setup();
    render(<AgentAnalysisPage sessionId="session-1" onBack={() => {}} />);
    await screen.findByRole("heading", { name: "Turn 2" });
    await user.click(screen.getByRole("button", { name: "对比上次" }));
    expect(screen.getByRole("heading", { name: "Turn 1 → Turn 2" })).toBeInTheDocument();
    expect(screen.getByText("前 1 条消息未变化")).toBeInTheDocument();
    expect(screen.queryByText(/call-1|call-2/)).toBeNull();
  });

  it("moves selection to the first visible Turn and shows a filter empty state", async () => {
    const user = userEvent.setup();
    render(<AgentAnalysisPage sessionId="session-1" onBack={() => {}} />);
    await screen.findByRole("heading", { name: "Turn 2" });
    const search = screen.getByPlaceholderText("搜索用户输入、模型、工具或 Turn…");

    await user.type(search, "turn 1");
    expect(await screen.findByRole("heading", { name: "Turn 1" })).toBeInTheDocument();

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
