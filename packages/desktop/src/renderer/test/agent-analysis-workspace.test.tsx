import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentAnalysisSessionIndexResult } from "@actspace/shared";
import { AgentAnalysisWorkspace } from "../components/analysis/AgentAnalysisWorkspace";

const sessionIndex: AgentAnalysisSessionIndexResult = {
  totals: {
    sessionCount: 2,
    agentRunCount: 1,
    turnCount: 2,
    llmCallCount: 2,
    inputTokens: 28_000,
    outputTokens: 817,
    cacheReadTokens: 17_000,
    cacheWriteTokens: 25,
    durationMs: 7_400,
  },
  modelNames: ["deepseek-v4-flash", "kimi-k2"],
  sessions: [
    {
      sessionId: "session-current",
      title: "Inspect the runtime",
      updatedAt: "2026-07-29T10:05:00.000Z",
      workspaceRoot: "/tmp/runtime",
      status: "completed",
      agentRunCount: 1,
      turnCount: 2,
      llmCallCount: 2,
      inputTokens: 28_000,
      outputTokens: 817,
      cacheReadTokens: 17_000,
      cacheWriteTokens: 25,
      durationMs: 7_400,
      modelNames: ["deepseek-v4-flash"],
    },
    {
      sessionId: "session-empty",
      title: "No analysis yet",
      updatedAt: "2026-07-29T09:05:00.000Z",
      status: "empty",
      agentRunCount: 0,
      turnCount: 0,
      llmCallCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      durationMs: 0,
      modelNames: ["kimi-k2"],
    },
  ],
};

describe("AgentAnalysisWorkspace", () => {
  const getSessionIndex = vi.fn(async () => sessionIndex);
  const getAnalysisIndex = vi.fn(async ({ sessionId }: { sessionId: string }) => ({
    sessionId,
    title: "No analysis yet",
    totals: {
      agentRunCount: 0,
      turnCount: 0,
      llmCallCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      durationMs: 0,
    },
    toolNames: [],
    runs: [],
  }));

  beforeEach(() => {
    getSessionIndex.mockClear();
    getAnalysisIndex.mockClear();
    window.actspace = {
      ...window.actspace,
      getAgentAnalysisSessionIndex: getSessionIndex,
      getAgentAnalysisIndex: getAnalysisIndex,
    };
  });

  it("opens on the session index without loading the active session detail", async () => {
    const onBack = vi.fn();
    const user = userEvent.setup();
    render(<AgentAnalysisWorkspace activeSessionId="session-current" onBack={onBack} />);

    expect(await screen.findByRole("heading", { name: "会话记录", level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "分析观测" })).not.toBeInTheDocument();
    expect(screen.queryByText("本地记录")).not.toBeInTheDocument();
    expect(screen.queryByText("返回")).not.toBeInTheDocument();
    expect(screen.getByText("Inspect the runtime")).toBeInTheDocument();
    expect(screen.getByText("No analysis yet")).toBeInTheDocument();
    expect(screen.getByText("当前")).toBeInTheDocument();
    expect(screen.getByText("Run / Turn")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("搜索会话或工作区")).toBeInTheDocument();
    expect(screen.queryByText("当前会话已在列表中标记")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开分析会话：Inspect the runtime" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: "打开分析会话：Inspect the runtime" })).not.toHaveClass("bg-selected");
    expect(getSessionIndex).toHaveBeenCalledTimes(1);
    expect(getAnalysisIndex).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "返回" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("filters the index and drills into one session before returning to the list", async () => {
    const user = userEvent.setup();
    render(<AgentAnalysisWorkspace activeSessionId="session-current" onBack={() => {}} />);
    await screen.findByText("Inspect the runtime");

    await user.selectOptions(screen.getByRole("combobox", { name: "状态筛选" }), "empty");
    expect(screen.queryByText("Inspect the runtime")).not.toBeInTheDocument();
    expect(screen.getByText("No analysis yet")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "打开分析会话：No analysis yet" }));
    await waitFor(() => expect(getAnalysisIndex).toHaveBeenCalledWith({ sessionId: "session-empty" }));
    expect(await screen.findByText("该会话暂无分析记录")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "返回会话列表" })).toHaveLength(2);

    await user.click(screen.getAllByRole("button", { name: "返回会话列表" })[0]);
    expect(await screen.findByRole("heading", { name: "会话记录", level: 1 })).toBeInTheDocument();
  });
});
