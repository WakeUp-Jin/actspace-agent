import { describe, expect, it } from "vitest";
import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";
import { registerSessionFacts } from "../facts.js";
import { SessionProjectionRegistry } from "../registry.js";

function fixture() {
  const registry = new SessionProjectionRegistry();
  registerSessionFacts(registry, value => value);
  const events: SessionEventEnvelopeV1[] = [];
  const append = (type: string, data: Record<string, unknown>) => {
    const event = { recordKind: "event", seq: events.length, type, eventVersion: 1, criticality: "required", time: "2026-10-23T00:00:00Z", source: { ownerPluginId: "@actspace/core" }, data, surface: null, provenance: { sourceEventSeqs: [], contributorIds: [], runtimeSelectionSeq: null } } as SessionEventEnvelopeV1;
    events.push(event);
    registry.apply("s", event);
  };
  return { registry, events, append };
}

describe("auxiliary request usage facts", () => {
  it("counts seven main and two vision requests once, without changing main step statistics", () => {
    const { registry, events, append } = fixture();
    append("turn/start", { turnId: "t", agentRunId: "run" });
    for (let i = 0; i < 7; i++) {
      const stepId = `step-${i}`, requestId = `main-${i}`;
      const usage = { inputTokens: 100, outputTokens: 20 };
      append("step/start", { turnId: "t", stepId });
      append("request/header", { turnId: "t", stepId, requestId });
      append("assistant/message", { turnId: "t", stepId, requestId, usage });
      if (i < 2) {
        const identity = { sessionId: "s", agentRunId: "run", turnId: "t", stepId, callId: `image-${i}`, logicalRequestId: `vision-${i}`, attemptId: `vision-${i}-1`, attempt: 1, purpose: "image-inspection", routeId: "vision", model: "vision-model", startedAt: "2026-10-23T00:00:00Z" };
        append("llm/auxiliary-start", identity);
        append("llm/auxiliary-end", { ...identity, status: "completed", finishedAt: "2026-10-23T00:00:01Z", usage: { inputTokens: 90, outputTokens: 10, cacheReadTokens: 20, cacheWriteTokens: 0, reasoningTokens: null, cost: null, costCurrency: null, source: "provider-reported" } });
      }
      append("step/end", { turnId: "t", stepId, usage });
    }
    expect(registry.snapshot("s").values.providerUsage).toEqual({ inputTokens: 880, outputTokens: 160, cacheReadTokens: 40, cacheWriteTokens: 0, totalTokens: 1080, costUsd: null });
    expect(registry.snapshot("s").values.sessionStats).toMatchObject({ stepCount: 7, turnCount: 1 });
    const state = registry.checkpoint("s").rows.providerUsage!.state as Record<string, unknown>;
    expect(state.selected).toEqual({});
    const replay = new SessionProjectionRegistry(); registerSessionFacts(replay, value => value);
    replay.sync("s", events); replay.sync("s", events);
    expect(replay.snapshot("s").values.providerUsage).toEqual(registry.snapshot("s").values.providerUsage);
  });

  it("counts reported partial failed/aborted usage and preserves a known zero price", () => {
    const { registry, append } = fixture();
    append("step/start", { stepId: "step" });
    append("llm/auxiliary-start", { stepId: "step", attemptId: "crashed" });
    expect(registry.snapshot("s").values.providerUsage).toMatchObject({ totalTokens: 0, costUsd: null });
    for (const [attemptId, status, outputTokens] of [["a1", "failed", null], ["a2", "aborted", 0]] as const) {
      append("llm/auxiliary-end", { stepId: "step", attemptId, status, usage: { inputTokens: 12, outputTokens, cacheReadTokens: null, cacheWriteTokens: null, reasoningTokens: null, cost: 0, costCurrency: "USD", costProvenance: { version: 1, basis: "provider-reported" } } });
    }
    expect(registry.snapshot("s").values.providerUsage).toMatchObject({ inputTokens: 24, outputTokens: 0, totalTokens: 24, costUsd: 0 });
  });

  it("rejects pre-auxiliary usage checkpoints so complete journals rebuild", () => {
    const { registry } = fixture();
    const checkpoint = registry.checkpoint("s");
    const old = { ...checkpoint, rows: { ...checkpoint.rows, providerUsage: { ...checkpoint.rows.providerUsage!, stateVersion: 2 } } };
    expect(() => registry.restore("s", old)).toThrow("version mismatch: providerUsage");
  });
});
