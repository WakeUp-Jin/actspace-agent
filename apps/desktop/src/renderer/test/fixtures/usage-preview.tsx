/** Explicit visual fixture, never imported by the production entry. */
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { UsageStatisticsPage } from "../../components/UsageStatisticsPage";
import { TooltipProvider } from "../../components/ui/Tooltip";
import { mockUsageActivity } from "./usageStatisticsFixture";
import type { UsageActivitySnapshot, UsageActivityRow } from "@actspace/shared";
import "../../styles/index.css";
const query = new URLSearchParams(location.search);
document.documentElement.dataset.theme = query.get("theme") ?? "light";
const samples: UsageActivityRow[] = query.has("empty") ? [] : Array.from({ length: 26 }, (_, i) => {
  const tool = i % 4 !== 0;
  return { ...mockUsageActivity.rows[tool ? 2 : 0], activityId: `preview-${i}`, sessionTitle: "检查模型配置与工作区文件", model: "deepseek-v4-flash", toolName: i % 2 ? "Bash" : "Read", startedAt: new Date(Date.UTC(2026, 8, 7, 13, 30) - i * 60_000).toISOString(), durationMs: tool ? 32 + i : 5480, status: i === 8 ? "error" : "success", tokens: tool ? mockUsageActivity.rows[2].tokens : { inputTokens: 769, outputTokens: 145, cacheReadTokens: 36736, cacheWriteTokens: 0, reasoningTokens: 0, totalTokens: 37650 }, costAmount: tool ? null : i === 8 ? null : 0.001044064, costCurrency: tool ? null : "USD", costBasis: tool || i === 8 ? "unavailable" : "estimated", costProvenance: tool ? undefined : { version: 1, basis: i === 8 ? "unknown" : "estimated", reason: i === 8 ? "usage-unavailable" : null, pricingSnapshot: { providerId: "deepseek", connectionId: null, modelKey: "deepseek:deepseek-v4-flash", apiModel: "deepseek-v4-flash", currency: "USD", rates: { input: 0.44, output: 1.32, cacheRead: 0.014, cacheWrite: null }, multiplier: 1, source: "deepseek-official", strategy: "fixed-peak", capturedAt: "2026-09-07T13:30:00Z", fetchedAt: "2026-09-07T00:00:00Z", contentHash: "fixture", unsupportedBilling: false } } };
});
function snapshot(search = "", status = "all", page = 1): UsageActivitySnapshot {
  const rows = samples.filter((row) => `${row.model} ${row.toolName}`.toLowerCase().includes(search.toLowerCase()) && (status === "all" || status === row.status));
  const models = rows.filter((r) => r.kind === "llm_request");
  const costSummary = { costUsd: models.reduce((sum, r) => sum + (r.costCurrency === "USD" ? (r.costAmount ?? 0) : 0), 0), knownCostRequestCount: models.filter((r) => r.costCurrency === "USD" && r.costAmount != null).length, unknownCostRequestCount: models.filter((r) => r.costCurrency !== "USD" || r.costAmount == null).length, unverifiedHistoricalRequestCount: 0 };
  const groups = (tools: boolean) => [...new Set(rows.filter((r) => (r.kind === "tool_invocation") === tools).map((r) => tools ? r.toolName! : r.model!))].map((label) => ({ key: label, label, count: rows.filter((r) => tools ? r.toolName === label : r.kind === "llm_request").length, errorCount: 0, totalTokens: tools ? 0 : models.length * 37650, durationMs: 120, costSummary }));
  return { ...mockUsageActivity, summary: { ...mockUsageActivity.summary, activityCount: rows.length, requestCount: models.length, toolCount: rows.length - models.length, totalTokens: models.length * 37650, inputTokens: models.length * 769, outputTokens: models.length * 145, cacheReadTokens: models.length * 36736 }, costSummary, tabCounts: { requests: samples.length, providers: samples.length ? 1 : 0, models: samples.length ? 1 : 0, tools: samples.length ? 2 : 0 }, rows: rows.slice((page - 1) * 10, page * 10), rowsPage: { page, pageSize: 10, totalRows: rows.length, totalPages: Math.max(1, Math.ceil(rows.length / 10)) }, aggregates: { models: groups(false), tools: groups(true), providers: models.length ? [{ ...groups(false)[0], key: "deepseek", label: "DeepSeek" }] : [] } };
}
function Preview() {
  const [state, setState] = useState(snapshot());
  return <TooltipProvider><div className="flex h-screen bg-app-bg"><aside aria-hidden className="w-[232px] shrink-0 border-r border-line bg-sidebar px-5 py-8 text-[13px] text-text-muted max-[800px]:hidden">设置<div className="mt-8 rounded-act-md bg-selected px-3 py-2 text-text-main">使用统计</div></aside><div className="min-w-0 flex-1"><UsageStatisticsPage snapshot={null} activitySnapshot={state} error={query.has("error") ? "读取失败，请重试。" : null} onRefresh={(_range, page, status, search) => setState(snapshot(search, status, page))} onRequestPageChange={(page, _range, status, search) => setState(snapshot(search, status, page))} /></div></div></TooltipProvider>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
