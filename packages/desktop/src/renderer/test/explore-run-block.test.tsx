import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MessageBlock, SessionEvent } from "@actspace/shared";
import { ExploreRunBlock } from "../components/messages/ExploreRunBlock";

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
  timestamp: "2026-06-06T10:00:00.000Z",
  payload: { content: "Where is ToolManager defined?" },
};

const readCallEvent: SessionEvent = {
  id: "evt-read-call",
  sessionId: "session-1",
  turnId: "turn-1:subagent:run-1",
  type: "tool_call",
  timestamp: "2026-06-06T10:00:01.000Z",
  payload: { id: "tc-read", name: "read_file", arguments: { path: "packages/agent-core/src/tools/manager.ts" } },
};

const readResultEvent: SessionEvent = {
  id: "evt-read-result",
  sessionId: "session-1",
  turnId: "turn-1:subagent:run-1",
  type: "tool_result",
  timestamp: "2026-06-06T10:00:01.500Z",
  payload: { toolCallId: "tc-read", toolName: "read_file", ok: true, summary: "Read manager.ts", modelOutput: "class ToolManager {}" },
};

const usageEvent: SessionEvent = {
  id: "evt-usage",
  sessionId: "session-1",
  turnId: "turn-1:subagent:run-1",
  type: "llm_usage",
  timestamp: "2026-06-06T10:00:01.800Z",
  payload: {
    callId: "call-1",
    provider: "mock",
    model: "mock",
    promptTokens: 2102,
    completionTokens: 151,
    totalTokens: 2253,
    cost: { inputCostUsd: 0, outputCostUsd: 0, totalCostUsd: 0 },
  },
};

function makeExploreBlock(partial: Partial<Extract<MessageBlock, { kind: "agent" }>> = {}): Extract<MessageBlock, { kind: "agent" }> {
  return {
    kind: "agent",
    id: "explore-1",
    description: "Find ToolManager",
    status: "completed",
    subagentType: "explore",
    displayText: "Find ToolManager",
    summary: "ToolManager is in packages/agent-core/src/tools/manager.ts.",
    transcriptRef,
    display: "inline",
    stats: { durationMs: 3000, toolCallCount: 1, exploredFileCount: 1, totalTokens: 200 },
    transcriptEvents: [promptEvent, readCallEvent, readResultEvent, usageEvent],
    createdAt: "2026-06-06T10:00:02.000Z",
    ...partial,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  delete (window as { actspace?: unknown }).actspace;
});

describe("ExploreRunBlock", () => {
  it("collapses to an 'Explored N files' toggle when done and expands nested rows (no usage line)", async () => {
    const user = userEvent.setup();
    render(<ExploreRunBlock message={makeExploreBlock()} />);

    const toggle = screen.getByRole("button", { name: /Explored 1 file/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Read manager.ts")).not.toBeInTheDocument();

    await user.click(toggle);

    expect(screen.getByText("Read manager.ts")).toBeInTheDocument();
    expect(screen.queryByText(/Usage Tokens/)).not.toBeInTheDocument();
  });

  it("shows an expanded 'Exploring' viewport while running, with no isolation box", () => {
    const { container } = render(
      <ExploreRunBlock message={makeExploreBlock({ status: "running", summary: undefined, stats: undefined })} />,
    );

    const toggle = screen.getByRole("button", { name: /Exploring/ });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Read manager.ts")).toBeInTheDocument();
    expect(screen.queryByText(/Usage Tokens/)).not.toBeInTheDocument();

    const viewport = container.querySelector(".explore-run-viewport");
    expect(viewport).not.toBeNull();
    expect(viewport).toHaveClass("overflow-y-auto");
    expect(viewport).not.toHaveClass("bg-surface-subtle");
  });

  it("lazy-loads the sidecar transcript on first expand when events are absent", async () => {
    const user = userEvent.setup();
    const getSubAgentTranscript = vi.fn(async () => [promptEvent, readCallEvent, readResultEvent]);
    (window as unknown as { actspace: Partial<typeof window.actspace> }).actspace = { getSubAgentTranscript };

    render(<ExploreRunBlock message={makeExploreBlock({ transcriptEvents: [] })} />);

    expect(getSubAgentTranscript).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /Explored 1 file/ }));

    expect(getSubAgentTranscript).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Read manager.ts")).toBeInTheDocument();
  });
});
