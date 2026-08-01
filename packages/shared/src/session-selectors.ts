import type {
  AssistantMessagePayload,
  ContextCompactionPayload,
  EvalCandidatePayload,
  ContextUsageSnapshot,
  ErrorPayload,
  EventId,
  MessageBlock,
  SessionDiffSummary,
  SessionEvent,
  SessionId,
  ThinkingPayload,
  ToolUiPreview,
  UserMessagePayload
} from "./session";
import { convertUsageCostToUsd } from "./usage-cost";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSessionEvent(value: unknown): value is SessionEvent {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.sessionId === "string" &&
    typeof value.agentRunId === "string" &&
    value.schemaVersion === 2 &&
    typeof value.type === "string" &&
    typeof value.timestamp === "string" &&
    "payload" in value
  );
}

function isToolUiPreview(value: unknown): value is ToolUiPreview {
  return isRecord(value) && typeof value.kind === "string";
}

export function normalizeSessionEvents(records: unknown[]): SessionEvent[] {
  const events: SessionEvent[] = [];

  for (const record of records) {
    if (isSessionEvent(record)) {
      events.push(record);
    }
  }

  return events;
}

function getDisplayTime(timestamp: string): string {
  return timestamp;
}

function getOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function withRenderKey(block: MessageBlock, renderKey: string): MessageBlock {
  return { ...block, renderKey };
}

function legacyToolResultBlock(event: SessionEvent, payload: Record<string, unknown>): MessageBlock {
  const toolName = getOptionalString(payload, "toolName") ?? "Tool";
  const summary = getOptionalString(payload, "summary");
  const output =
    getOptionalString(payload, "truncatedOutput") ??
    getOptionalString(payload, "modelOutput") ??
    getOptionalString(payload, "rawOutput") ??
    "";
  const ok = payload.ok !== false;

  return {
    kind: "tool",
    id: event.id,
    title: summary ?? toolName,
    content: output,
    createdAt: getDisplayTime(event.timestamp),
    isError: !ok,
  };
}

