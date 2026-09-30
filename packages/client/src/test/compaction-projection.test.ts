import { describe, expect, it } from "vitest";
import type { RuntimeV2SessionSnapshot, SessionEventEnvelopeV1 } from "@actspace/shared/runtime-v2";
import { projectChatEvents } from "../sessions/chat.js";

function snapshot(sessionId: string, throughJournalSeq: number): RuntimeV2SessionSnapshot {
  return {
    kind: "session-snapshot", schemaVersion: 1, sessionId, createdAt: "2026-08-30T00:00:00.000Z", updatedAt: "2026-08-30T00:00:00.000Z", workspaceRoot: null, throughJournalSeq, permissionMode: "default", accessState: "read-write",
    agentForm: "agent", agentMode: "chat", agentModeRevision: 1, metadata: { title: null, pinned: false, archived: false }, messages: [], tools: [], pendingInbox: [], todos: [], delegations: [], usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0, costUsd: null }, activity: { turnCount: 0, completedTurnCount: 0, stepCount: 0, activeTurnId: null, activeStepId: null, compactionCount: 0, activeCompactionId: null, lastCompactionSummary: null }, lineage: null,
  };
}

function event(type: string, seq: number, time: string, data: SessionEventEnvelopeV1["data"]): SessionEventEnvelopeV1 {
  return { recordKind: "event", seq, type, eventVersion: 1, criticality: "required", time, source: { ownerPluginId: "@actspace/core" }, data, surface: null, provenance: { sourceEventSeqs: [], contributorIds: [], runtimeSelectionSeq: null } };
}

describe("durable compaction duration", () => {
  it.each([
    { value: 1500, expected: 1500 },
    { value: 0, expected: 0 },
    { value: undefined, expected: 16 },
    { value: -1, expected: 16 },
    { value: "1500", expected: 16 },
  ])("projects duration $value as $expected after replay", ({ value, expected }) => {
    const journal = [
      event("compaction/start", 0, "2026-09-30T00:00:00.000Z", { compactionId: "c", start: 0, end: 4 }),
      event("compaction/end", 1, "2026-09-30T00:00:00.016Z", { compactionId: "c", ...(value === undefined ? {} : { durationMs: value }) }),
    ];
    expect(projectChatEvents(snapshot("s", 1), journal)).toEqual([
      expect.objectContaining({ type: "context_compaction", payload: expect.objectContaining({ durationMs: expected }) }),
    ]);
  });
});
