import { describe, expect, it } from "vitest";
import type { LlmUsagePayload, SessionEvent, SessionRecord, ToolCallPayload, ToolExecutionResult } from "@actspace/shared";
import {
  createGlobalUsageStatisticsSnapshot,
  createUsageStatisticsSnapshot,
} from "../usage-statistics";

/**
 * Usage 统计聚合器单测。
 *
 * 覆盖维度（按重要性排序）：
 * 1. 单 session 聚合（兼容性回归）；
 * 2. 跨 session 全局聚合（用户最初痛点：以前的 Usage 页面只看一个 session）；
 * 3. Kairos 事件并入全局账本（"跨重启账单全貌"）；
 * 4. 时间窗（day/week/month/total）切片正确性；
 * 5. 模型 / 工具分布的占比计算与 cost 折算（CNY → USD）；
 * 6. 空输入的稳健性。
 */

const NOW = new Date("2026-05-28T12:00:00.000Z");

function ev<T>(
  type: SessionEvent["type"],
  payload: T,
  opts: { id: string; timestamp: string; sessionId?: string; turnId?: string },
): SessionEvent {
  return {
    id: opts.id,
    sessionId: opts.sessionId ?? "session-test",
    turnId: opts.turnId ?? "turn-1",
    type,
    timestamp: opts.timestamp,
    payload,
  } as SessionEvent;
}

function llmUsage(opts: {
  id: string;
  timestamp: string;
  sessionId?: string;
  model?: string;
  provider?: string;
  prompt?: number;
  completion?: number;
  total?: number;
  cacheHit?: number;
  cacheMiss?: number;
  reasoning?: number;
  cost?: { total: number; currency: "USD" | "CNY" };
}): SessionEvent {
  const payload: LlmUsagePayload = {
    callId: `call-${opts.id}`,
    provider: opts.provider ?? "openai",
    model: opts.model ?? "gpt-5.5",
    promptTokens: opts.prompt ?? 1_000,
    completionTokens: opts.completion ?? 200,
    totalTokens: opts.total ?? 1_200,
    reasoningTokens: opts.reasoning ?? 0,
    cacheHitTokens: opts.cacheHit ?? 0,
    cacheMissTokens: opts.cacheMiss ?? 0,
    cost: opts.cost ?? { total: 0.02, currency: "USD" },
  };
  return ev("llm_usage", payload, { id: opts.id, timestamp: opts.timestamp, sessionId: opts.sessionId });
}

function toolCall(opts: {
  id: string;
  timestamp: string;
  name: string;
  sessionId?: string;
}): SessionEvent {
  const payload: ToolCallPayload = {
    id: opts.id,
    name: opts.name,
    arguments: {},
  };
  return ev("tool_call", payload, { id: opts.id, timestamp: opts.timestamp, sessionId: opts.sessionId });
}

function toolResult(opts: {
  id: string;
  timestamp: string;
  toolCallId: string;
  toolName: string;
  ok: boolean;
  durationMs?: number;
  sessionId?: string;
}): SessionEvent {
  const payload: ToolExecutionResult = {
    toolCallId: opts.toolCallId,
    toolName: opts.toolName,
    ok: opts.ok,
    summary: opts.ok ? "ok" : "failed",
    durationMs: opts.durationMs,
  };
  return ev("tool_result", payload, { id: opts.id, timestamp: opts.timestamp, sessionId: opts.sessionId });
}

function userMessage(opts: { id: string; timestamp: string; sessionId?: string }): SessionEvent {
  return ev(
    "user_message",
    { content: "hi" },
    { id: opts.id, timestamp: opts.timestamp, sessionId: opts.sessionId },
  );
}

function fakeRecord(id: string, title: string, events: SessionEvent[]): SessionRecord {
  return {
    meta: {
      id,
      title,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
      turnCount: 1,
      workspaceRoot: "/tmp/ws",
    },
    events,
    contextState: null,
  } as SessionRecord;
}

