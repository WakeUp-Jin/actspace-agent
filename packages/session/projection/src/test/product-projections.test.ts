import { describe, expect, it } from "vitest";
import { createCoreCodecRegistry, SessionJournal, type RuntimeV2JsonValue, type SessionEventEnvelopeV1 } from "@actspace/session-journal";
import { projectComposer, projectProviderUsage, projectRequestContextEstimate } from "../product-projections.js";
import type { RuntimeV2SessionSnapshot } from "@actspace/shared/runtime-v2";

const source = { ownerPluginId: "@actspace/core" } as const;

function snapshot(patch: Partial<RuntimeV2SessionSnapshot> = {}): RuntimeV2SessionSnapshot {
  return {
    kind: "session-snapshot", schemaVersion: 1, sessionId: "session-1", createdAt: "2026-08-30T00:00:00.000Z", updatedAt: "2026-08-30T00:00:00.000Z", workspaceRoot: null, throughJournalSeq: 0, accessState: "read-write", metadata: { title: null, pinned: false, archived: false }, messages: [], tools: [], pendingInbox: [], todos: [], delegations: [], usage: { inputTokens: 10, outputTokens: 4, cacheReadTokens: 2, cacheWriteTokens: 0, totalTokens: 16, costUsd: null }, activity: { turnCount: 0, completedTurnCount: 0, stepCount: 0, activeTurnId: null, activeStepId: null, compactionCount: 0, activeCompactionId: null, lastCompactionSummary: null }, lineage: null, ...patch,
  };
}

describe("Session product projections", () => {
  it("keeps provider usage and request context estimate separate", () => {
    const journal = new SessionJournal({ registry: createCoreCodecRegistry(), now: () => "2026-08-30T00:00:00.000Z" });
    journal.append({ type: "turn/start", eventVersion: 1, source, data: { turnId: "turn-1" }, surface: null });
    journal.append({ type: "step/start", eventVersion: 1, source, data: { turnId: "turn-1", stepId: "step-1" }, surface: null });
    journal.append({ type: "request/header", eventVersion: 1, source, data: { requestId: "request-1", turnId: "turn-1", stepId: "step-1", contextWindow: 1_000_000 }, surface: null });
    journal.append({ type: "request/context", eventVersion: 1, source, data: { requestId: "request-1", turnId: "turn-1", stepId: "step-1", snapshot: { prepared: { contextWindow: 1_000_000 }, messages: [{ role: "user", content: "hello" }] } as RuntimeV2JsonValue }, surface: null });
    const current = snapshot({ throughJournalSeq: 3 });
    expect(projectProviderUsage(current).kind).toBe("provider-usage");
    expect(projectProviderUsage(current).usage.totalTokens).toBe(16);
    expect(projectRequestContextEstimate(current, journal.events)).toMatchObject({ kind: "request-context-estimate", requestId: "request-1", throughJournalSeq: 3 });
    expect(projectRequestContextEstimate(current, journal.events).maxTokens).toBe(1_000_000);
  });

  it("derives Composer phase from Session-owned facts", () => {
    expect(projectComposer(snapshot()).phase).toBe("blank");
    expect(projectComposer(snapshot({ messages: [{ kind: "user", messageId: "m", content: "hello" }] })).phase).toBe("active");
    expect(projectComposer(snapshot({ activity: { ...snapshot().activity, activeTurnId: "turn-1" } })).phase).toBe("active");
  });
});
