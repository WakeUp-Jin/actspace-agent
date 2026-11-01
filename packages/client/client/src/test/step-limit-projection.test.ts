import { describe, expect, it } from "vitest";
import type { RuntimeV2SessionSnapshot, SessionEventEnvelopeV1 } from "@actspace/shared/runtime-v2";
import { projectChatEvents } from "../sessions/chat.js";

function snapshot(sessionId: string, throughJournalSeq: number): RuntimeV2SessionSnapshot {
  return {
    kind: "session-snapshot", schemaVersion: 1, sessionId, createdAt: "2026-08-30T00:00:00.000Z", updatedAt: "2026-08-30T00:00:00.000Z", workspaceRoot: null, throughJournalSeq, permissionMode: "default", accessState: "read-write",
    agentForm: "agent", agentMode: "chat", agentModeRevision: 1, metadata: { title: null, pinned: false, archived: false }, messages: [], tools: [], pendingInbox: [], todos: [], delegations: [], usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0, costUsd: null }, activity: { turnCount: 0, completedTurnCount: 0, stepCount: 0, activeTurnId: null, activeStepId: null, compactionCount: 0, activeCompactionId: null, lastCompactionSummary: null, timing: { llmMs: 0, ttftMs: 0, ttftSteps: 0, decodeMs: 0, decodeTokens: 0 } }, lineage: null,
  };
}

function event(type: string, seq: number, time: string, data: SessionEventEnvelopeV1["data"]): SessionEventEnvelopeV1 {
  return { recordKind: "event", seq, type, eventVersion: 1, criticality: "required", time, source: { ownerPluginId: "@actspace/core" }, data, surface: null, provenance: { sourceEventSeqs: [], contributorIds: [], runtimeSelectionSeq: null } };
}

describe("step-limit projection", () => {
  const steps = (count: number) => Array.from({ length: count }, (_, index) => event("step/start", index + 1, "2026-10-31T00:00:00.000Z", { turnId: "t1", stepId: `s${index}`, agentRunId: "r1", stepIndex: index + 1 }));

  it("shows a neutral notice with the actual step count instead of an error", () => {
    const journal = [event("turn/start", 0, "2026-10-31T00:00:00.000Z", { turnId: "t1", agentRunId: "r1", mode: "agent", modeRevision: 0 }), ...steps(3), event("turn/end", 4, "2026-10-31T00:10:00.000Z", { turnId: "t1", reason: "step-limit" })];
    const events = projectChatEvents(snapshot("s", 4), journal);
    expect(events.map(item => item.type)).not.toContain("error");
    expect(events.at(-1)).toMatchObject({ type: "agent_run_notice", payload: { message: "本轮达到 3 步上限，已停止。发送「继续」可以接着做。" } });
  });

  it("omits the number when the window no longer holds the turn's steps", () => {
    const journal = [event("turn/end", 9, "2026-10-31T00:10:00.000Z", { turnId: "t1", reason: "step-limit" })];
    expect(projectChatEvents(snapshot("s", 9), journal).at(-1)).toMatchObject({ type: "agent_run_notice", payload: { message: expect.stringContaining("步数上限") } });
  });
});
