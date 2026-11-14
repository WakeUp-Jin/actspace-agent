import type {
  UsageActivityAggregate,
  UsageActivityRow,
  UsageActivitySnapshot,
  UsageAuxiliaryPurpose,
  UsageSeries,
  UsageStatisticsRange,
} from "@actspace/shared";
import type { DonutSegment, HoverDetail } from "../stats/stats-ui";
import { DASH, average, fmtDuration, fmtInt, fmtTokens, fmtUsd, ratio } from "../stats/stats-format";
import { billedInputTokens, formatCacheHitPercent } from "../composer/composer-stats";

/* 使用统计页的取数整理（front-统计页规范.md §2）：只做纯计算，组件负责渲染。 */

export const RANGE_DAYS: Record<Exclude<UsageStatisticsRange, "total">, number> = { day: 1, week: 7, month: 30 };

export const PURPOSE_LABEL: Record<UsageAuxiliaryPurpose, string> = {
  "session-title": "会话标题",
  "auto-review": "自动审批",
  compaction: "压缩摘要",
  "image-inspection": "图片识别",
  evaluation: "评估",
};

/** 程序名后面能跟子命令统计的程序（与主进程 BASH_SUBCOMMAND_PROGRAMS 一致）。 */
export const SUBCOMMAND_PROGRAMS = new Set(["git", "pnpm", "npm", "yarn", "cargo", "go", "gh", "docker"]);

/** 系列色：6 类上下文色 + info，按顺序循环。 */
export const SERIES_COLORS = [
  "var(--act-context-tools)",
  "var(--act-color-info)",
  "var(--act-context-rules)",
  "var(--act-context-skills)",
  "var(--act-context-conversation)",
  "var(--act-context-summarized)",
  "var(--act-context-system)",
];

type CacheTokens = { inputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };

/** 缓存命中率：缓存读 ÷（未缓存输入 + 缓存读 + 缓存写）。排序用比例。 */
export function cacheHitRate(tokens: CacheTokens): number | null {
  return ratio(tokens.cacheReadTokens, billedInputTokens(tokens));
}

/** 显示用：与会话胶囊同一算法，差一点全命中不会舍成 100%。 */
export function fmtCacheHit(tokens: CacheTokens): string {
  const value = formatCacheHitPercent(tokens.cacheReadTokens, billedInputTokens(tokens), 1);
  return value == null ? DASH : `${value}%`;
}

/** 「全部」的天数：最早一条记录到现在，至少 1 天。 */
export function rangeDays(
  range: UsageStatisticsRange,
  firstAt: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (range !== "total") return RANGE_DAYS[range];
  if (!firstAt) return null;
  const first = Date.parse(firstAt);
  return Number.isNaN(first) ? null : Math.max(1, Math.ceil((now.getTime() - first) / 86_400_000));
}

export type Summary = UsageActivitySnapshot["summary"];

/** 缺口提示（规范 §2.2）：缺用量 / 缺价格的请求不计入数值。 */
export function gapNote(data: UsageActivitySnapshot | null): { text: string; reasons: string[] } | null {
  if (!data) return null;
  const failed = data.summary.unknownTokenRequestCounts.total;
  const unpriced = data.costSummary?.unknownCostRequestCount ?? 0;
  const partialCache = Math.max(0, data.summary.unknownTokenRequestCounts.cacheRead - failed);
  const reasons = [
    failed > 0 ? `请求失败或未完成：${fmtInt(failed)} 次` : "",
    unpriced > 0 ? `模型未配置价格：${fmtInt(unpriced)} 次` : "",
    partialCache > 0 ? `服务商未返回缓存字段：${fmtInt(partialCache)} 次` : "",
  ].filter(Boolean);
  if (reasons.length === 0) return null;
  const gap = failed + unpriced;
  return {
    text:
      gap > 0
        ? `有 ${fmtInt(gap)} 次请求缺少用量或定价，数值为已知部分的合计`
        : "部分请求的服务商未返回缓存字段，数值为已知部分的合计",
    reasons,
  };
}

// ---------------------------------------------------------------- 环形图

export function tokenTypeSegments(summary: Summary): DonutSegment[] {
  const reply = Math.max(0, summary.outputTokens - summary.reasoningTokens);
  return [
    { key: "cacheRead", label: "缓存读取", value: summary.cacheReadTokens, color: "var(--act-context-rules)" },
    { key: "cacheWrite", label: "缓存写入", value: summary.cacheWriteTokens, color: "var(--act-context-skills)" },
    { key: "input", label: "未缓存输入", value: summary.inputTokens, color: "var(--act-color-info)" },
    { key: "reasoning", label: "模型思考", value: summary.reasoningTokens, color: "var(--act-context-tools)" },
    { key: "reply", label: "模型回复", value: reply, color: "var(--act-context-conversation)" },
  ].map((segment) => ({ ...segment, valueLabel: fmtTokens(segment.value) }));
}

