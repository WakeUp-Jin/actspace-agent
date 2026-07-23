import { describe, expect, it } from "vitest";
import type { AgentToolPreview, SessionEvent, ToolExecutionResult } from "../session";
import { createMessageBlocks } from "../session-selectors";

function toolResultEvent(payload: ToolExecutionResult): SessionEvent<ToolExecutionResult> {
  return {
    id: `evt-${payload.uiPreview?.kind ?? "tool"}`,
    sessionId: "session-delete",
    turnId: "turn-delete",
    type: "tool_result",
    timestamp: "2026-06-02T12:00:00.000Z",
    schemaVersion: 1,
    payload,
  };
}

function contextCompactionEvent(payload: Record<string, unknown>): SessionEvent<Record<string, unknown>> {
  return {
    id: `evt-${String(payload.status ?? "legacy")}`,
    sessionId: "session-compact",
    turnId: "turn-compact",
    type: "context_compaction",
    timestamp: "2026-06-02T00:00:00.000Z",
    schemaVersion: 1,
    payload,
  };
}

function agentToolResultEvent(uiPreview: AgentToolPreview): SessionEvent<ToolExecutionResult> {
  return {
    id: "evt_agent_result",
    sessionId: "session-1",
    turnId: "turn-1",
    type: "tool_result",
    timestamp: "2026-06-02T10:00:00.000Z",
    schemaVersion: 1,
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

describe("session selectors", () => {
  it("derives turn-scoped render keys independently from persisted event ids", () => {
    const timestamp = "2026-07-17T07:00:00.000Z";
    const blocks = createMessageBlocks([
      {
        id: "evt-random-user",
        sessionId: "session-render-key",
        turnId: "turn-render-key",
        type: "user_message",
        timestamp,
        schemaVersion: 1,
        payload: { content: "Prompt" },
      },
      {
        id: "evt-random-thinking",
        sessionId: "session-render-key",
        turnId: "turn-render-key",
        type: "thinking",
        timestamp,
        schemaVersion: 1,
        payload: { content: "Reasoning" },
      },
      {
        id: "evt-random-assistant",
        sessionId: "session-render-key",
        turnId: "turn-render-key",
        type: "assistant_message",
        timestamp,
        schemaVersion: 1,
        payload: {
          content: "Reply",
          stopReason: "stop",
          model: "test-model",
          provider: "test-provider",
        },
      },
    ]);

    expect(blocks.map((block) => block.renderKey)).toEqual([
      "turn:turn-render-key:user:0",
      "turn:turn-render-key:thinking:0",
      "turn:turn-render-key:assistant:0",
    ]);
  });

  it("restores an aborted turn as a persisted Stopped status", () => {
    const blocks = createMessageBlocks([{
      id: "evt-aborted",
      sessionId: "session-aborted",
      turnId: "turn-aborted",
      type: "turn_aborted",
      timestamp: "2026-07-17T07:00:00.000Z",
      schemaVersion: 1,
      payload: { reason: "user" },
    }]);

    expect(blocks).toEqual([{
      kind: "status",
      id: "evt-aborted",
      renderKey: "turn:turn-aborted:status:0",
      content: "Stopped",
      createdAt: "2026-07-17T07:00:00.000Z",
      tone: "muted",
    }]);
  });

  it("restores an eval candidate result as a system status", () => {
    const blocks = createMessageBlocks([{
      id: "evt-eval",
      sessionId: "session-eval",
      turnId: "turn-eval",
      type: "eval_candidate",
      timestamp: "2026-07-19T07:00:00.000Z",
      schemaVersion: 1,
      payload: {
        candidateId: "failure-1",
        relativePath: "eval-candidates/failure-1",
        status: "generated",
        summary: "Eval candidate generated · failure-1",
      },
    }]);

    expect(blocks).toEqual([{
      kind: "status",
      id: "evt-eval",
      renderKey: "turn:turn-eval:eval-candidate:0",
      content: "Eval candidate generated · failure-1",
      createdAt: "2026-07-19T07:00:00.000Z",
      tone: "muted",
    }]);
  });

  it("restores a completed delete_file result as a delete message block", () => {
    const blocks = createMessageBlocks([
      toolResultEvent({
        toolName: "delete_file",
        toolCallId: "tool-delete-1",
        ok: true,
        summary: "Deleted notes.md",
        modelOutput: "File deleted: notes.md",
        uiPreview: {
          kind: "delete",
          filePath: "notes.md",
          displayText: "Deleted notes.md",
          status: "completed",
        },
      }),
    ]);

    expect(blocks).toEqual([
      {
        kind: "delete",
        id: "evt-delete",
        renderKey: "turn:turn-delete:tool:tool-delete-1",
        filePath: "notes.md",
        displayText: "Deleted notes.md",
        status: "completed",
        isError: false,
        approvalRequestId: undefined,
        createdAt: "2026-06-02T12:00:00.000Z",
      },
    ]);
  });

  it("restores failed and denied delete_file results without guessing from tool name", () => {
    const blocks = createMessageBlocks([
      toolResultEvent({
        toolName: "delete_file",
        toolCallId: "tool-delete-failed",
        ok: false,
        summary: "Delete missing.md failed",
        modelOutput: "File not found: missing.md",
        uiPreview: {
          kind: "delete",
          filePath: "missing.md",
          displayText: "Delete missing.md failed",
          status: "failed",
        },
      }),
      toolResultEvent({
        toolName: "delete_file",
        toolCallId: "tool-delete-denied",
        ok: false,
        summary: "Denied delete notes.md",
        modelOutput: "User denied tool: delete_file",
        uiPreview: {
          kind: "delete",
          filePath: "notes.md",
          displayText: "Denied delete notes.md",
          status: "denied",
        },
      }),
    ]);

    expect(blocks.map((block) => block.kind)).toEqual(["delete", "delete"]);
    expect(blocks.map((block) => block.status)).toEqual(["failed", "denied"]);
    expect(blocks.map((block) => block.displayText)).toEqual([
      "Delete missing.md failed",
      "Denied delete notes.md",
    ]);
  });

  it("preserves write_file streaming content when restoring preview blocks", () => {
    const blocks = createMessageBlocks([
      toolResultEvent({
        toolName: "write_file",
        toolCallId: "tool-write-running",
        ok: true,
        summary: "Write notes.md",
        modelOutput: "",
        uiPreview: {
          kind: "write",
          filePath: "notes.md",
          additions: 0,
          deletions: 0,
          diff: "",
          collapsedLines: 0,
          streamingContent: "# Notes\n\nDraft",
        },
      }),
    ]);

    expect(blocks).toEqual([
      expect.objectContaining({
        kind: "write_diff",
        filePath: "notes.md",
        additions: 0,
        deletions: 0,
        diff: "",
        collapsedLines: 0,
        streamingContent: "# Notes\n\nDraft",
      }),
    ]);
  });

  it("maps legacy context_compaction payloads as auto completed blocks", () => {
    const blocks = createMessageBlocks([
      contextCompactionEvent({
        triggerTokens: 1200,
        thresholdTokens: 1000,
        beforeCount: 10,
        afterCount: 4,
        summaryChars: 240,
        historyRefPath: "/sessions/s1/session.jsonl",
      }),
    ]);

    expect(blocks).toEqual([
      expect.objectContaining({
        kind: "context_compaction",
        status: "completed",
        trigger: "auto",
        summaryText: "Context compacted · 6 messages",
      }),
    ]);
  });

  it("maps manual skipped payloads as Nothing to compact", () => {
    const blocks = createMessageBlocks([
      contextCompactionEvent({
        triggerTokens: 120,
        thresholdTokens: 1000,
        beforeCount: 1,
        afterCount: 1,
        summaryChars: 0,
        historyRefPath: "/sessions/s1/session.jsonl",
        trigger: "manual",
        status: "skipped",
        removedCount: 0,
      }),
    ]);

    expect(blocks[0]).toEqual(expect.objectContaining({
      kind: "context_compaction",
      status: "skipped",
      trigger: "manual",
      summaryText: "Nothing to compact",
    }));
  });

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

    expect(createMessageBlocks([agentToolResultEvent(preview)])).toEqual([
      {
        kind: "agent",
        id: "evt_agent_result",
        renderKey: "turn:turn-1:tool:toolu-agent-1",
        description: "Explore tool rendering",
        status: "completed",
        subagentType: "explore",
        displayText: "Explore tool rendering",
        summary: "Found the renderer path and the shared selector.",
        transcriptRef: preview.transcriptRef,
        stats: preview.stats,
        recentEvents: undefined,
        error: undefined,
        display: undefined,
        createdAt: "2026-06-02T10:00:00.000Z",
      },
    ]);
  });

  it("restores backgrounded bash results with task fields", () => {
    const blocks = createMessageBlocks([
      toolResultEvent({
        toolName: "bash",
        toolCallId: "tool-bash-bg",
        ok: true,
        summary: "Bash command",
        modelOutput: "status: backgrounded",
        uiPreview: {
          kind: "bash",
          status: "running",
          title: "Bash command (background)",
          command: "pnpm dev",
          backgroundTaskId: "bash_abc123",
          backgroundStatus: "running",
          outputFilePath: "/tmp/tool-output/s1/x-bash.txt",
        },
      }),
    ]);

    expect(blocks[0]).toMatchObject({
      kind: "bash",
      status: "running",
      backgroundTaskId: "bash_abc123",
      backgroundStatus: "running",
      outputFilePath: "/tmp/tool-output/s1/x-bash.txt",
    });
  });

  it("hides task_notification user messages from the conversation entirely", () => {
    const blocks = createMessageBlocks([
      {
        id: "evt-notify",
        sessionId: "session-1",
        turnId: "turn-1",
        type: "user_message",
        timestamp: "2026-07-03T12:00:00.000Z",
        schemaVersion: 1,
        payload: {
          content: [
            "<task_notification>",
            "<task_id>bash_abc123</task_id>",
            "<status>completed</status>",
            "<exit_code>0</exit_code>",
            '<summary>Background command "bash scripts/slow-log.sh" completed (exit code 0)</summary>',
            "</task_notification>",
          ].join("\n"),
          source: "task_notification",
        },
      },
      {
        id: "evt-user",
        sessionId: "session-1",
        turnId: "turn-1",
        type: "user_message",
        timestamp: "2026-07-03T12:00:01.000Z",
        schemaVersion: 1,
        payload: { content: "看看进度" },
      },
    ]);

    // 注入消息不渲染；普通用户消息不受影响
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ kind: "user", content: "看看进度" });
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

    const [block] = createMessageBlocks([agentToolResultEvent(preview)]);

    expect(block).toMatchObject({
      kind: "agent",
      description: "Inspect runtime",
      status: "running",
      recentEvents: preview.recentEvents,
    });
  });
});
