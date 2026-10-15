import { describe, expect, it } from "vitest";
import type { ContextPanelView, ContextState } from "@actspace/shared";
import {
  buildCategories,
  buildInterimPanelView,
  cacheHitRate,
  conversationRows,
  cumulativeTokens,
  trendLayout,
} from "../components/right-panel/context/context-panel-model";

function view(patch: Partial<ContextPanelView> = {}): ContextPanelView {
  return {
    schemaVersion: 2,
    sessionId: "s1",
    logicalAgentScopeId: "main",
    contextRevision: 2,
    throughJournalSeq: 10,
    model: { modelKey: "m", label: "Model", contextWindow: 1_000, autoCompactAtTokens: 800 },
    current: {
      totalEstimatedTokens: 330,
      buckets: { tools: 130, conversation: 200 },
      entries: [
        { key: "tool:bash", bucket: "tools", title: "bash", estimatedTokens: 100 },
        { key: "tool:new", bucket: "tools", title: "new", estimatedTokens: 30 },
        { key: "m1", bucket: "conversation", title: "hi", estimatedTokens: 50, kind: "user" },
        { key: "m2", bucket: "conversation", title: "thinking", estimatedTokens: 50, kind: "thinking" },
        { key: "c1:call", bucket: "conversation", title: "bash", estimatedTokens: 100, kind: "tool-call" },
      ],
      status: "ready",
    },
    previous: {
      requestId: "r1", turnIndex: 1, stepIndex: 2, sentAt: "2026-10-11T00:00:00.000Z", totalEstimatedTokens: 300,
      buckets: { tools: 140, conversation: 160 },
      entries: [
        { key: "tool:bash", bucket: "tools", estimatedTokens: 80 },
        { key: "tool:gone", bucket: "tools", estimatedTokens: 60 },
        { key: "m1", bucket: "conversation", estimatedTokens: 50 },
        { key: "m2", bucket: "conversation", estimatedTokens: 50 },
        { key: "c1:call", bucket: "conversation", estimatedTokens: 60 },
      ],
    },
    stats: { turnCount: 1, stepCount: 2, compactionCount: 0, cumulativeUsage: null, costUsd: null },
    trend: [],
    events: [],
    ...patch,
  };
}

describe("buildCategories", () => {
  it("lists every registry bucket in order, including empty ones", () => {
    expect(buildCategories(view(), { compare: true }).map((category) => category.key))
      .toEqual(["systemPrompt", "tools", "rules", "skills", "summarizedConversation", "conversation"]);
  });

  it("marks new entries, same-key token deltas and removed entries against the previous request", () => {
    const tools = buildCategories(view(), { compare: true }).find((category) => category.key === "tools")!;
    expect(tools.entries.map((entry) => [entry.key, entry.isNew, entry.tokenDelta])).toEqual([["tool:bash", false, 20], ["tool:new", true, 0]]);
    expect(tools.removed.map((entry) => entry.key)).toEqual(["tool:gone"]);
    expect(tools.itemDelta).toBe(0);
    expect(tools.tokenDelta).toBe(-10);
  });

  it("drops all deltas when comparison is off or there is no previous request", () => {
    for (const categories of [buildCategories(view(), { compare: false }), buildCategories(view({ previous: null }), { compare: true })]) {
      const tools = categories.find((category) => category.key === "tools")!;
      expect(tools.removed).toEqual([]);
      expect(tools.itemDelta).toBe(0);
      expect(tools.tokenDelta).toBe(0);
      expect(tools.entries.every((entry) => !entry.isNew && entry.tokenDelta === 0)).toBe(true);
    }
  });
});

describe("conversationRows", () => {
  const entries = view().current.entries.filter((entry) => entry.bucket === "conversation");

  it("puts the newest entry first", () => {
    expect(conversationRows(entries, []).map((entry) => entry.key)).toEqual(["c1:call", "m2", "m1"]);
  });

  it("filters by kind and counts thinking as assistant", () => {
    expect(conversationRows(entries, ["assistant"]).map((entry) => entry.key)).toEqual(["m2"]);
    expect(conversationRows(entries, ["user", "tool-call"]).map((entry) => entry.key)).toEqual(["c1:call", "m1"]);
  });
});