export function tokenModelSegments(models: readonly UsageActivityAggregate[]): DonutSegment[] {
  return modelsWithLabels(models)
    .filter((model) => model.totalTokens > 0)
    .map((model, index) => ({
      key: model.key,
      label: model.displayLabel,
      value: model.totalTokens,
      color: SERIES_COLORS[index % SERIES_COLORS.length],
      valueLabel: fmtTokens(model.totalTokens),
    }));
}

/** 同名模型挂在多个提供商下时，图例里带上提供商以免混淆。 */
export function modelsWithLabels(
  models: readonly UsageActivityAggregate[],
): (UsageActivityAggregate & { displayLabel: string })[] {
  const counts = new Map<string, number>();
  for (const model of models) counts.set(model.label, (counts.get(model.label) ?? 0) + 1);
  return models.map((model) => ({
    ...model,
    displayLabel: (counts.get(model.label) ?? 0) > 1 ? `${model.label} · ${model.providerId ?? "未知"}` : model.label,
  }));
}

const timeValue = (ms: number, count: number) => `${fmtDuration(ms)} · ${fmtInt(count)} 次`;

export function phaseSegments(data: UsageActivitySnapshot): DonutSegment[] {
  const timing = data.timing;
  if (!timing) return [];
  const harness = !data.harnessUnavailable;
  return [
    { key: "ttft", label: "首字等待", value: timing.ttftMs, count: timing.ttftSamples, color: "var(--act-color-info)" },
    {
      key: "decode",
      label: "模型输出",
      value: timing.decodeMs,
      count: timing.ttftSamples,
      color: "var(--act-context-tools)",
    },
    ...(harness
      ? [
          {
            key: "tool",
            label: "工具执行",
            value: timing.toolMs,
            count: timing.toolSamples,
            color: "var(--act-context-rules)",
          },
          {
            key: "approval",
            label: "等待审批",
            value: timing.approvalWaitMs,
            count: timing.approvalSamples,
            color: "var(--act-context-skills)",
          },
        ]
      : []),
    {
      key: "aux",
      label: "辅助模型",
      value: timing.auxiliaryMs,
      count: timing.auxiliaryCount,
      color: "var(--act-context-system)",
    },
  ].map(({ count, ...segment }) => ({ ...segment, valueLabel: timeValue(segment.value, count) }));
}

export function toolTimeSegments(data: UsageActivitySnapshot): DonutSegment[] {
  return [...(data.tools ?? [])]
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 7)
    .filter((tool) => tool.durationMs > 0)
    .map((tool, index) => ({
      key: tool.name,
      label: tool.name,
      value: tool.durationMs,
      color: SERIES_COLORS[index % SERIES_COLORS.length],
      valueLabel: timeValue(tool.durationMs, tool.durationSamples),
    }));
}

// ---------------------------------------------------------------- 用量趋势

export type TrendMetric = "tokens" | "cost" | "requests";
export const fmtTrend = (metric: TrendMetric, value: number) =>
  metric === "tokens" ? fmtTokens(value) : metric === "cost" ? fmtUsd(value) : `${fmtInt(value)} 次`;
const bucketValue = (metric: TrendMetric, bucket: UsageSeries["buckets"][number]) =>
  metric === "tokens" ? bucket.tokens : metric === "cost" ? bucket.costUsd : bucket.requests;

export function bucketLabel(unit: UsageSeries["unit"], start: string): string {
  if (unit === "hour") return `${Number(start.slice(11, 13))}:00`;
  const month = Number(start.slice(5, 7));
  const day = Number(start.slice(8, 10));
  return unit === "week" ? `${month}月${day}日那周` : `${month}月${day}日`;
}

export function trendModel(series: UsageSeries, metric: TrendMetric) {
  const values = series.buckets.map((bucket) => bucketValue(metric, bucket));
  const unitWord = series.unit === "hour" ? "每小时" : series.unit === "week" ? "每周" : "每天";
  const total = values.reduce((sum, value) => sum + value, 0);
  const bars = series.buckets.map((bucket, index) => ({
    key: bucket.start,
    value: values[index],
    tip: `${bucketLabel(series.unit, bucket.start)}\n${fmtTrend(metric, values[index])}`,
  }));
  const n = series.buckets.length;
  const short = (start: string) =>
    series.unit === "hour"
      ? `${Number(start.slice(11, 13))}:00`
      : `${Number(start.slice(5, 7))}月${Number(start.slice(8, 10))}日`;
  const xLabels =
    n === 0
      ? []
      : n < 3
        ? series.buckets.map((bucket) => short(bucket.start))
        : [
            short(series.buckets[0].start),
            short(series.buckets[Math.floor((n - 1) / 2)].start),
            short(series.buckets[n - 1].start),
          ];
  return { bars, xLabels, max: n ? Math.max(...values) : 0, average: n ? total / n : 0, unitWord };
}

// ---------------------------------------------------------------- 请求明细悬停卡

const per1M = (value: number | null | undefined) => (value == null ? DASH : `$${value.toFixed(2)} / 1M`);

