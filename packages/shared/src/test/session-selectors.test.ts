import { describe, expect, it } from "vitest";
import type { AgentToolPreview, SessionEvent, ToolExecutionResult } from "../session";
import { createMessageBlocks, normalizeSessionEvents } from "../session-selectors";

function toolResultEvent(payload: ToolExecutionResult): SessionEvent<ToolExecutionResult> {
  return {
    id: `evt-${payload.uiPreview?.kind ?? "tool"}`,
    sessionId: "session-delete",
    agentRunId: "turn-delete",
    type: "tool_result",
    timestamp: "2026-06-02T12:00:00.000Z",
    schemaVersion: 2,
    payload,
  };
}

function contextCompactionEvent(payload: Record<string, unknown>): SessionEvent<Record<string, unknown>> {
  return {
    id: `evt-${String(payload.status ?? "legacy")}`,
    sessionId: "session-compact",
    agentRunId: "turn-compact",
    type: "context_compaction",
    timestamp: "2026-06-02T00:00:00.000Z",
    schemaVersion: 2,
    payload,
  };
}

function agentToolResultEvent(uiPreview: AgentToolPreview): SessionEvent<ToolExecutionResult> {
  return {
    id: "evt_agent_result",
    sessionId: "session-1",
    agentRunId: "turn-1",
    type: "tool_result",
    timestamp: "2026-06-02T10:00:00.000Z",
    schemaVersion: 2,
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
  it("maps a completed workspace preparation event to a worktree block", () => {
    const blocks = createMessageBlocks([{
      id: "prep-1",
      sessionId: "session-1",
      agentRunId: "turn-1",
      type: "workspace_preparation",
      timestamp: "2026-07-29T00:00:00.000Z",
      schemaVersion: 2,
      payload: {
        kind: "worktree",
        status: "completed",
        sourceWorkspaceRoot: "/work/source",
        workspaceRoot: "/work/worktree",
        baseBranch: "main",
        branch: "actspace/92803054",
        baseCommit: "a1b2c3d4",
        durationMs: 240,
        environmentSetup: "none",
      },
    }]);

    expect(blocks).toEqual([{
      kind: "workspace_preparation",
      id: "prep-1",
      renderKey: "turn:turn-1:workspace-preparation:0",
      status: "completed",
      sourceWorkspaceRoot: "/work/source",
      workspaceRoot: "/work/worktree",
      baseBranch: "main",
      branch: "actspace/92803054",
      baseCommit: "a1b2c3d4",
      durationMs: 240,
      environmentSetup: "none",
      createdAt: "2026-07-29T00:00:00.000Z",
    }]);
  });

  it("ignores malformed workspace preparation events", () => {
    expect(createMessageBlocks([{
      id: "prep-bad",
      sessionId: "session-1",
      agentRunId: "turn-1",
      type: "workspace_preparation",
      timestamp: "2026-07-29T00:00:00.000Z",
      schemaVersion: 2,
      payload: { kind: "worktree", status: "completed" },
    }])).toEqual([]);
  });

  it("accepts only SessionEvent V2 records", () => {
    const v2 = toolResultEvent({
      toolCallId: "tool-v2",
      toolName: "read_file",
      ok: true,
      summary: "ok",
    });
    const v1 = { ...v2, id: "evt-v1", schemaVersion: 1 };

    expect(normalizeSessionEvents([v1, v2])).toEqual([v2]);
  });

  it("restores generated image artifacts from a completed tool preview", () => {
    const image = {
      type: "image" as const,
      name: "generated-01.png",
      path: "/tmp/session/artifacts/generated-01.png",
      mimeType: "image/png",
    };
    const [block] = createMessageBlocks([toolResultEvent({
      toolCallId: "toolu-image-1",
      toolName: "generate_image",
      ok: true,
      summary: "Generated 1 image",
      uiPreview: {
        kind: "image_generation",
        status: "completed",
        promptPreview: "A serene koi pond",
        requestedCount: 1,
        generatedCount: 1,
        model: "gpt-image-2",
        size: "1024x1024",
        displayText: "Generated 1 image",
        images: [image],
      },
      artifacts: [image],
    })]);

    expect(block).toMatchObject({
      kind: "image_generation",
      status: "completed",
      requestedCount: 1,
      generatedCount: 1,
      images: [image],
    });
  });

  it("restores write output paths for the turn artifact shelf", () => {
    const [block] = createMessageBlocks([toolResultEvent({
      toolCallId: "toolu-write-1",
      toolName: "write_file",
      ok: true,
      summary: "Write report.md",
      uiPreview: {
        kind: "write",
        filePath: "report.md",
        outputPath: "/workspace/docs/report.md",
        outputRelativePath: "docs/report.md",
        additions: 4,
        deletions: 0,
        diff: "",
        collapsedLines: 0,
        status: "completed",
      },
    })]);

    expect(block).toMatchObject({
      kind: "write_diff",
      filePath: "report.md",
      outputPath: "/workspace/docs/report.md",
      outputRelativePath: "docs/report.md",
      status: "completed",
    });
  });

  it("derives turn-scoped render keys independently from persisted event ids", () => {
    const timestamp = "2026-07-17T07:00:00.000Z";
    const blocks = createMessageBlocks([
      {
        id: "evt-random-user",
        sessionId: "session-render-key",
        agentRunId: "turn-render-key",
        type: "user_message",
        timestamp,
        schemaVersion: 2,
        payload: { content: "Prompt" },
      },
      {
        id: "evt-random-thinking",
        sessionId: "session-render-key",
        agentRunId: "turn-render-key",
        type: "thinking",
        timestamp,
        schemaVersion: 2,
        payload: { content: "Reasoning" },
      },
      {
        id: "evt-random-assistant",
        sessionId: "session-render-key",
        agentRunId: "turn-render-key",
        type: "assistant_message",
        timestamp,
        schemaVersion: 2,
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

  it("hides signature-only thinking state while keeping readable thinking visible", () => {
    const base = {
      sessionId: "session-thinking",
      agentRunId: "turn-thinking",
      timestamp: "2026-07-28T04:10:00.000Z",
      schemaVersion: 2 as const,
      type: "thinking" as const,
    };
    const blocks = createMessageBlocks([
      {
        ...base,
        id: "thinking-signature-only",
        payload: {
          content: "",
          signature: "openai-responses-reasoning:{\"id\":\"rs_1\",\"type\":\"reasoning\"}",
          api: "openai-responses",
          model: "gpt-5.6-sol",
          provider: "duckcoding",
        },
      },
      {
        ...base,
        id: "thinking-readable",
        payload: { content: "I should inspect the workspace." },
      },
    ]);

    expect(blocks).toEqual([
      {
        kind: "thinking",
        id: "thinking-readable",
        renderKey: "turn:turn-thinking:thinking:0",
        title: "Thinking",
        content: "I should inspect the workspace.",
        createdAt: "2026-07-28T04:10:00.000Z",
        collapsedByDefault: true,
      },
    ]);
  });

  it("attaches the full turn usage to the final visible assistant reply", () => {
    const base = {
      sessionId: "session-usage",
      agentRunId: "turn-usage",
      timestamp: "2026-07-25T12:00:00.000Z",
      schemaVersion: 2 as const,
    };
    const blocks = createMessageBlocks([
      {
        ...base,
        id: "assistant-intermediate",
        type: "assistant_message",
        payload: { content: "I will inspect the files.", stopReason: "toolUse", model: "model-a", provider: "provider-a" },
      },
      {
        ...base,
        id: "usage-usd",
        type: "llm_usage",
        payload: {
          llmCallId: "call-1",
          attempt: 1,
          durationMs: 10,
          provider: "provider-a",
          model: "model-a",
          promptTokens: 100,
          completionTokens: 20,
          totalTokens: 120,
          cost: { input: 0.05, output: 0.05, cacheRead: 0, cacheWrite: 0, total: 0.1, currency: "USD" },
        },
      },
      {
        ...base,
        id: "assistant-final",
        type: "assistant_message",
        payload: { content: "Done.", stopReason: "stop", model: "model-a", provider: "provider-a" },
      },
      {
        ...base,
        id: "usage-cny",
        type: "llm_usage",
        payload: {
          llmCallId: "call-2",
          attempt: 1,
          durationMs: 10,
          provider: "provider-a",
          model: "model-a",
          promptTokens: 150,
          completionTokens: 30,
          totalTokens: 180,
          cost: { input: 3.6, output: 3.6, cacheRead: 0, cacheWrite: 0, total: 7.2, currency: "CNY" },
        },
      },
    ]);

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).not.toHaveProperty("usage");
    expect(blocks[1]).toMatchObject({
      kind: "assistant",
      id: "assistant-final",
      usage: {
        totalTokens: 300,
        costUsd: 1.1,
      },
    });
  });

  it("restores an aborted turn as a persisted Stopped status", () => {
    const blocks = createMessageBlocks([{
      id: "evt-aborted",
      sessionId: "session-aborted",
      agentRunId: "turn-aborted",
      type: "agent_run_aborted",
      timestamp: "2026-07-17T07:00:00.000Z",
      schemaVersion: 2,
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
      agentRunId: "turn-eval",
      type: "eval_candidate",
      timestamp: "2026-07-19T07:00:00.000Z",
      schemaVersion: 2,
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
        agentRunId: "turn-1",
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
          sandboxed: true,
        },
      }),
    ]);

    expect(blocks[0]).toMatchObject({
      kind: "bash",
      status: "running",
      backgroundTaskId: "bash_abc123",
      backgroundStatus: "running",
      outputFilePath: "/tmp/tool-output/s1/x-bash.txt",
      sandboxed: true,
    });
  });

  it("restores a denied Bash result as not executed", () => {
    const blocks = createMessageBlocks([
      toolResultEvent({
        toolName: "bash",
        toolCallId: "tool-bash-denied",
        ok: false,
        summary: "Bash command denied",
        modelOutput: "Permission denied before execution for tool bash",
        uiPreview: {
          kind: "bash",
          status: "denied",
          title: "Bash command denied",
          command: "rm -rf .",
          notExecuted: true,
        },
      }),
    ]);

    expect(blocks[0]).toMatchObject({
      kind: "bash",
      status: "denied",
      notExecuted: true,
    });
  });

  it("hides task_notification user messages from the conversation entirely", () => {
    const blocks = createMessageBlocks([
      {
        id: "evt-notify",
        sessionId: "session-1",
        agentRunId: "turn-1",
        type: "user_message",
        timestamp: "2026-07-03T12:00:00.000Z",
        schemaVersion: 2,
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
        agentRunId: "turn-1",
        type: "user_message",
        timestamp: "2026-07-03T12:00:01.000Z",
        schemaVersion: 2,
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
