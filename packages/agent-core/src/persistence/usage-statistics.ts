import type {
  LlmUsagePayload,
  SessionEvent,
  ToolCallPayload,
  ToolExecutionResult,
  UsageStatisticsDailyRow,
  UsageStatisticsModelEntry,
  UsageStatisticsRange,
  UsageStatisticsSnapshot,
  UsageStatisticsToolEntry,
} from "@actspace/shared";
import type { SessionRecord } from "@actspace/shared";

type ModelAccumulator = {
  name: string;
  provider?: string;
  totalTokens: number;
  callCount: number;
  costUsd: number;
};

type ToolAccumulator = {
  name: string;
  callCount: number;
  failedCount: number;
  totalDurationMs: number;
  durationCount: number;
};

type DailyAccumulator = UsageStatisticsDailyRow;

function emptyDailyRow(date: string): DailyAccumulator {
  return {
    date,
    totalTokens: 0,
    promptTokens: 0,
    completionTokens: 0,
    cacheHitTokens: 0,
    reasoningTokens: 0,
    conversationCount: 0,
    toolCallCount: 0,
    costUsd: 0,
  };
}

function getEventDate(event: SessionEvent): string {
  return event.timestamp.slice(0, 10);
}

function getPeriodStart(range: UsageStatisticsRange, now: Date): Date | undefined {
  if (range === "total") return undefined;

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (range === "day") return start;

  if (range === "week") {
    start.setDate(start.getDate() - 6);
    return start;
  }

  start.setDate(start.getDate() - 29);
  return start;
}

