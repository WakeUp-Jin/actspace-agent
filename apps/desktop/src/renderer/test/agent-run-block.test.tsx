import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MessageBlock, SessionEvent } from "@actspace/shared";
import { AgentRunBlock } from "../components/messages/AgentRunBlock";
import { SubAgentTranscriptPanel } from "../components/messages/SubAgentTranscriptModal";

const transcriptRef = {
  kind: "subagent_transcript" as const,
  sessionId: "session-1",
  agentRunId: "turn-1",
  runId: "run-1",
};

const promptEvent: SessionEvent = {
  id: "evt-prompt",
  sessionId: "session-1",
  agentRunId: "turn-1:subagent:run-1",
  type: "user_message",
  timestamp: "2026-06-02T10:00:00.000Z",
  schemaVersion: 2,
  payload: { content: "Inspect the renderer Agent block." },
};

const longPromptEvent: SessionEvent = {
  ...promptEvent,
  id: "evt-long-prompt",
  payload: {
    content: [
      "Inspect the renderer Agent block in detail.",
      "",
      "1. Locate the component that opens the SubAgent transcript.",
      "2. Verify the task input stays pinned at the top of the panel.",
      "3. Check that the task input defaults to a compact preview.",
      "4. Confirm the work list and final output scroll below it.",
      "5. Report any layout edge cases in light and dark themes.",
    ].join("\n"),
  },
};

const reportEvent: SessionEvent = {
  id: "evt-report",
  sessionId: "session-1",
  agentRunId: "turn-1:subagent:run-1",
  type: "assistant_message",
  timestamp: "2026-06-02T10:00:02.000Z",
  schemaVersion: 2,
  payload: {
    content: "The block renders summaries and opens a transcript panel.",
    stopReason: "stop",
    model: "mock",
    provider: "mock",
  },
};

const thinkingEvent: SessionEvent = {
  id: "evt-thinking",
  sessionId: "session-1",
  agentRunId: "turn-1:subagent:run-1",
  type: "thinking",
  timestamp: "2026-06-02T10:00:01.000Z",
  schemaVersion: 2,
  payload: { content: "Need to inspect renderer files.", collapsedByDefault: true },
};

const readCallEvent: SessionEvent = {
  id: "evt-read-call",
  sessionId: "session-1",
  agentRunId: "turn-1:subagent:run-1",
  type: "tool_call",
  timestamp: "2026-06-02T10:00:01.100Z",
  schemaVersion: 2,
  payload: {
    id: "tc-read",
    name: "read_file",
    arguments: { path: "apps/desktop/src/renderer/components/messages/AgentRunBlock.tsx" },
  },
};

const readResultEvent: SessionEvent = {
  id: "evt-read-result",
  sessionId: "session-1",
  agentRunId: "turn-1:subagent:run-1",
  type: "tool_result",
  timestamp: "2026-06-02T10:00:01.200Z",
  schemaVersion: 2,
  payload: {
    toolCallId: "tc-read",
    toolName: "read_file",
    ok: true,
    summary: "Read AgentRunBlock.tsx",
    modelOutput: "file contents",
  },
};

const globCallEvent: SessionEvent = {
  id: "evt-glob-call",
  sessionId: "session-1",
  agentRunId: "turn-1:subagent:run-1",
  type: "tool_call",
  timestamp: "2026-06-02T10:00:01.300Z",
  schemaVersion: 2,
  payload: {
    id: "tc-glob",
    name: "glob",
    arguments: { pattern: "apps/desktop/src/renderer/components/messages/*.tsx" },
  },
};

const globResultEvent: SessionEvent = {
  id: "evt-glob-result",
  sessionId: "session-1",
  agentRunId: "turn-1:subagent:run-1",
  type: "tool_result",
  timestamp: "2026-06-02T10:00:01.400Z",
  schemaVersion: 2,
  payload: {
    toolCallId: "tc-glob",
    toolName: "glob",
    ok: true,
    summary: "Glob message components",
    modelOutput: "Found 2 files matching pattern:\n\nAgentRunBlock.tsx\nSubAgentTranscriptModal.tsx",
  },
};

const usageEvent: SessionEvent = {
  id: "evt-usage",
  sessionId: "session-1",
  agentRunId: "turn-1:subagent:run-1",
  type: "llm_usage",
  timestamp: "2026-06-02T10:00:01.500Z",
  schemaVersion: 2,
  payload: {
    llmCallId: "call-1",
    attempt: 1,
    durationMs: 10,
    provider: "mock",
    model: "mock",
    promptTokens: 100,
    completionTokens: 20,
    totalTokens: 120,
    cost: { inputCostUsd: 0, outputCostUsd: 0, totalCostUsd: 0 },
  },
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
    transcriptEvents: [promptEvent],
    createdAt: "2026-06-02T10:00:03.000Z",
    ...partial,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  delete (window as { actspace?: unknown }).actspace;
});

