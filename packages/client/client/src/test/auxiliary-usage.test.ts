import { describe, expect, it } from "vitest";
import type { SessionEventEnvelopeV1 } from "@actspace/shared/runtime-v2";
import { projectSessionUsageActivities } from "../sessions/chat.js";
import { projectTrajectoryWindow } from "../sessions/trajectory.js";
import { projectIndexedUsageStatistics } from "../sessions/indexed-usage.js";

const snapshot = { sessionId: "s", throughJournalSeq: 100, workspaceRoot: "/workspace", metadata: { title: "Vision", pinned: false, archived: false } };
const usage = { inputTokens: 90, outputTokens: 10, cacheReadTokens: 20, cacheWriteTokens: 0, reasoningTokens: null, cost: null, costCurrency: null, source: "provider-reported" };
function event(seq: number, type: string, data: Record<string, unknown>): SessionEventEnvelopeV1 {
  return { recordKind: "event", seq, type, eventVersion: 1, criticality: "required", time: "2026-10-23T00:00:00Z", source: { ownerPluginId: "@actspace/core" }, data, surface: null, provenance: { sourceEventSeqs: [], contributorIds: [], runtimeSelectionSeq: null } } as SessionEventEnvelopeV1;
}
function auxiliary(seq: number, attemptId: string, attempt = 1) {
  return event(seq, "llm/auxiliary-start", { sessionId: "s", agentRunId: "run", turnId: "t", stepId: "step", callId: "image", logicalRequestId: "vision", attemptId, attempt, purpose: "image-inspection", routeId: "vision-route", model: "vision-model", startedAt: "2026-10-23T00:00:00Z" });
}
function end(start: SessionEventEnvelopeV1, seq: number, status = "completed", reported: Record<string, unknown> = usage) {
  return event(seq, "llm/auxiliary-end", { ...start.data as object, status, finishedAt: "2026-10-23T00:00:02Z", usage: reported });
}

describe("auxiliary request activity and raw trajectory", () => {
  it("counts Session-owned title and compaction usage without inventing another conversation", () => {
    const starts = ["session-title", "compaction"].map((purpose, index) => event(index * 2, "llm/auxiliary-start", { sessionId: "s", purpose, logicalRequestId: purpose, attemptId: purpose, attempt: 1, routeId: "utility", model: "utility-model", startedAt: "2026-10-23T00:00:00Z" }));
    const rows = projectSessionUsageActivities(snapshot, starts.flatMap((start, index) => [start, end(start, index * 2 + 1)]));
    expect(rows.map(row => row.purpose)).toEqual(["session-title", "compaction"]);
    expect(rows.every(row => row.turnId === undefined && row.stepId === undefined && row.callId === undefined)).toBe(true);
    const stats = projectIndexedUsageStatistics([{ sessionId: "s", title: "Utility", throughJournalSeq: 3, rows }], { range: "all" });
    expect(stats?.summary).toMatchObject({ totalTokens: 240, conversationCount: 0 });
    expect(stats?.dailyRows[0]).toMatchObject({ totalTokens: 240, conversationCount: 0 });
  });

  it("keeps vision attempts separate from their main step and traces them to the owning tool", () => {
    const start = auxiliary(3, "vision-1");
    const journal = [event(0, "turn/start", { turnId: "t", agentRunId: "run" }), event(1, "request/header", { requestId: "main", turnId: "t", stepId: "step", routeId: "main-route", model: "main-model" }), event(2, "tool/call", { callId: "image", turnId: "t", stepId: "step", name: "inspect_image" }), start, end(start, 4), event(5, "step/end", { stepId: "step", reason: "completed", usage: { inputTokens: 100, outputTokens: 20 } })];
    const rows = projectSessionUsageActivities(snapshot, journal);
    expect(rows.filter(row => row.kind === "llm_request")).toHaveLength(2);
    expect(rows.find(row => row.requestId === "main")).toMatchObject({ model: "main-model", tokens: { totalTokens: 120 } });
    expect(rows.find(row => row.requestId === "vision-1")).toMatchObject({ activityId: "s:auxiliary:vision-1", agentRunId: "run", turnId: "t", stepId: "step", callId: "image", logicalRequestId: "vision", purpose: "image-inspection", routeId: "vision-route", providerId: "vision-route", model: "vision-model", attempt: 1, status: "success", durationMs: 2000, tokens: { totalTokens: 120, reasoningTokens: null }, costUsd: null, sourceEventSeq: 3, relatedEventSeqs: [3, 4] });
    const trajectory = projectTrajectoryWindow("s", { events: journal, fromSeq: 0, throughJournalSeq: 5, beforeSeq: null, turnOffset: 0, requestOffset: 0 });
    expect(trajectory.nodes.find(node => node.eventSeq === 4)).toMatchObject({ kind: "request", state: "completed", callId: "image", data: { attemptId: "vision-1", usage } });
  });

  it("preserves reported values for retries/cancellation and keeps incomplete attempts unknown", () => {
    const first = auxiliary(0, "a1"), second = auxiliary(2, "a2", 2), crashed = auxiliary(4, "a3", 3);
    const journal = [first, end(first, 1, "failed", { ...usage, inputTokens: 12, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null }), second, end(second, 3, "aborted", { ...usage, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cost: 0, costCurrency: "USD", costProvenance: { version: 1, basis: "provider-reported", pricingSnapshot: null, reason: null } }), crashed];
    const rows = projectSessionUsageActivities(snapshot, journal);
    expect(rows).toHaveLength(3);
    expect(rows.find(row => row.requestId === "a1")).toMatchObject({ status: "error", tokens: { inputTokens: 12, outputTokens: null, totalTokens: 12 }, costUsd: null });
    expect(rows.find(row => row.requestId === "a2")).toMatchObject({ status: "aborted", attempt: 2, retryOfRequestId: "a1", tokens: { totalTokens: 0 }, costUsd: 0 });
    expect(rows.find(row => row.requestId === "a3")).toMatchObject({ status: "running", attempt: 3, retryOfRequestId: "a2", tokens: { inputTokens: null, outputTokens: null, totalTokens: null }, costUsd: null });
    expect(projectSessionUsageActivities(snapshot, [...journal])).toEqual(rows);
  });
});
