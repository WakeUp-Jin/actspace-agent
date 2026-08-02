import type { AgentAnalysisSessionIndexResult } from "@actspace/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AgentAnalysisSessionIndex,
  createAgentAnalysisSessionIndexViewState,
} from "../components/analysis/AgentAnalysisSessionIndex";

const analysisSessionIndexFixture: AgentAnalysisSessionIndexResult = {
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

function SessionIndexHarness({ onOpenSession }: { onOpenSession: (sessionId: string) => void }) {
  const [state, setState] = useState(createAgentAnalysisSessionIndexViewState);
  return (
    <>
      <output data-testid="analysis-index-scroll-state">{state.scrollTop}</output>
      <AgentAnalysisSessionIndex
        activeSessionId="session-current"
        state={state}
        onStateChange={setState}
        onOpenSession={onOpenSession}
      />
    </>
  );
}

describe("AgentAnalysisSessionIndex", () => {
  const getSessionIndex = vi.fn(async () => analysisSessionIndexFixture);

  beforeEach(() => {
    getSessionIndex.mockClear();
    window.actspace = {
      ...window.actspace,
      getAgentAnalysisSessionIndex: getSessionIndex,
    };
  });

  it("renders as an embedded settings section without its own back control", async () => {
    const onOpenSession = vi.fn();
    render(<SessionIndexHarness onOpenSession={onOpenSession} />);

    expect(await screen.findByRole("heading", { name: "分析观测", level: 2 })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "返回" })).not.toBeInTheDocument();
    expect(screen.getByText("Inspect the runtime")).toBeInTheDocument();
    expect(screen.getByText("No analysis yet")).toBeInTheDocument();
    expect(screen.getByText("当前")).toBeInTheDocument();
    expect(screen.getByText("Run / Turn")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("搜索会话或工作区")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开分析会话：Inspect the runtime" })).toHaveAttribute("aria-current", "true");
    expect(getSessionIndex).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "打开分析会话：Inspect the runtime" }));
    expect(onOpenSession).toHaveBeenCalledWith("session-current");
  });

  it("filters the session index without loading any session detail", async () => {
    const onOpenSession = vi.fn();
    render(<SessionIndexHarness onOpenSession={onOpenSession} />);
    await screen.findByText("Inspect the runtime");

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "状态筛选" }), "empty");
    expect(screen.queryByText("Inspect the runtime")).not.toBeInTheDocument();
    expect(screen.getByText("No analysis yet")).toBeInTheDocument();
    expect(onOpenSession).not.toHaveBeenCalled();
  });

  it("reports its scroll position so the settings route can restore it", async () => {
    render(<SessionIndexHarness onOpenSession={() => {}} />);
    await screen.findByText("Inspect the runtime");

    fireEvent.scroll(screen.getByTestId("agent-analysis-session-index"), { target: { scrollTop: 128 } });
    expect(screen.getByTestId("analysis-index-scroll-state")).toHaveTextContent("128");
  });
});