describe("createUsageStatisticsSnapshot (single session)", () => {
  it("aggregates token + tool + cost from one session", () => {
    const record = fakeRecord("session-a", "Plan A", [
      userMessage({ id: "u1", timestamp: "2026-05-28T08:00:00.000Z" }),
      llmUsage({
        id: "l1",
        timestamp: "2026-05-28T08:01:00.000Z",
        prompt: 100,
        completion: 50,
        total: 150,
        cacheHit: 80,
        cacheMiss: 20,
        cost: { total: 0.01, currency: "USD" },
      }),
      toolCall({ id: "t1", timestamp: "2026-05-28T08:02:00.000Z", name: "Read" }),
      toolResult({
        id: "r1",
        timestamp: "2026-05-28T08:02:10.000Z",
        toolCallId: "t1",
        toolName: "Read",
        ok: true,
        durationMs: 50,
      }),
    ]);

    const snapshot = createUsageStatisticsSnapshot(record, "total", NOW);

    expect(snapshot.scope).toBe("session");
    expect(snapshot.sessionId).toBe("session-a");
    expect(snapshot.title).toBe("Plan A");
    expect(snapshot.sourceCount).toBe(1);
    expect(snapshot.summary.totalTokens).toBe(150);
    expect(snapshot.summary.promptTokens).toBe(100);
    expect(snapshot.summary.completionTokens).toBe(50);
    expect(snapshot.summary.cacheHitTokens).toBe(80);
    expect(snapshot.summary.cacheEfficiencyPercent).toBe(80);
    expect(snapshot.summary.toolCallCount).toBe(1);
    expect(snapshot.summary.conversationCount).toBe(1);
    expect(snapshot.summary.costUsd).toBeCloseTo(0.01, 5);
    expect(snapshot.toolDistribution[0]).toMatchObject({ name: "Read", callCount: 1, failedCount: 0 });
  });
});

