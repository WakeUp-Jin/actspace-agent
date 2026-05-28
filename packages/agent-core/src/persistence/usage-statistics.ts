import type {
  LlmUsagePayload,
  SessionEvent,
  ToolCallPayload,
  ToolExecutionResult,
  UsageStatisticsDailyModelBreakdown,
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

/**
 * 内部累加器结构：与 `UsageStatisticsDailyRow` 的差异在于 `modelTokens` 是 Map（按 model name 累加），
 * 最后阶段才会被 reduce 成有序的 `UsageStatisticsDailyModelBreakdown[]` 写到 snapshot 里。
 */
type DailyAccumulator = Omit<UsageStatisticsDailyRow, "modelBreakdown"> & {
  modelTokens: Map<string, number>;
};

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
    modelTokens: new Map<string, number>(),
  };
}

/**
 * 把当日按 model 累加的 token Map 折叠成稳定排序的 `modelBreakdown` 列表。
 *
 * - 排序：`totalTokens` 降序；并列时按 model name 升序，保证渲染顺序确定（测试稳定）；
 * - `percent`：在该日 totalTokens 内的占比，保留 1 位小数；
 * - `dailyTotal === 0` 的"空日"返回 `[]`，让 UI 直接走"无明细"分支。
 */
function buildDailyModelBreakdown(
  modelTokens: Map<string, number>,
  dailyTotal: number,
): UsageStatisticsDailyModelBreakdown[] {
  if (dailyTotal <= 0 || modelTokens.size === 0) return [];
  const entries = [...modelTokens.entries()]
    .map(([name, totalTokens]) => ({
      name,
      totalTokens,
      percent: round((totalTokens / dailyTotal) * 100),
    }))
    .sort((a, b) => {
      if (b.totalTokens !== a.totalTokens) return b.totalTokens - a.totalTokens;
      return a.name.localeCompare(b.name);
    });
  return entries;
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

/**
 * 内部聚合核心：把任意来源的 SessionEvent 序列汇总成 snapshot 的"summary / 模型分布 / 工具分布 / 日明细"。
 *
 * 调用方负责把 meta 字段（sessionId/title/scope 等）补齐。这一层只关心"事件 -> 指标"。
 *
 * Kairos 的事件序列也可以通过这里聚合——它们的 `type` 与 `payload` 形态与对话 session 同构
 * （都是 `@actspace/shared` 的 `SessionEvent`），唯一差别是产生源不同。
 */
function aggregateEvents(
  events: SessionEvent[],
  range: UsageStatisticsRange,
  now: Date,
): Pick<UsageStatisticsSnapshot, "summary" | "modelDistribution" | "toolDistribution" | "dailyRows" | "periodStart" | "periodEnd"> {
  const periodStart = getPeriodStart(range, now);
  const periodEnd = now;
  const filtered = events.filter((event) => isWithinRange(event, periodStart, periodEnd));
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

  for (const event of filtered) {
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
      // 按"展示名"而不是 modelId 累加，让 UI tooltip 上看到的是 `gpt-5.5` 而不是 internal id；
      // 不同 modelId 但同 model 名的情况会被合并，这与主区 modelDistribution 行为一致。
      daily.modelTokens.set(
        usage.model,
        (daily.modelTokens.get(usage.model) ?? 0) + usage.totalTokens,
      );

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
    summary,
    modelDistribution: buildModelEntries(models, summary.totalTokens),
    toolDistribution: buildToolEntries(tools, summary.toolCallCount),
    dailyRows: [...dailyRows.values()]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((row): UsageStatisticsDailyRow => {
        const { modelTokens, ...rest } = row;
        return {
          ...rest,
          costUsd: round(rest.costUsd, 4),
          modelBreakdown: buildDailyModelBreakdown(modelTokens, rest.totalTokens),
        };
      }),
    periodStart: periodStart?.toISOString(),
    periodEnd: periodEnd.toISOString(),
  };
}

/**
 * 单 session 聚合（向后兼容入口）。等价于 `createGlobalUsageStatisticsSnapshot({ records:[record], ... })`，
 * 但保留 sessionId/title 字段以便老调用方继续读到原 session 维度的元数据。
 */
export function createUsageStatisticsSnapshot(
  record: SessionRecord,
  range: UsageStatisticsRange = "month",
  now = new Date(),
): UsageStatisticsSnapshot {
  const aggregated = aggregateEvents(record.events, range, now);
  return {
    scope: "session",
    sessionId: record.meta.id,
    title: record.meta.title,
    range,
    generatedAt: now.toISOString(),
    sourceCount: 1,
    ...aggregated,
  };
}

/**
 * 全局聚合：跨所有普通对话 session 和（可选的）Kairos 自主模式事件，合并成一份"账单全貌"。
 *
 * - 输入侧合并采用"事件级合流"而非"snapshot 合流"，避免百分比和缓存效率等派生指标重复舍入；
 * - `now` 注入便于测试固定时间窗；
 * - `title` 默认 "全部数据"，可由调用方覆写（例如想区分"全部对话 + Kairos" vs "仅 Kairos"）。
 */
export function createGlobalUsageStatisticsSnapshot(opts: {
  sessionRecords: SessionRecord[];
  /** Kairos 短期记忆中的全部事件，已经摊平成 SessionEvent[]。空数组等同于"仅普通对话"。 */
  kairosEvents?: SessionEvent[];
  range?: UsageStatisticsRange;
  now?: Date;
  title?: string;
}): UsageStatisticsSnapshot {
  const range = opts.range ?? "total";
  const now = opts.now ?? new Date();
  const sessionEvents = opts.sessionRecords.flatMap((record) => record.events);
  const kairosEvents = opts.kairosEvents ?? [];
  const merged = [...sessionEvents, ...kairosEvents];
  const aggregated = aggregateEvents(merged, range, now);
  const sourceCount = opts.sessionRecords.length + (kairosEvents.length > 0 ? 1 : 0);
  return {
    scope: "global",
    sessionId: null,
    title: opts.title ?? "全部数据",
    range,
    generatedAt: now.toISOString(),
    sourceCount,
    ...aggregated,
  };
}