function messageBlockFromToolPreview(
  eventId: EventId,
  timestamp: string,
  preview: ToolUiPreview,
  isError?: boolean
): MessageBlock {
  switch (preview.kind) {
    case "read":
      return {
        kind: "read",
        id: eventId,
        filePath: preview.filePath,
        range: preview.range,
        displayText: preview.displayText,
        createdAt: getDisplayTime(timestamp)
      };
    case "search":
      return {
        kind: "search",
        id: eventId,
        query: preview.query,
        scope: preview.scope,
        resultCount: preview.resultCount,
        displayText: preview.displayText,
        createdAt: getDisplayTime(timestamp)
      };
    case "grep":
      return {
        kind: "grep",
        id: eventId,
        pattern: preview.pattern,
        scope: preview.scope,
        resultCount: preview.resultCount,
        displayText: preview.displayText,
        createdAt: getDisplayTime(timestamp)
      };
    case "glob":
      return {
        kind: "glob",
        id: eventId,
        pattern: preview.pattern,
        scope: preview.scope,
        resultCount: preview.resultCount,
        displayText: preview.displayText,
        createdAt: getDisplayTime(timestamp)
      };
    case "web_search":
      return {
        kind: "web_search",
        id: eventId,
        mode: preview.mode,
        query: preview.query,
        url: preview.url,
        displayText: preview.displayText,
        createdAt: getDisplayTime(timestamp),
        resultUrls: preview.resultUrls,
        contentPreview: preview.contentPreview,
      };
    case "media_analysis":
      return {
        kind: "media_analysis",
        id: eventId,
        mediaName: preview.mediaName,
        mediaKind: preview.mediaKind,
        displayText: preview.displayText,
        createdAt: getDisplayTime(timestamp),
        isError
      };
    case "image_generation":
      return {
        kind: "image_generation",
        id: eventId,
        status: preview.status,
        promptPreview: preview.promptPreview,
        requestedCount: preview.requestedCount,
        generatedCount: preview.generatedCount,
        model: preview.model,
        size: preview.size,
        displayText: preview.displayText,
        images: preview.images,
        warning: preview.warning,
        errorMessage: preview.errorMessage,
        createdAt: getDisplayTime(timestamp),
      };
    case "directory_list":
      return {
        kind: "directory_list",
        id: eventId,
        path: preview.path,
        entryCount: preview.entryCount,
        displayText: preview.displayText,
        createdAt: getDisplayTime(timestamp)
      };
    case "edit_diff":
      return {
        kind: "edit_diff",
        id: eventId,
        filePath: preview.filePath,
        ...(preview.outputPath ? { outputPath: preview.outputPath } : {}),
        ...(preview.outputRelativePath ? { outputRelativePath: preview.outputRelativePath } : {}),
        additions: preview.additions,
        deletions: preview.deletions,
        diff: preview.diff,
        collapsedLines: preview.collapsedLines,
        status: preview.status ?? (isError ? "failed" : undefined),
        approvalRequestId: preview.approvalRequestId,
        errorMessage: preview.errorMessage,
        createdAt: getDisplayTime(timestamp)
      };
    case "write":
      return {
        kind: "write_diff",
        id: eventId,
        filePath: preview.filePath,
        ...(preview.outputPath ? { outputPath: preview.outputPath } : {}),
        ...(preview.outputRelativePath ? { outputRelativePath: preview.outputRelativePath } : {}),
        additions: preview.additions,
        deletions: preview.deletions,
        diff: preview.diff,
        collapsedLines: preview.collapsedLines,
        status: preview.status ?? (isError ? "failed" : undefined),
        approvalRequestId: preview.approvalRequestId,
        errorMessage: preview.errorMessage,
        streamingContent: preview.streamingContent,
        createdAt: getDisplayTime(timestamp)
      };
    case "delete": {
      const status = preview.status ?? (isError ? "failed" : "completed");
      return {
        kind: "delete",
        id: eventId,
        filePath: preview.filePath,
        displayText: preview.displayText,
        status,
        isError,
        approvalRequestId: preview.approvalRequestId,
        createdAt: getDisplayTime(timestamp)
      };
    }
    case "bash":
      return {
        kind: "bash",
        id: eventId,
        status: preview.status,
        title: preview.title,
        command: preview.command,
        commandPreview: preview.commandPreview,
        cwd: preview.cwd,
        stdout: preview.stdout,
        stderr: preview.stderr,
        exitCode: preview.exitCode,
        durationMs: preview.durationMs,
        reason: preview.reason,
        policyLabel: preview.policyLabel,
        backgroundTaskId: preview.backgroundTaskId,
        backgroundStatus: preview.backgroundStatus,
        outputFilePath: preview.outputFilePath,
        sandboxed: preview.sandboxed,
        notExecuted: preview.notExecuted,
        createdAt: getDisplayTime(timestamp)
      };
    case "agent":
      return {
        kind: "agent",
        id: eventId,
        description: preview.description,
        status: preview.status,
        subagentType: preview.subagentType,
        displayText: preview.displayText,
        summary: preview.summary,
        recentEvents: preview.recentEvents,
        transcriptRef: preview.transcriptRef,
        stats: preview.stats,
        error: preview.error,
        display: preview.display,
        createdAt: getDisplayTime(timestamp)
      };
    case "generic":
      return {
        kind: "tool",
        id: eventId,
        title: preview.title,
        content: preview.content,
        createdAt: getDisplayTime(timestamp),
        isError
      };
  }
}