describe("AgentRunBlock", () => {
  it("shows a compact completed Agent row and requests the transcript panel", async () => {
    const user = userEvent.setup();
    const onOpenTranscript = vi.fn();

    render(<AgentRunBlock message={makeAgentBlock()} onOpenTranscript={onOpenTranscript} />);

    expect(screen.getByText("Inspect Agent block")).toBeInTheDocument();
    expect(screen.getByText("Agent")).toBeInTheDocument();
    expect(screen.getByText("已完成")).toBeInTheDocument();
    expect(screen.getByText("Found the relevant renderer components.")).toBeInTheDocument();
    expect(screen.queryByText("Explored 1 files · 2 tools · 4s · 900 tokens")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Open SubAgent transcript/ }));

    expect(onOpenTranscript).toHaveBeenCalledWith(makeAgentBlock());
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

  it("renders transcript events with the main message grammar", async () => {
    const user = userEvent.setup();
    (window as unknown as { actspace: Partial<typeof window.actspace> }).actspace = {
      getSubAgentTranscript: vi.fn(async () => [
        promptEvent,
        thinkingEvent,
        readCallEvent,
        readResultEvent,
        globCallEvent,
        globResultEvent,
        usageEvent,
        reportEvent,
      ]),
    };

    render(<SubAgentTranscriptPanel message={makeAgentBlock()} open={true} onClose={vi.fn()} />);

    expect(await screen.findByRole("button", { name: /Worked for 4s/ })).toBeInTheDocument();
    const taskInput = screen.getByLabelText("Task input");
    const finalOutput = screen.getByLabelText("Final output");

    expect(within(taskInput).getByText("Inspect the renderer Agent block.")).toBeInTheDocument();
    expect(within(finalOutput).getByText("Found the relevant renderer components.")).toBeInTheDocument();
    expect(within(finalOutput).queryByText("The block renders summaries and opens a transcript panel.")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("SubAgent process")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Worked for 4s/ }));

    const process = screen.getByLabelText("SubAgent process");
    expect(await within(process).findByRole("button", { name: "Thinking" })).toBeInTheDocument();
    expect(await within(process).findByText("AgentRunBlock.tsx")).toBeInTheDocument();
    expect(within(process).getByText("Glob apps/desktop/src/renderer/components/messages/*.tsx")).toBeInTheDocument();
    expect(within(process).getByText("Usage Tokens 120 · input 100 · output 20")).toBeInTheDocument();
    expect(within(process).queryByText("The block renders summaries and opens a transcript panel.")).not.toBeInTheDocument();
    expect(screen.queryByText("read_file")).not.toBeInTheDocument();
  });

  it("falls back to transcript assistant output when Agent summary is missing", async () => {
    const user = userEvent.setup();
    (window as unknown as { actspace: Partial<typeof window.actspace> }).actspace = {
      getSubAgentTranscript: vi.fn(async () => [promptEvent, reportEvent]),
    };

    render(<SubAgentTranscriptPanel message={makeAgentBlock({ summary: undefined })} open={true} onClose={vi.fn()} />);

    const finalOutput = await screen.findByLabelText("Final output");
    expect(within(finalOutput).getByText("The block renders summaries and opens a transcript panel.")).toBeInTheDocument();
  });

  it("toggles task input expansion without an internal scroll area", async () => {
    const user = userEvent.setup();
    (window as unknown as { actspace: Partial<typeof window.actspace> }).actspace = {
      getSubAgentTranscript: vi.fn(async () => [longPromptEvent, reportEvent]),
    };

    render(<SubAgentTranscriptPanel message={makeAgentBlock({ transcriptEvents: [longPromptEvent] })} open={true} onClose={vi.fn()} />);

    const expandButton = await screen.findByRole("button", { name: "Expand task input" });
    expect(expandButton).toHaveAttribute("aria-expanded", "false");
    expect(expandButton).toHaveClass("max-h-[98px]", "overflow-hidden");
    expect(expandButton).not.toHaveClass("overflow-y-auto");
    expect(screen.getByTestId("task-input-fade")).toBeInTheDocument();

    await user.click(expandButton);

    const collapseButton = screen.getByRole("button", { name: "Collapse task input" });
    expect(collapseButton).toHaveAttribute("aria-expanded", "true");
    expect(collapseButton).toHaveClass("max-h-none");
    expect(collapseButton).not.toHaveClass("overflow-y-auto");
    expect(screen.queryByTestId("task-input-fade")).not.toBeInTheDocument();

    await user.click(collapseButton);

    expect(screen.getByRole("button", { name: "Expand task input" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByTestId("task-input-fade")).toBeInTheDocument();
  });

  it("keeps the final output hidden while the SubAgent is still running", async () => {
    const user = userEvent.setup();
    (window as unknown as { actspace: Partial<typeof window.actspace> }).actspace = {
      getSubAgentTranscript: vi.fn(async () => [promptEvent, readCallEvent, reportEvent]),
    };

    render(
      <SubAgentTranscriptPanel
        message={makeAgentBlock({
          status: "running",
          summary: undefined,
          stats: undefined,
          transcriptEvents: [promptEvent, readCallEvent, reportEvent],
        })}
        open={true}
        onClose={vi.fn()}
      />,
    );

    const process = await screen.findByLabelText("SubAgent process");
    expect(screen.queryByLabelText("Final output")).not.toBeInTheDocument();
    expect(within(process).getByText("Read AgentRunBlock.tsx")).toBeInTheDocument();
    expect(within(process).queryByText("The block renders summaries and opens a transcript panel.")).not.toBeInTheDocument();
  });
});