function isWithinRange(event: SessionEvent, start: Date | undefined, end: Date): boolean {
  if (!start) return true;
  const timestamp = new Date(event.timestamp);
  if (Number.isNaN(timestamp.getTime())) return true;
  return timestamp >= start && timestamp <= end;
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function toUsd(cost: LlmUsagePayload["cost"]): number {
  if (!cost) return 0;
  if (cost.currency === "USD") return cost.total;
  return cost.total / 7.2;
}

function isLlmUsagePayload(payload: unknown): payload is LlmUsagePayload {
  if (!payload || typeof payload !== "object") return false;
  const usage = payload as Partial<LlmUsagePayload>;
  return (
    typeof usage.model === "string" &&
    typeof usage.promptTokens === "number" &&
    typeof usage.completionTokens === "number" &&
    typeof usage.totalTokens === "number"
  );
}

function isToolCallPayload(payload: unknown): payload is ToolCallPayload {
  return Boolean(payload && typeof payload === "object" && typeof (payload as ToolCallPayload).name === "string");
}

function isToolResultPayload(payload: unknown): payload is ToolExecutionResult {
  return Boolean(payload && typeof payload === "object" && typeof (payload as ToolExecutionResult).toolName === "string");
}

function getOrCreateDailyRow(rows: Map<string, DailyAccumulator>, date: string): DailyAccumulator {
  const existing = rows.get(date);
  if (existing) return existing;
  const row = emptyDailyRow(date);
  rows.set(date, row);
  return row;
}

function buildModelEntries(models: Map<string, ModelAccumulator>, totalTokens: number): UsageStatisticsModelEntry[] {
  return [...models.values()]
    .sort((a, b) => b.totalTokens - a.totalTokens)
    .map((model) => ({
      name: model.name,
      provider: model.provider,
      totalTokens: model.totalTokens,
      callCount: model.callCount,
      costUsd: round(model.costUsd, 4),
      percent: totalTokens > 0 ? round((model.totalTokens / totalTokens) * 100) : 0,
    }));
}

function buildToolEntries(tools: Map<string, ToolAccumulator>, totalToolCalls: number): UsageStatisticsToolEntry[] {
  return [...tools.values()]
    .sort((a, b) => b.callCount - a.callCount)
    .map((tool) => ({
      name: tool.name,
      callCount: tool.callCount,
      failedCount: tool.failedCount,
      percent: totalToolCalls > 0 ? round((tool.callCount / totalToolCalls) * 100) : 0,
      averageDurationMs: tool.durationCount > 0 ? Math.round(tool.totalDurationMs / tool.durationCount) : undefined,
    }));
}

export function createUsageStatisticsSnapshot(
  record: SessionRecord,
  range: UsageStatisticsRange = "month",
  now = new Date(),
): UsageStatisticsSnapshot {
  const periodStart = getPeriodStart(range, now);
  const periodEnd = now;
  const events = record.events.filter((event) => isWithinRange(event, periodStart, periodEnd));
  const models = new Map<string, ModelAccumulator>();
  const tools = new Map<string, ToolAccumulator>();
  const dailyRows = new Map<string, DailyAccumulator>();
  const toolCallNames = new Map<string, string>();

  const summary = {
    totalTokens: 0,
    promptTokens: 0,
    completionTokens: 0,
    cacheHitTokens: 0,
    cacheMissTokens: 0,
    reasoningTokens: 0,
    toolCallCount: 0,
    conversationCount: 0,
    costUsd: 0,
    cacheEfficiencyPercent: 0,
  };

  for (const event of events) {
    const date = getEventDate(event);
    const daily = getOrCreateDailyRow(dailyRows, date);

    if (event.type === "user_message") {
      summary.conversationCount += 1;
      daily.conversationCount += 1;
      continue;
    }

    if (event.type === "llm_usage" && isLlmUsagePayload(event.payload)) {
      const usage = event.payload;
      const costUsd = toUsd(usage.cost);
      summary.totalTokens += usage.totalTokens;
      summary.promptTokens += usage.promptTokens;
      summary.completionTokens += usage.completionTokens;
      summary.cacheHitTokens += usage.cacheHitTokens ?? 0;
      summary.cacheMissTokens += usage.cacheMissTokens ?? 0;
      summary.reasoningTokens += usage.reasoningTokens ?? 0;
      summary.costUsd += costUsd;

      daily.totalTokens += usage.totalTokens;
      daily.promptTokens += usage.promptTokens;
      daily.completionTokens += usage.completionTokens;
      daily.cacheHitTokens += usage.cacheHitTokens ?? 0;
      daily.reasoningTokens += usage.reasoningTokens ?? 0;
      daily.costUsd += costUsd;

      const modelKey = usage.modelId ?? usage.model;
      const model = models.get(modelKey) ?? {
        name: usage.model,
        provider: usage.provider,
        totalTokens: 0,
        callCount: 0,
        costUsd: 0,
      };
      model.totalTokens += usage.totalTokens;
      model.callCount += 1;
      model.costUsd += costUsd;
      models.set(modelKey, model);
      continue;
    }

    if (event.type === "tool_call" && isToolCallPayload(event.payload)) {
      const payload = event.payload;
      summary.toolCallCount += 1;
      daily.toolCallCount += 1;
      toolCallNames.set(payload.id, payload.name);

      const tool = tools.get(payload.name) ?? {
        name: payload.name,
        callCount: 0,
        failedCount: 0,
        totalDurationMs: 0,
        durationCount: 0,
      };
      tool.callCount += 1;
      tools.set(payload.name, tool);
      continue;
    }

    if (event.type === "tool_result" && isToolResultPayload(event.payload)) {
      const payload = event.payload;
      const name = payload.toolCallId ? (toolCallNames.get(payload.toolCallId) ?? payload.toolName) : payload.toolName;
      const tool = tools.get(name);
      if (!tool) continue;
      if (!payload.ok) {
        tool.failedCount += 1;
      }
      if (typeof payload.durationMs === "number") {
        tool.totalDurationMs += payload.durationMs;
        tool.durationCount += 1;
      }
    }
  }

  const cacheDenominator = summary.cacheHitTokens + summary.cacheMissTokens;
  summary.cacheEfficiencyPercent = cacheDenominator > 0 ? round((summary.cacheHitTokens / cacheDenominator) * 100) : 0;
  summary.costUsd = round(summary.costUsd, 4);

  return {
    sessionId: record.meta.id,
    title: record.meta.title,
    range,
    generatedAt: now.toISOString(),
    periodStart: periodStart?.toISOString(),
    periodEnd: periodEnd.toISOString(),
    summary,
    modelDistribution: buildModelEntries(models, summary.totalTokens),
    toolDistribution: buildToolEntries(tools, summary.toolCallCount),
    dailyRows: [...dailyRows.values()].sort((a, b) => b.date.localeCompare(a.date)).map((row) => ({
      ...row,
      costUsd: round(row.costUsd, 4),
    })),
  };
}