function contextCompactionBlock(event: SessionEvent): MessageBlock[] {
  const payload = isRecord(event.payload) ? event.payload as ContextCompactionPayload : null;
  if (
    !payload ||
    typeof payload.triggerTokens !== "number" ||
    typeof payload.thresholdTokens !== "number" ||
    typeof payload.beforeCount !== "number" ||
    typeof payload.afterCount !== "number"
  ) {
    return [];
  }

  const trigger = payload.trigger ?? "auto";
  const status = payload.status ?? "compacted";
  const removedCount = payload.removedCount ?? Math.max(payload.beforeCount - payload.afterCount, 0);
  const summaryText = status === "skipped"
    ? "Nothing to compact"
    : status === "failed"
      ? "Context compaction failed"
      : removedCount > 0
        ? `Context compacted · ${removedCount} ${removedCount === 1 ? "message" : "messages"}`
        : "Context compacted";

  return [
    {
      kind: "context_compaction",
      id: event.id,
      status: status === "compacted" ? "completed" : status,
      trigger,
      summaryText,
      createdAt: getDisplayTime(event.timestamp),
    }
  ];
}

export function createMessageBlocks(events: SessionEvent[]): MessageBlock[] {
  const lastAssistantEventIdByTurn = new Map<string, EventId>();
  const usageByTurn = new Map<string, { totalTokens: number; costUsd: number }>();

  for (const event of events) {
    if (event.type === "assistant_message" || event.type === "assistant_reply") {
      lastAssistantEventIdByTurn.set(event.agentRunId, event.id);
      continue;
    }

    if (event.type !== "llm_usage" || !isRecord(event.payload)) continue;
    const totalTokens = event.payload.totalTokens;
    const cost = event.payload.cost;
    if (typeof totalTokens !== "number" || !isRecord(cost)) continue;
    const currency = cost.currency;
    const total = cost.total;
    if ((currency !== "USD" && currency !== "CNY") || typeof total !== "number") continue;

    const current = usageByTurn.get(event.agentRunId) ?? { totalTokens: 0, costUsd: 0 };
    current.totalTokens += totalTokens;
    current.costUsd += convertUsageCostToUsd({ total, currency });
    usageByTurn.set(event.agentRunId, current);
  }

  const renderKeyCounters = new Map<string, number>();
  const nextRenderKey = (event: SessionEvent, slot: string, stableIdentity?: string): string => {
    if (stableIdentity) {
      return `turn:${event.agentRunId}:${slot}:${stableIdentity}`;
    }

    const counterKey = `${event.agentRunId}:${slot}`;
    const index = renderKeyCounters.get(counterKey) ?? 0;
    renderKeyCounters.set(counterKey, index + 1);
    return `turn:${event.agentRunId}:${slot}:${index}`;
  };

  return events.flatMap((event): MessageBlock[] => {
    switch (event.type) {
      case "user_message": {
        const payload = event.payload as UserMessagePayload;
        // 任务通知注入消息只给模型消费，用户侧不渲染：
        // 任务状态由 bash 块徽标（bash_task_update）呈现，输出在落盘文件里
        if (payload.source === "task_notification") {
          return [];
        }
        return [
          {
            kind: "user",
            id: event.id,
            renderKey: nextRenderKey(event, "user"),
            content: payload.content,
            createdAt: getDisplayTime(event.timestamp),
            attachments: payload.attachments
          }
        ];
      }
      case "assistant_message":
      case "assistant_reply": {
        const payload = event.payload as AssistantMessagePayload;
        const usage = lastAssistantEventIdByTurn.get(event.agentRunId) === event.id
          ? usageByTurn.get(event.agentRunId)
          : undefined;
        return [
          {
            kind: "assistant",
            id: event.id,
            renderKey: nextRenderKey(event, "assistant"),
            content: payload.content,
            createdAt: getDisplayTime(event.timestamp),
            model: payload.model,
            provider: payload.provider,
            ...(usage ? { usage } : {}),
          }
        ];
      }
      case "thinking": {
        const payload = event.payload as ThinkingPayload;
        // Signature-only thinking events are provider replay state, not visible content.
        if (!payload.content.trim()) return [];
        return [
          {
            kind: "thinking",
            id: event.id,
            renderKey: nextRenderKey(event, "thinking"),
            title: payload.title ?? "Thinking",
            content: payload.content,
            createdAt: getDisplayTime(event.timestamp),
            collapsedByDefault: payload.collapsedByDefault ?? true
          }
        ];
      }
      case "tool_result": {
        const payload: Record<string, unknown> = isRecord(event.payload) ? event.payload : {};
        const preview = payload.uiPreview;
        const renderKey = nextRenderKey(event, "tool", getOptionalString(payload, "toolCallId"));
        if (!isToolUiPreview(preview)) {
          return [withRenderKey(legacyToolResultBlock(event, payload), renderKey)];
        }

        return [withRenderKey(
          messageBlockFromToolPreview(event.id, event.timestamp, preview, payload.ok === false),
          renderKey,
        )];
      }
      case "diff_preview": {
        const preview = event.payload;
        if (!isToolUiPreview(preview)) return [];
        return [withRenderKey(
          messageBlockFromToolPreview(event.id, event.timestamp, preview),
          nextRenderKey(event, "tool-preview"),
        )];
      }
      case "error": {
        const payload = event.payload as ErrorPayload;
        return [
          {
            kind: "error",
            id: event.id,
            renderKey: nextRenderKey(event, "error"),
            title: payload.code,
            content: payload.message,
            createdAt: getDisplayTime(event.timestamp),
            recoverable: payload.recoverable
          }
        ];
      }
      case "agent_run_aborted":
        return [
          {
            kind: "status",
            id: event.id,
            renderKey: nextRenderKey(event, "status"),
            content: "Stopped",
            createdAt: getDisplayTime(event.timestamp),
            tone: "muted",
          },
        ];
      case "tool_call":
      case "llm_usage":
      case "context_snapshot":
        return [];
      case "context_compaction":
        return contextCompactionBlock(event).map((block) =>
          withRenderKey(block, nextRenderKey(event, "context-compaction")),
        );
      case "eval_candidate": {
        const payload = event.payload as EvalCandidatePayload;
        return [
          {
            kind: "status",
            id: event.id,
            renderKey: nextRenderKey(event, "eval-candidate"),
            content: payload.summary,
            createdAt: getDisplayTime(event.timestamp),
            tone: payload.status === "failed" ? "error" : "muted",
          },
        ];
      }
      // Kairos 自治模式专属事件不出现在主 Agent 消息流中；若历史 session 偶然包含也直接跳过。
      case "kairos_tick_injected":
      case "kairos_sleep_start":
      case "kairos_sleep_end":
      case "kairos_sleep_interrupted":
        return [];
    }
  });
}

