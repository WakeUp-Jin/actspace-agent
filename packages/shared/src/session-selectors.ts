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
  ToolExecutionResult,
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

function createGenericToolPreview(payload: ToolExecutionResult): ToolUiPreview {
  return {
    kind: "generic",
    title: payload.summary || payload.toolName,
    content: payload.modelOutput ?? payload.truncatedOutput ?? payload.rawOutput ?? ""
  };
}

function inferToolPreview(payload: ToolExecutionResult): ToolUiPreview {
  if (payload.uiPreview) {
    return payload.uiPreview;
  }

  const artifact = payload.artifacts?.[0];
  if (payload.toolName === "read_file" && artifact?.name) {
    return {
      kind: "read",
      filePath: artifact.name,
      displayText: payload.summary || `Read ${artifact.name}`
    };
  }

  if (payload.toolName === "search_files") {
    return {
      kind: "search",
      query: payload.summary.replace(/^Search for\s+/i, "") || "unknown",
      displayText: payload.summary || "Searched files"
    };
  }

  if (payload.toolName === "edit_file_diff" && artifact?.name) {
    return {
      kind: "edit_diff",
      filePath: artifact.name,
      additions: countDiffLines(payload.truncatedOutput ?? payload.rawOutput ?? "", "+"),
      deletions: countDiffLines(payload.truncatedOutput ?? payload.rawOutput ?? "", "-"),
      diff: payload.truncatedOutput ?? payload.rawOutput ?? "",
      collapsedLines: 5
    };
  }

  return createGenericToolPreview(payload);
}

function countDiffLines(diff: string, marker: "+" | "-"): number {
  return diff
    .split("\n")
    .filter((line) => line.startsWith(marker) && !line.startsWith(`${marker}${marker}${marker}`)).length;
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
        const payload = event.payload as ToolExecutionResult;
        const preview = inferToolPreview(payload);
        return [messageBlockFromToolPreview(event.id, event.timestamp, preview, !payload.ok)];
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
        ? inferToolPreview(event.payload as ToolExecutionResult)
        : (event.payload as ToolUiPreview);

    if (preview.kind !== "edit_diff") {
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
