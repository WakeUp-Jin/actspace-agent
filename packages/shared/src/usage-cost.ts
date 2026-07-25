import type { LlmUsageCost } from "./session";

/** Usage 页面当前统一采用的固定折算口径：7.2 CNY = 1 USD。 */
export const CNY_PER_USD = 7.2;

export function convertUsageCostToUsd(
  cost: Pick<LlmUsageCost, "total" | "currency"> | undefined,
): number {
  if (!cost || !Number.isFinite(cost.total)) return 0;
  return cost.currency === "USD" ? cost.total : cost.total / CNY_PER_USD;
}
