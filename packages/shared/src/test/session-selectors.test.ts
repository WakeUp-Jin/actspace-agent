import { describe, expect, it } from "vitest";
import { createMessageBlocks } from "../session-selectors";
import type { AgentToolPreview, SessionEvent } from "../session";

function makeToolResultEvent(uiPreview: AgentToolPreview): SessionEvent {
  return {
    id: "evt_agent_result",
    sessionId: "session-1",
    turnId: "turn-1",
    type: "tool_result",
    timestamp: "2026-06-02T10:00:00.000Z",
    payload: {
      toolCallId: "toolu-agent-1",
      toolName: "agent",
      ok: uiPreview.status === "completed",
      summary: uiPreview.displayText,
      modelOutput: uiPreview.summary ?? "",
      uiPreview,
    },
  };
}

describe("createMessageBlocks agent preview", () => {
  it("restores a completed Agent tool block from tool_result uiPreview", () => {
    const preview: AgentToolPreview = {
      kind: "agent",
      description: "Explore tool rendering",
      status: "completed",
      subagentType: "explore",
      displayText: "Explore tool rendering",
      summary: "Found the renderer path and the shared selector.",
      transcriptRef: {
        kind: "subagent_transcript",
        sessionId: "session-1",
        turnId: "turn-1",
        runId: "run-1",
      },
      stats: {
        durationMs: 4100,
        toolCallCount: 3,
        exploredFileCount: 2,
        totalTokens: 1200,
      },
    };

    expect(createMessageBlocks([makeToolResultEvent(preview)])).toEqual([
      {
        kind: "agent",
        id: "evt_agent_result",
        description: "Explore tool rendering",
        status: "completed",
        subagentType: "explore",
        displayText: "Explore tool rendering",
        summary: "Found the renderer path and the shared selector.",
        transcriptRef: preview.transcriptRef,
        stats: preview.stats,
        recentEvents: undefined,
        error: undefined,
        createdAt: "2026-06-02T10:00:00.000Z",
      },
    ]);
  });

  it("restores a running Agent tool block with recent transcript summaries", () => {
    const preview: AgentToolPreview = {
      kind: "agent",
      description: "Inspect runtime",
      status: "running",
      subagentType: "explore",
      displayText: "Inspect runtime",
      recentEvents: [
        {
          id: "evt_subagent_tool",
          type: "tool_call",
          title: "Read",
          summary: "Read packages/agent-core/src/engine/loop.ts",
          timestamp: "2026-06-02T10:01:00.000Z",
        },
      ],
    };

    const [block] = createMessageBlocks([makeToolResultEvent(preview)]);

    expect(block).toMatchObject({
      kind: "agent",
      description: "Inspect runtime",
      status: "running",
      recentEvents: preview.recentEvents,
    });
  });
});
