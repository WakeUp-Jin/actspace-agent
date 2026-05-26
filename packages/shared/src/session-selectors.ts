import type {
  AssistantMessagePayload,
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

type LegacyTurnResultRecord = {
  type: "turn_result";
  payload?: {
    events?: SessionEvent[];
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isLegacyTurnResultRecord(value: unknown): value is LegacyTurnResultRecord {
  return isRecord(value) && value.type === "turn_result";
}

function isSessionEvent(value: unknown): value is SessionEvent {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.sessionId === "string" &&
    typeof value.turnId === "string" &&
    typeof value.type === "string" &&
    typeof value.timestamp === "string" &&
    "payload" in value
  );
}

export function normalizeSessionEvents(records: unknown[]): SessionEvent[] {
  const events: SessionEvent[] = [];

  for (const record of records) {
    if (isLegacyTurnResultRecord(record) && Array.isArray(record.payload?.events)) {
      events.push(...record.payload.events.filter(isSessionEvent));
      continue;
    }

    if (isSessionEvent(record)) {
      events.push(record);
    }
  }

  return events;
}

function getDisplayTime(timestamp: string): string {
  return timestamp;
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
        createdAt: getDisplayTime(timestamp)
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
        additions: preview.additions,
        deletions: preview.deletions,
        diff: preview.diff,
        collapsedLines: preview.collapsedLines,
        createdAt: getDisplayTime(timestamp)
      };
    case "write":
      return {
        kind: "write_diff",
        id: eventId,
        filePath: preview.filePath,
        additions: preview.additions,
        deletions: preview.deletions,
        diff: preview.diff,
        collapsedLines: preview.collapsedLines,
        createdAt: getDisplayTime(timestamp)
      };
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

export function createMessageBlocks(events: SessionEvent[]): MessageBlock[] {
  return events.flatMap((event): MessageBlock[] => {
    switch (event.type) {
      case "user_message": {
        const payload = event.payload as UserMessagePayload;
        return [
          {
            kind: "user",
            id: event.id,
            content: payload.content,
            createdAt: getDisplayTime(event.timestamp),
            attachments: payload.attachments
          }
        ];
      }
      case "assistant_message":
      case "assistant_reply": {
        const payload = event.payload as AssistantMessagePayload;
        return [
          {
            kind: "assistant",
            id: event.id,
            content: payload.content,
            createdAt: getDisplayTime(event.timestamp),
            model: payload.model,
            provider: payload.provider
          }
        ];
      }
      case "thinking": {
        const payload = event.payload as ThinkingPayload;
        return [
          {
            kind: "thinking",
            id: event.id,
            title: payload.title ?? "Thinking",
            content: payload.content,
            createdAt: getDisplayTime(event.timestamp),
            collapsedByDefault: payload.collapsedByDefault ?? true
          }
        ];
      }
      case "tool_result": {
        const payload = event.payload as { ok: boolean; uiPreview: ToolUiPreview };
        return [messageBlockFromToolPreview(event.id, event.timestamp, payload.uiPreview, !payload.ok)];
      }
      case "diff_preview": {
        const preview = event.payload as ToolUiPreview;
        return [messageBlockFromToolPreview(event.id, event.timestamp, preview)];
      }
      case "error": {
        const payload = event.payload as ErrorPayload;
        return [
          {
            kind: "error",
            id: event.id,
            title: payload.code,
            content: payload.message,
            createdAt: getDisplayTime(event.timestamp),
            recoverable: payload.recoverable
          }
        ];
      }
      case "tool_call":
      case "llm_usage":
      case "context_snapshot":
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

    const preview =
      event.type === "tool_result"
        ? (event.payload as { uiPreview: ToolUiPreview }).uiPreview
        : (event.payload as ToolUiPreview);

    if (preview.kind !== "edit_diff" && preview.kind !== "write") {
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
