import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MessageBlock } from "@actspace/shared";
import { AgentRunBlock } from "../components/messages/AgentRunBlock";

const transcriptRef = {
  kind: "subagent_transcript" as const,
  sessionId: "session-1",
  agentRunId: "turn-1",
  runId: "run-1",
};

function makeAgentBlock(partial: Partial<Extract<MessageBlock, { kind: "agent" }>> = {}): Extract<MessageBlock, { kind: "agent" }> {
  return {
    kind: "agent",
    id: "agent-1",
    description: "Inspect Agent block",
    status: "completed",
    subagentType: "explore",
    agentKind: "agent",
    displayText: "Inspect Agent block",
    summary: "Found the relevant renderer components.",
    transcriptRef,
    stats: {
      durationMs: 4200,
      toolCallCount: 2,
      exploredFileCount: 1,
      totalTokens: 900,
    },
    createdAt: "2026-06-02T10:00:03.000Z",
    ...partial,
  };
}


afterEach(() => {
  vi.restoreAllMocks();
});

describe("AgentRunBlock", () => {
  it("keeps the child avatar stable across live/history IDs and terminal states", () => {
    const message = makeAgentBlock({ status: "running" });
    const { container, rerender } = render(<AgentRunBlock message={message} />);
    const source = container.querySelector("img")?.getAttribute("src");
    expect(source).toBeTruthy();
    for (const status of ["completed", "failed", "aborted"] as const) {
      rerender(<AgentRunBlock message={{ ...message, id: "history:other-id", status }} />);
      expect(container.querySelector("img")?.getAttribute("src")).toBe(source);
    }
  });

  it("shows a compact completed Agent row and opens the subagent by its id", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();

    render(<AgentRunBlock message={makeAgentBlock()} onOpen={onOpen} />);

    expect(screen.getByText("Inspect Agent block")).toBeInTheDocument();
    expect(screen.getByText("Agent")).toBeInTheDocument();
    expect(screen.getByText("已完成")).toBeInTheDocument();
    expect(screen.getByText("Found the relevant renderer components.")).toBeInTheDocument();
    expect(screen.queryByText("Explored 1 files · 2 tools · 4s · 900 tokens")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Open SubAgent transcript/ }));

    expect(onOpen).toHaveBeenCalledWith("run-1");
  });

  it("shows the model the subagent requested, and nothing for older events without one", () => {
    const { rerender } = render(<AgentRunBlock message={{ ...makeAgentBlock(), model: "claude-sonnet-5-5" }} />);
    const model = screen.getByText("claude-sonnet-5-5");
    expect(model).toHaveClass("agent-run-model", "truncate");
    expect(model).toHaveAttribute("title", "claude-sonnet-5-5");

    rerender(<AgentRunBlock message={makeAgentBlock()} />);
    expect(document.querySelector(".agent-run-model")).toBeNull();
  });

  it("shows event-derived activity without streaming model text", () => {
    render(
      <AgentRunBlock
        message={makeAgentBlock({
          status: "running",
          summary: undefined,
          stats: undefined,
          displayText: "正在读取 · ConversationView.tsx",
          recentEvents: [
            {
              id: "recent-1",
              type: "tool_call",
              title: "Read",
              summary: "Read ConversationView.tsx",
              timestamp: "2026-06-02T10:00:01.000Z",
            },
          ],
        })}
      />,
    );

    expect(screen.queryByText("Running")).not.toBeInTheDocument();
    const runningSummary = screen.getByText("正在读取 · ConversationView.tsx");
    expect(runningSummary).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "正在读取 · ConversationView.tsx");
    expect(screen.queryByText("Read ConversationView.tsx")).not.toBeInTheDocument();
  });

  it("shows operation context immediately through rapid updates and terminal errors", () => {
    vi.useFakeTimers();
    try {
      const message = makeAgentBlock({ status: "running", displayText: "正在思考" });
      const { rerender, unmount } = render(<AgentRunBlock message={message} />);
      rerender(<AgentRunBlock message={{ ...message, displayText: "正在读取 · a.ts" }} />);
      expect(screen.getByRole("status")).toHaveAttribute("aria-label", "正在读取 · a.ts");
      rerender(<AgentRunBlock message={{ ...message, displayText: "正在分析 · 刚读取 a.ts" }} />);
      expect(screen.getByRole("status")).toHaveAttribute("aria-label", "正在分析 · 刚读取 a.ts");
      expect(vi.getTimerCount()).toBe(0);
      rerender(<AgentRunBlock message={{ ...message, displayText: "正在整理回复" }} />);
      rerender(<AgentRunBlock message={{ ...message, status: "failed", error: "达到 300 步执行上限" }} />);
      expect(screen.getByRole("status")).toHaveTextContent("达到 300 步执行上限");
      unmount();
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it("never uses a running summary as streamed reply text", () => {
    render(<AgentRunBlock message={makeAgentBlock({ status: "running", summary: "private streamed reply", displayText: "untrusted reply" })} />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "正在思考");
    expect(screen.queryByText("private streamed reply")).not.toBeInTheDocument();
  });

  it("names the kind of new subagents and opens only the list before the subagent exists", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const { rerender } = render(<AgentRunBlock message={makeAgentBlock({ agentKind: undefined, subagentKind: "local", preset: "explore" })} />);
    expect(screen.getByText("探索")).toBeInTheDocument();
    for (const [subagentKind, label] of [["fork", "Fork"], ["codex", "Codex"], ["claude-code", "Claude Code"]] as const) {
      rerender(<AgentRunBlock message={makeAgentBlock({ agentKind: undefined, subagentKind })} />);
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    rerender(<AgentRunBlock message={makeAgentBlock({ agentKind: undefined, subagentKind: "local", preset: "general", background: true })} />);
    expect(screen.getByText("通用")).toBeInTheDocument();
    expect(screen.getByText("后台")).toBeInTheDocument();
    rerender(<AgentRunBlock message={makeAgentBlock({ agentKind: undefined, subagentKind: "codex", transcriptRef: undefined })} onOpen={onOpen} />);
    await user.click(screen.getByRole("button", { name: /Open SubAgent transcript/ }));
    expect(onOpen).toHaveBeenCalledWith(undefined);
  });
});