describe("createGlobalUsageStatisticsSnapshot", () => {
  it("merges multiple sessions into a single global snapshot", () => {
    const sessionA = fakeRecord("session-a", "A", [
      llmUsage({ id: "a1", timestamp: "2026-05-28T08:00:00.000Z", total: 100, prompt: 80, completion: 20 }),
      toolCall({ id: "ta1", timestamp: "2026-05-28T08:01:00.000Z", name: "Read" }),
    ]);
    const sessionB = fakeRecord("session-b", "B", [
      llmUsage({ id: "b1", timestamp: "2026-05-28T09:00:00.000Z", total: 300, prompt: 200, completion: 100 }),
      toolCall({ id: "tb1", timestamp: "2026-05-28T09:01:00.000Z", name: "Bash" }),
      toolCall({ id: "tb2", timestamp: "2026-05-28T09:02:00.000Z", name: "Bash" }),
    ]);

    const snapshot = createGlobalUsageStatisticsSnapshot({
      sessionRecords: [sessionA, sessionB],
      range: "total",
      now: NOW,
    });

    expect(snapshot.scope).toBe("global");
    expect(snapshot.sessionId).toBeNull();
    expect(snapshot.title).toBe("全部数据");
    expect(snapshot.sourceCount).toBe(2);
    expect(snapshot.summary.totalTokens).toBe(400);
    expect(snapshot.summary.toolCallCount).toBe(3);
    expect(snapshot.toolDistribution.map((t) => t.name)).toEqual(["Bash", "Read"]);
    expect(snapshot.toolDistribution[0].callCount).toBe(2);
  });

  it("merges Kairos events into the global account", () => {
    const session = fakeRecord("session-a", "A", [
      llmUsage({ id: "a1", timestamp: "2026-05-28T08:00:00.000Z", total: 100 }),
    ]);
    const kairosEvents: SessionEvent[] = [
      llmUsage({
        id: "k1",
        timestamp: "2026-05-27T08:00:00.000Z",
        sessionId: "kairos",
        model: "claude-4.6-sonnet",
        total: 500,
        prompt: 400,
        completion: 100,
        cost: { total: 0.05, currency: "USD" },
      }),
    ];

    const snapshot = createGlobalUsageStatisticsSnapshot({
      sessionRecords: [session],
      kairosEvents,
      range: "total",
      now: NOW,
    });

    expect(snapshot.sourceCount).toBe(2); // 1 session + Kairos 一组
    expect(snapshot.summary.totalTokens).toBe(600);
    expect(snapshot.modelDistribution.find((m) => m.name === "claude-4.6-sonnet")?.totalTokens).toBe(500);
  });

  it("filters by day/week/month/total time window", () => {
    const events = [
      llmUsage({ id: "old", timestamp: "2026-01-01T00:00:00.000Z", total: 9_000 }), // 远超月窗
      llmUsage({ id: "mid", timestamp: "2026-05-10T00:00:00.000Z", total: 700 }), // 周窗外、月窗内
      llmUsage({ id: "today", timestamp: "2026-05-28T01:00:00.000Z", total: 50 }), // 当日
    ];
    const record = fakeRecord("session-a", "A", events);

    const day = createGlobalUsageStatisticsSnapshot({ sessionRecords: [record], range: "day", now: NOW });
    expect(day.summary.totalTokens).toBe(50);

    const week = createGlobalUsageStatisticsSnapshot({ sessionRecords: [record], range: "week", now: NOW });
    expect(week.summary.totalTokens).toBe(50);

    const month = createGlobalUsageStatisticsSnapshot({ sessionRecords: [record], range: "month", now: NOW });
    expect(month.summary.totalTokens).toBe(750);

    const total = createGlobalUsageStatisticsSnapshot({ sessionRecords: [record], range: "total", now: NOW });
    expect(total.summary.totalTokens).toBe(9_750);
  });

  it("converts CNY cost into USD via 7.2 rate", () => {
    const record = fakeRecord("session-a", "A", [
      llmUsage({
        id: "c1",
        timestamp: "2026-05-28T08:00:00.000Z",
        cost: { total: 7.2, currency: "CNY" },
      }),
    ]);
    const snapshot = createGlobalUsageStatisticsSnapshot({
      sessionRecords: [record],
      range: "total",
      now: NOW,
    });
    expect(snapshot.summary.costUsd).toBeCloseTo(1, 2);
  });

  it("builds per-day modelBreakdown sorted by tokens desc + name asc", () => {
    const record = fakeRecord("session-a", "A", [
      llmUsage({
        id: "x1",
        timestamp: "2026-05-28T08:00:00.000Z",
        model: "claude-4.6-sonnet",
        total: 500,
        prompt: 400,
        completion: 100,
      }),
      llmUsage({
        id: "x2",
        timestamp: "2026-05-28T09:00:00.000Z",
        model: "gpt-5.5",
        total: 300,
        prompt: 200,
        completion: 100,
      }),
      llmUsage({
        id: "x3",
        timestamp: "2026-05-28T10:00:00.000Z",
        model: "gpt-5.5",
        total: 200,
        prompt: 150,
        completion: 50,
      }),
    ]);

    const snapshot = createGlobalUsageStatisticsSnapshot({
      sessionRecords: [record],
      range: "total",
      now: NOW,
    });

    const today = snapshot.dailyRows.find((row) => row.date === "2026-05-28");
    expect(today).toBeDefined();
    expect(today!.totalTokens).toBe(1000);
    // 排序规则：totalTokens 降序；并列时按 name 升序，所以 claude(500) 排在 gpt(500) 前面。
    expect(today!.modelBreakdown).toEqual([
      { name: "claude-4.6-sonnet", totalTokens: 500, percent: 50 },
      { name: "gpt-5.5", totalTokens: 500, percent: 50 },
    ]);
  });

  it("excludes pure user-message days from modelBreakdown (empty array, not undefined)", () => {
    const record = fakeRecord("session-a", "A", [
      userMessage({ id: "u1", timestamp: "2026-05-28T08:00:00.000Z" }),
    ]);
    const snapshot = createGlobalUsageStatisticsSnapshot({
      sessionRecords: [record],
      range: "total",
      now: NOW,
    });
    expect(snapshot.dailyRows[0].modelBreakdown).toEqual([]);
  });

  it("handles empty input gracefully", () => {
    const snapshot = createGlobalUsageStatisticsSnapshot({
      sessionRecords: [],
      kairosEvents: [],
      range: "total",
      now: NOW,
    });
    expect(snapshot.scope).toBe("global");
    expect(snapshot.summary.totalTokens).toBe(0);
    expect(snapshot.summary.toolCallCount).toBe(0);
    expect(snapshot.summary.cacheEfficiencyPercent).toBe(0);
    expect(snapshot.modelDistribution).toEqual([]);
    expect(snapshot.toolDistribution).toEqual([]);
    expect(snapshot.dailyRows).toEqual([]);
    expect(snapshot.sourceCount).toBe(0);
  });
});
