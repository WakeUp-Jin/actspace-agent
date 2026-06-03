import { describe, expect, it } from "vitest";
import type { SessionEvent, ToolExecutionResult } from "../session";
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

describe("session selectors", () => {
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
        summaryText: "Context compacted",
        reductionLabel: "6 messages removed",
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
});
