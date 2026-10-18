import type { TurnUsageSummary } from "@actspace/shared";

// 本轮用量胶囊与弹层的展示模型（字段和顺序对齐桌面端 conversation/turn-usage.ts）。

/** 紧凑 token 数：517 / 12.2K / 517K / 1.2M。 */
export function formatTokens(value: number): string {
  const scaled = (candidate: number) => candidate >= 100 ? String(Math.round(candidate)) : String(Math.round(candidate * 10) / 10);
  if (value < 1_000) return String(value);
  if (value < 1_000_000) return `${scaled(value / 1_000)}K`;
  return `${scaled(value / 1_000_000)}M`;
}

export const formatExactTokens = (value: number): string => value.toLocaleString("en-US");

/** 缓存命中百分比（一位小数，不带 %）：没有输入时为 null；没全中时不会显示成 100。 */
export function cacheHitPercent(cacheRead: number, prompt: number): string | null {
  if (prompt <= 0) return null;
  if (cacheRead >= prompt) return "100";
  const value = Math.min(99.9, Math.round((cacheRead / prompt) * 1000) / 10);
  return String(value);
}

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", currencyDisplay: "narrowSymbol", minimumFractionDigits: 2, maximumFractionDigits: 6 });
export const formatUsd = (value: number): string => Number.isFinite(value) ? value > 0 && value < 0.000001 ? "<$0.000001" : USD.format(value) : "—";

export type TurnUsageView = {
  /** 胶囊上的紧凑总数，例如「用量 88K tok」。 */
  readonly label: string;
  readonly rows: readonly { readonly label: string; readonly value: string; readonly note?: string }[];
};

const tok = (value: number) => `${formatExactTokens(value)} tok`;

/** 一个 token 都没有时为 null（不显示胶囊）。 */
export function turnUsageView(usage: TurnUsageSummary | undefined): TurnUsageView | null {
  if (!usage || usage.totalTokens <= 0) return null;
  const prompt = usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
  const hit = cacheHitPercent(usage.cacheReadTokens, prompt);
  const rows: { label: string; value: string; note?: string }[] = [];
  if (usage.routes.length) rows.push({ label: "提供方 / 模型", value: usage.routes.join(", ") });
  if (hit !== null) rows.push({ label: "缓存命中", value: `${hit}%` });
  rows.push({ label: "未缓存输入", value: tok(usage.inputTokens) }, { label: "缓存读取", value: tok(usage.cacheReadTokens) }, { label: "缓存写入", value: tok(usage.cacheWriteTokens) });
  rows.push({ label: "输出", value: tok(usage.outputTokens), ...(usage.reasoningTokens > 0 ? { note: `其中推理 ${tok(usage.reasoningTokens)}` } : {}) });
  if (usage.unpricedRequestCount > 0) rows.push({ label: "花费", value: usage.costUsd > 0 ? "部分未知" : "未知" });
  else rows.push({ label: "花费", value: formatUsd(usage.costUsd), ...(usage.costEstimated ? { note: "预估" } : {}) });
  return { label: `用量 ${formatTokens(usage.totalTokens)} tok`, rows };
}