export function getLatestContextSnapshot(events: SessionEvent[]): ContextUsageSnapshot | null {
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    if (event.type === "context_snapshot") {
      return event.payload as ContextUsageSnapshot;
    }
  }

  return null;
}

export function createSessionDiffSummary(sessionId: SessionId, events: SessionEvent[]): SessionDiffSummary {
  const files = new Map<string, SessionDiffSummary["files"][number]>();

  for (const event of events) {
    if (event.type !== "tool_result" && event.type !== "diff_preview") {
      continue;
    }

    const preview: unknown =
      event.type === "tool_result"
        ? (event.payload as { uiPreview?: unknown }).uiPreview
        : event.payload;

    if (!isToolUiPreview(preview) || (preview.kind !== "edit_diff" && preview.kind !== "write")) {
      continue;
    }

    // 失败/被拒/未完成的写入没有真实落盘变更，不进 Review 汇总（旧事件无 status，保持原行为）。
    if (preview.status !== undefined && preview.status !== "completed") {
      continue;
    }

    const existing = files.get(preview.filePath);
    if (existing) {
      existing.additions += preview.additions;
      existing.deletions += preview.deletions;
      existing.diff = `${existing.diff}\n${preview.diff}`;
      existing.sourceEventIds.push(event.id);
      continue;
    }

    files.set(preview.filePath, {
      filePath: preview.filePath,
      additions: preview.additions,
      deletions: preview.deletions,
      diff: preview.diff,
      sourceEventIds: [event.id]
    });
  }

  const fileList = [...files.values()];

  return {
    sessionId,
    files: fileList,
    totalAdditions: fileList.reduce((total, file) => total + file.additions, 0),
    totalDeletions: fileList.reduce((total, file) => total + file.deletions, 0)
  };
}