describe("buildInterimPanelView", () => {
  const contextState: ContextState = {
    sessionId: "s1",
    throughJournalSeq: 7,
    updatedAt: "2026-10-11T00:00:00.000Z",
    estimator: { name: "test", version: "1" },
    totalEstimatedTokens: 120,
    maxTokens: 0,
    percentUsed: 0,
    buckets: [{ key: "rules", tokens: 20 }, { key: "conversation", tokens: 100 }],
    entries: [
      { id: "rule-1", kind: "rules", title: "AGENTS.md", estimatedTokens: 20, included: true, preview: "# rules" },
      { id: "managed-7-message-0", kind: "conversation", title: "hello", estimatedTokens: 100, included: true, preview: "hello world" },
    ],
  } as ContextState;

  it("maps current entries without comparison, trend, events or conversation previews", () => {
    const { view: interim, source } = buildInterimPanelView({ sessionId: "s1", contextState, activity: null, usage: null });
    expect(source).toBe("interim");
    expect(interim.previous).toBeNull();
    expect(interim.trend).toEqual([]);
    expect(interim.events).toEqual([]);
    expect(interim.current.entries.map((entry) => [entry.bucket, entry.preview])).toEqual([["rules", "# rules"], ["conversation", undefined]]);
    expect(interim.current.buckets).toEqual({ rules: 20, conversation: 100 });
  });

  it("treats a non-positive max as an unknown context window and reads stats from the projection", () => {
    const { view: interim } = buildInterimPanelView({
      sessionId: "s1",
      contextState,
      activity: { turnCount: 3, completedTurnCount: 3, stepCount: 9, activeTurnId: null, activeStepId: null, compactionCount: 1, activeCompactionId: null, lastCompactionSummary: null, timing: { llmMs: 0, ttftMs: 0, ttftSteps: 0, decodeMs: 0, decodeTokens: 0 } },
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 90, cacheWriteTokens: 0, totalTokens: 105, costUsd: null },
    });
    expect(interim.model).toBeNull();
    expect(interim.stats).toMatchObject({ turnCount: 3, stepCount: 9, compactionCount: 1, costUsd: null });
    expect(interim.stats.cumulativeUsage).toEqual({ inputTokens: 10, outputTokens: 5, cacheReadTokens: 90, cacheWriteTokens: 0 });
  });

  it("reports an unavailable context when describeContext returned nothing", () => {
    expect(buildInterimPanelView({ sessionId: "s1", contextState: null, activity: null, usage: null }).view.current.status).toBe("unavailable");
  });
});

describe("usage stats", () => {
  it("computes cache hit rate and cumulative tokens, or null without data", () => {
    const usage = { inputTokens: 10, outputTokens: 5, cacheReadTokens: 90, cacheWriteTokens: 3 };
    expect(cacheHitRate(usage)).toBeCloseTo(0.9);
    expect(cumulativeTokens(usage)).toBe(108);
    expect(cacheHitRate(null)).toBeNull();
    expect(cacheHitRate({ inputTokens: 0, outputTokens: 4, cacheReadTokens: 0, cacheWriteTokens: 0 })).toBeNull();
    expect(cumulativeTokens(null)).toBeNull();
  });
});

describe("trendLayout", () => {
  it("scales columns to the peak, splits by bucket and flags compaction", () => {
    const columns = trendLayout([
      { requestId: "r1", turnIndex: 1, stepIndex: 1, sentAt: "", estimatedTokens: 200, buckets: { tools: 50, conversation: 150 } },
      { requestId: "r2", turnIndex: 2, stepIndex: 2, sentAt: "", estimatedTokens: 50, buckets: { conversation: 50 }, compactedBefore: { compactionId: "c", reclaimedTokens: 150 } },
    ]);
    expect(columns.map((column) => column.height)).toEqual([1, 0.25]);
    expect(columns[0]!.segments.map((segment) => [segment.key, segment.share])).toEqual([["tools", 0.25], ["conversation", 0.75]]);
    expect(columns.map((column) => column.compactedBefore)).toEqual([false, true]);
  });
});
