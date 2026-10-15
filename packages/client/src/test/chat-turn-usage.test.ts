import { describe, expect, it } from "vitest";
import type { RuntimeV2SessionSnapshot, SessionEventEnvelopeV1 } from "@actspace/shared/runtime-v2";
import { projectChatEvents } from "../sessions/chat.js";

function snapshot(): RuntimeV2SessionSnapshot {
  return {
    kind: "session-snapshot", schemaVersion: 1, sessionId: "s", createdAt: "2026-10-15T00:00:00.000Z", updatedAt: "2026-10-15T00:00:00.000Z", workspaceRoot: null, throughJournalSeq: 9, permissionMode: "default", accessState: "read-write",
    agentForm: "agent", metadata: { title: null, pinned: false, archived: false },
    messages: [], tools: [], pendingInbox: [], todos: [], delegations: [], usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0, costUsd: null },
    activity: { turnCount: 1, completedTurnCount: 1, stepCount: 1, activeTurnId: null, activeStepId: null, compactionCount: 0, activeCompactionId: null, lastCompactionSummary: null, timing: { llmMs: 0, ttftMs: 0, ttftSteps: 0, decodeMs: 0, decodeTokens: 0 } }, lineage: null,
  };
}

function envelope(seq: number, type: string, data: SessionEventEnvelopeV1["data"]): SessionEventEnvelopeV1 {
  return { recordKind: "event", seq, type, eventVersion: 1, criticality: "required", time: "2026-10-15T00:00:00.000Z", source: { ownerPluginId: "@actspace/core" }, data, surface: null, provenance: { sourceEventSeqs: [], contributorIds: [], runtimeSelectionSeq: null } };
}

const pricing = { version: 1, basis: "estimated", reason: null, pricingSnapshot: { providerId: "deepseek", connectionId: "deepseek:default", modelKey: "deepseek:deepseek-flash", apiModel: "deepseek-flash", currency: "USD" } };
const context = (seq: number, requestId: string) => envelope(seq, "request/context", { requestId, turnId: "t1", stepId: "step-1", snapshot: { prepared: { route: "default", model: "deepseek-flash" } } });

describe("chat projection turn usage", () => {
  it("records one usage per request: failed retry attempts count, empty step ends do not", () => {
    const journal = [
      envelope(1, "turn/start", { turnId: "t1", agentRunId: "run-1" }),
      context(2, "req-1"),
      envelope(3, "llm/retry", { requestId: "req-1", attempt: 1, nextAttempt: 2, usage: { inputTokens: 40, outputTokens: 0, cost: 0.001, costCurrency: "USD", costProvenance: pricing } }),
      context(4, "req-2"),
      envelope(5, "step/end", { turnId: "t1", stepId: "step-1", reason: "completed", usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 300, cacheWriteTokens: 0, reasoningTokens: 5, cost: 0.002, costCurrency: "USD", costProvenance: pricing } }),
      envelope(6, "step/end", { turnId: "t1", stepId: "step-2", reason: "aborted" }),
    ];
    const usage = projectChatEvents(snapshot(), journal).filter((event) => event.type === "llm_usage");
    expect(usage.map((event) => [event.agentRunId, event.llmCallId, event.payload])).toEqual([
      ["run-1", "req-1", expect.objectContaining({ provider: "deepseek", model: "deepseek-flash", promptTokens: 40, totalTokens: 40, costBasis: "estimated", cost: expect.objectContaining({ total: 0.001, currency: "USD" }) })],
      ["run-1", "req-2", expect.objectContaining({ provider: "deepseek", model: "deepseek-flash", promptTokens: 100, completionTokens: 20, cacheHitTokens: 300, reasoningTokens: 5, totalTokens: 420, costBasis: "estimated" })],
    ]);
  });

  it("marks a request without a usable price as unavailable", () => {
    const journal = [
      envelope(1, "turn/start", { turnId: "t1", agentRunId: "run-1" }),
      context(2, "req-1"),
      envelope(3, "step/end", { turnId: "t1", stepId: "step-1", reason: "completed", usage: { inputTokens: 10, outputTokens: 2 } }),
    ];
    const [usage] = projectChatEvents(snapshot(), journal).filter((event) => event.type === "llm_usage");
    expect(usage?.payload).toMatchObject({ model: "deepseek-flash", costBasis: "unavailable", cost: { total: 0 } });
  });
});
