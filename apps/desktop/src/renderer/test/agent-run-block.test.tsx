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
    expect(screen.queryByText("Found the relevant renderer components.")).not.toBeInTheDocument();
    expect(screen.queryByText("Explored 1 files · 2 tools · 4s · 900 tokens")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Open SubAgent transcript/ }));

    expect(onOpen).toHaveBeenCalledWith("run-1");
  });

  it("is one row: no model, no activity line, no streamed reply text", () => {
    const { container } = render(
      <AgentRunBlock
        message={makeAgentBlock({
          status: "running",
          model: "claude-sonnet-5-5",
          summary: "private streamed reply",
          displayText: "正在读取 · ConversationView.tsx",
          recentEvents: [{ id: "recent-1", type: "tool_call", title: "Read", summary: "Read ConversationView.tsx", timestamp: "2026-06-02T10:00:01.000Z" }],
        })}
      />,
    );
    expect(screen.getByText("运行中")).toBeInTheDocument();
    expect(container.querySelector("img")).toHaveAttribute("width", "20");
    for (const hidden of ["claude-sonnet-5-5", "正在读取 · ConversationView.tsx", "Read ConversationView.tsx", "private streamed reply", "Found the relevant renderer components."]) {
      expect(screen.queryByText(hidden)).not.toBeInTheDocument();
    }
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("puts a failure's reason in the hover title and marks the status", () => {
    render(<AgentRunBlock message={makeAgentBlock({ status: "failed", error: "达到 300 步执行上限" })} />);
    expect(screen.getByRole("button", { name: /Open SubAgent transcript/ })).toHaveAttribute("title", "Inspect Agent block\n达到 300 步执行上限");
    expect(screen.getByText("失败")).toHaveClass("text-danger");
    expect(screen.queryByText("达到 300 步执行上限")).not.toBeInTheDocument();
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