export function priceDetail(row: UsageActivityRow): HoverDetail | null {
  const pricing = row.costProvenance?.pricingSnapshot;
  if (!pricing) return { title: row.model ?? "未知模型", mono: true, rows: [], note: "暂无单价" };
  return {
    title: row.model ?? pricing.apiModel,
    mono: true,
    rows: [
      ["缓存读取", per1M(pricing.rates.cacheRead)],
      ...(pricing.rates.cacheWrite != null ? [["缓存写入", per1M(pricing.rates.cacheWrite)] as const] : []),
      ["输入", per1M(pricing.rates.input)],
      ["输出", per1M(pricing.rates.output)],
    ],
    note: "单价来自模型配置；费用按请求发生时的单价算。",
  };
}

export function timeDetail(row: UsageActivityRow): HoverDetail | null {
  if (row.durationMs == null) return null;
  const speed =
    row.decodeMs && row.decodeMs > 0 && row.tokens.outputTokens != null
      ? row.tokens.outputTokens / (row.decodeMs / 1000)
      : null;
  return {
    title: "耗时明细",
    rows: [
      ["首字等待", fmtDuration(row.ttftMs)],
      ["模型输出", fmtDuration(row.decodeMs)],
      ["输出速度", speed == null ? DASH : `${Math.round(speed)} tok/s`],
    ],
    total: ["合计", fmtDuration(row.durationMs)],
  };
}

const count = (value: number | null | undefined) => (value == null ? DASH : value.toLocaleString("zh-CN"));

export function tokenDetail(tokens: {
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  reasoningTokens: number | null;
  totalTokens: number | null;
}): HoverDetail | null {
  if (tokens.totalTokens == null) return null;
  return {
    title: "Token 明细",
    rows: [
      ["缓存读取", count(tokens.cacheReadTokens)],
      ...(tokens.cacheWriteTokens ? [["缓存写入", count(tokens.cacheWriteTokens)] as const] : []),
      ["输入", count(tokens.inputTokens)],
      ["输出", count(tokens.outputTokens)],
      ...(tokens.reasoningTokens ? [["其中思考", count(tokens.reasoningTokens)] as const] : []),
    ],
    total: ["合计", count(tokens.totalTokens)],
  };
}

export function costDetail(row: UsageActivityRow): HoverDetail | null {
  const pricing = row.costProvenance?.pricingSnapshot;
  if (row.costAmount == null || row.costCurrency !== "USD") return null;
  if (!pricing || row.costProvenance?.basis === "provider-reported")
    return { title: "费用明细", rows: [], total: ["合计", fmtUsd(row.costAmount, true)], note: "费用由服务商返回。" };
  const parts: (readonly [string, string])[] = [];
  const add = (label: string, tokens: number | null, rate: number | null) => {
    if (tokens && rate != null) parts.push([label, `$${((tokens * rate) / 1e6).toFixed(4)}`]);
  };
  add("缓存读取", row.tokens.cacheReadTokens, pricing.rates.cacheRead);
  add("缓存写入", row.tokens.cacheWriteTokens, pricing.rates.cacheWrite);
  add("输入", row.tokens.inputTokens, pricing.rates.input);
  add("输出", row.tokens.outputTokens, pricing.rates.output);
  return { title: "费用明细", rows: parts, total: ["合计", `$${row.costAmount.toFixed(4)}`] };
}

export function modelTokenDetail(model: UsageActivityAggregate): HoverDetail {
  return tokenDetail(model)!;
}

export function modelCostDetail(model: UsageActivityAggregate): HoverDetail | null {
  const cost = model.costSummary;
  if (cost.knownCostRequestCount === 0) return null;
  return {
    title: "费用明细",
    rows: [
      ["已知费用的请求", `${fmtInt(cost.knownCostRequestCount)} 次`],
      ["费用未知的请求", `${fmtInt(cost.unknownCostRequestCount)} 次`],
      ["平均每次", fmtUsd(average(cost.costUsd, cost.knownCostRequestCount), true)],
    ],
    total: ["合计", fmtUsd(cost.costUsd)],
    note: cost.unverifiedHistoricalRequestCount ? "包含来源未验证的历史记录。" : undefined,
  };
}

/** 模型 tab 的速度：输出 token ÷ 输出时间。 */
export function modelSpeed(model: UsageActivityAggregate): number | null {
  return model.decodeMs > 0 ? model.decodeTokens / (model.decodeMs / 1000) : null;
}

/** 失败原因代码 → 中文；不认识的原样显示（不猜）。 */
const FAILURE_LABEL: Record<string, string> = {
  denied: "被拒绝",
  failed: "执行失败",
  aborted: "已中止",
  timeout: "超时",
  unknown: "未知原因",
  exit_nonzero: "退出码非 0",
  TOOL_EXECUTION_FAILED: "执行失败",
  TOOL_ABORTED: "已中止",
  TOOL_SCOPE_DENIED: "超出授权范围",
  CAPABILITY_DENIED: "权限被拒绝",
  POLICY_DENIED: "策略拒绝",
  APPROVAL_TIMEOUT: "审批超时",
  APPROVAL_STALE: "审批已过期",
  INVALID_ARGUMENTS: "参数无效",
  SUBAGENT_TOOL_BLOCKED: "子 Agent 不可用",
};
export const failureLabel = (code: string) => FAILURE_LABEL[code] ?? code;
