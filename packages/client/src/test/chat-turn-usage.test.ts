import { describe, expect, it } from "vitest";
import { createMessageBlocks } from "@actspace/shared";
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

  it("includes two vision attempts in the owning reply's seven-main-request total without extra messages", () => {
    const journal = [envelope(1, "turn/start", { turnId: "t1", agentRunId: "run-1" })];
    for (let i = 0; i < 7; i++) {
      journal.push(context(journal.length + 1, `main-${i}`));
      journal.push(envelope(journal.length + 1, "step/end", { turnId: "t1", stepId: "step-1", usage: { inputTokens: 100, outputTokens: 20 } }));
      if (i >= 2) continue;
      const identity = { agentRunId: "run-1", turnId: "t1", stepId: "step-1", callId: `inspect-${i}`, logicalRequestId: `vision-${i}`, attemptId: `vision-${i}-1`, attempt: 1, purpose: "image-inspection", routeId: "vision-route", model: "vision-model" };
      journal.push(envelope(journal.length + 1, "llm/auxiliary-start", identity));
      journal.push(envelope(journal.length + 1, "llm/auxiliary-end", { ...identity, status: "completed", usage: { inputTokens: 100, outputTokens: 20, cost: null } }));
    }
    const assistant = envelope(journal.length + 1, "assistant/message", { agentRunId: "run-1", messageId: "answer" });
    journal.push({ ...assistant, surface: { kind: "append", node: { kind: "assistant", messageId: "answer", content: "Done" } } });
    const state = { ...snapshot(), messages: [{ kind: "assistant" as const, messageId: "answer", content: "Done" }] };
    const events = projectChatEvents(state, journal);
    const usage = events.filter(event => event.type === "llm_usage");
    expect(usage).toHaveLength(9);
    expect(usage.filter(event => event.llmCallId?.startsWith("vision-"))).toEqual([
      expect.objectContaining({ agentRunId: "run-1", turnId: "t1", llmCallId: "vision-0-1", payload: expect.objectContaining({ provider: "vision-route", model: "vision-model", totalTokens: 120, costBasis: "unavailable" }) }),
      expect.objectContaining({ agentRunId: "run-1", turnId: "t1", llmCallId: "vision-1-1", payload: expect.objectContaining({ provider: "vision-route", model: "vision-model", totalTokens: 120, costBasis: "unavailable" }) }),
    ]);
    const blocks = createMessageBlocks(events);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ kind: "assistant", content: "Done", usage: { totalTokens: 1080, inputTokens: 900, outputTokens: 180, unpricedRequestCount: 9, routes: expect.arrayContaining(["vision-route/vision-model"]) } });
    expect(createMessageBlocks(projectChatEvents(state, [...journal]))).toEqual(blocks);
  });

  it("counts reported failed/cancelled vision attempts, retaining zero but not inventing unknown usage", () => {
    const terminal = (seq: number, attempt: number, status: string, usage: SessionEventEnvelopeV1["data"]) => envelope(seq, "llm/auxiliary-end", { agentRunId: "run-1", turnId: "t1", attemptId: `vision-${attempt}`, attempt, routeId: "vision-route", model: "vision-model", status, usage });
    const journal = [
      terminal(1, 1, "failed", { inputTokens: 12, outputTokens: null }),
      terminal(2, 2, "aborted", { inputTokens: 0, outputTokens: 0 }),
      terminal(3, 3, "completed", { inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null }),
      envelope(4, "llm/auxiliary-start", { attemptId: "pending", agentRunId: "run-1" }),
    ];
    const usage = projectChatEvents(snapshot(), journal).filter(event => event.type === "llm_usage");
    expect(usage).toHaveLength(2);
    expect(usage.map(event => event.payload)).toEqual([
      expect.objectContaining({ attempt: 1, totalTokens: 12 }),
      expect.objectContaining({ attempt: 2, totalTokens: 0 }),
    ]);
  });
});
