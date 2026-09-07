import type { UsageActivityAggregate, UsageActivityRow, UsageCostSummary } from "@actspace/shared";

export function summarizeActivityCosts(rows: readonly UsageActivityRow[]): UsageCostSummary {
  const result: UsageCostSummary = { amountsByCurrency: {}, knownCostRequestCount: 0, unknownCostRequestCount: 0, unverifiedHistoricalRequestCount: 0 };
  for (const row of rows) {
    if (row.kind !== "llm_request") continue;
    if (row.costAmount == null || !row.costCurrency) { result.unknownCostRequestCount += 1; continue; }
    result.knownCostRequestCount += 1;
    result.amountsByCurrency[row.costCurrency] = (result.amountsByCurrency[row.costCurrency] ?? 0) + row.costAmount;
    if (row.historicalUnverified) result.unverifiedHistoricalRequestCount += 1;
  }
  return result;
}

export function aggregateActivities(rows: readonly UsageActivityRow[]) {
  const group = (kind: "providers" | "models" | "tools"): UsageActivityAggregate[] => {
    const buckets = new Map<string, UsageActivityRow[]>();
    for (const row of rows) {
      if ((kind === "tools") !== (row.kind === "tool_invocation")) continue;
      const key = kind === "tools" ? row.toolName ?? "未知工具" : `${row.providerId ?? "未知服务商"}/${row.connectionId ?? ""}${kind === "models" ? `/${row.model ?? "未知模型"}` : ""}`;
      const bucket = buckets.get(key) ?? []; bucket.push(row); buckets.set(key, bucket);
    }
    return [...buckets].map(([key, items]) => ({ key, label: kind === "tools" ? items[0]!.toolName ?? "未知工具" : kind === "models" ? items[0]!.model ?? "未知模型" : items[0]!.providerId ?? "未知服务商", providerId: items[0]!.providerId, connectionId: items[0]!.connectionId, count: items.length, errorCount: items.filter((row) => row.status === "error").length, totalTokens: items.reduce((sum, row) => sum + (row.tokens.totalTokens ?? 0), 0), durationMs: items.reduce((sum, row) => sum + (row.durationMs ?? 0), 0), costSummary: summarizeActivityCosts(items) })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  };
  return { providers: group("providers"), models: group("models"), tools: group("tools") };
}
