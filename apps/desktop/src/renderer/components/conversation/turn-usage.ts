import type { TurnUsageSummary } from "@actspace/shared";
import { formatCacheHitPercent, formatExactTokens, formatTokens } from "../composer/composer-stats";
import { formatUsdCost } from "../../usage-format";

/** 弹窗里「花费」一行：能算全时给金额（按参考价算的标「预估」），有请求算不出价格时不给偏小的数。 */
export type TurnCost =
  | { readonly kind: "known"; readonly text: string; readonly estimated: boolean }
  | { readonly kind: "unknown"; readonly text: string };

export type TurnUsageModel = {
  /** 胶囊上的紧凑总数，例如「用量 88K tok」。 */
  readonly label: string;
  /** 弹窗标题右侧的精确总数。 */
  readonly total: string;
  /** 提供方 / 模型；拿不到时为 null，整行不显示。 */
  readonly routes: string | null;
  /** 缓存命中百分比（不带 %）；没有计费输入时为 null。 */
  readonly cacheHit: string | null;
  readonly input: string;
  readonly cacheRead: string;
  readonly cacheWrite: string;
  readonly output: string;
  /** 输出里的推理部分；为 0 时为 null。 */
  readonly reasoning: string | null;
  readonly cost: TurnCost;
};

const tok = (value: string) => `${value} tok`;

/**
 * 本轮用量胶囊和弹窗的展示模型，字段和顺序照 DeepSeek Harness 的 `TurnUsagePanel`，末尾多一行花费。
 * @param usage - 这一轮的用量合计。
 * @returns 展示模型；一个 token 都没有时为 null（不显示胶囊）。
 */
export function turnUsageModel(usage: TurnUsageSummary | undefined): TurnUsageModel | null {
  if (!usage || usage.totalTokens <= 0) return null;
  const promptTokens = usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
  return {
    label: `用量 ${tok(formatTokens(usage.totalTokens))}`,
    total: tok(formatExactTokens(usage.totalTokens)),
    routes: usage.routes.length > 0 ? usage.routes.join(", ") : null,
    cacheHit: formatCacheHitPercent(usage.cacheReadTokens, promptTokens, 1),
    input: tok(formatExactTokens(usage.inputTokens)),
    cacheRead: tok(formatExactTokens(usage.cacheReadTokens)),
    cacheWrite: tok(formatExactTokens(usage.cacheWriteTokens)),
    output: tok(formatExactTokens(usage.outputTokens)),
    reasoning: usage.reasoningTokens > 0 ? tok(formatExactTokens(usage.reasoningTokens)) : null,
    cost: turnCost(usage),
  };
}

function turnCost(usage: TurnUsageSummary): TurnCost {
  if (usage.unpricedRequestCount > 0) {
    return { kind: "unknown", text: usage.costUsd > 0 ? "部分未知" : "未知" };
  }
  return { kind: "known", text: formatUsdCost(usage.costUsd), estimated: usage.costEstimated };
}
