import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MessageBlock, SessionEvent } from "@actspace/shared";
import { AgentRunBlock } from "../components/messages/AgentRunBlock";

const transcriptRef = {
  kind: "subagent_transcript" as const,
  sessionId: "session-1",
  turnId: "turn-1",
  runId: "run-1",
};

const promptEvent: SessionEvent = {
  id: "evt-prompt",
  sessionId: "session-1",
  turnId: "turn-1:subagent:run-1",
  type: "user_message",
  timestamp: "2026-06-02T10:00:00.000Z",
  payload: { content: "Inspect the renderer Agent block." },
};

const reportEvent: SessionEvent = {
  id: "evt-report",
  sessionId: "session-1",
  turnId: "turn-1:subagent:run-1",
  type: "assistant_message",
  timestamp: "2026-06-02T10:00:02.000Z",
  payload: {
    content: "The block renders summaries and opens a transcript modal.",
    stopReason: "stop",
    model: "mock",
    provider: "mock",
  },
};

function makeAgentBlock(partial: Partial<Extract<MessageBlock, { kind: "agent" }>> = {}): Extract<MessageBlock, { kind: "agent" }> {
  return {
    kind: "agent",
    id: "agent-1",
    description: "Inspect Agent block",
    status: "completed",
    subagentType: "explore",
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
  it("shows completed summary and opens the transcript modal", async () => {
    const user = userEvent.setup();
    (window as unknown as { actspace: Partial<typeof window.actspace> }).actspace = {
      getSubAgentTranscript: vi.fn(async () => [promptEvent, reportEvent]),
    };

    render(<AgentRunBlock message={makeAgentBlock()} />);

    expect(screen.getByText("Found the relevant renderer components.")).toBeInTheDocument();
    expect(screen.getByText("Explored 1 files · 2 tools · 4s · 900 tokens")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Open SubAgent transcript/ }));

    expect(await screen.findByRole("dialog", { name: /SubAgent transcript/ })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("The block renders summaries and opens a transcript modal.")).toBeInTheDocument();
    });
  });

  it("shows recent running transcript summaries", () => {
    render(
      <AgentRunBlock
        message={makeAgentBlock({
          status: "running",
          summary: undefined,
          stats: undefined,
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

    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.getByText("Read ConversationView.tsx")).toBeInTheDocument();
  });
});
