import { useEffect, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import type { SettingsV4NamespacePatch, SettingsV4Snapshot, UsageActivityAggregate, UsageActivityKind, UsageActivitySnapshot, UsageCostSummary, UsageStatisticsSnapshot, WorkspaceEntry } from "@actspace/shared";
import { PageShell, SettingsSelect, StatusDot, Toggle } from "./settings/SettingsPrimitives";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/Tooltip";
import { UsageHoverCard } from "./usage/UsageHoverCard";
import { formatUsageAmount } from "../usage-format";

type Tab = "requests" | "providers" | "models" | "tools";
type Status = "all" | "success" | "error" | "aborted" | "unknown";
type Range = UsageStatisticsSnapshot["range"];
type Props = {
  snapshot: UsageStatisticsSnapshot | null;
  activitySnapshot?: UsageActivitySnapshot | null;
  isLoading?: boolean;
  error?: string | null;
  onRefresh?: (range: Range, page?: number, status?: Status, search?: string, kind?: UsageActivityKind) => void;
  onRequestPageChange?: (page: number, range: Range, status?: Status, search?: string, kind?: UsageActivityKind) => void;
  onBackToChat?: () => void;
  workspaces?: WorkspaceEntry[];
  settingsV4?: SettingsV4Snapshot | null;
  onUpdateNamespace?: (input: SettingsV4NamespacePatch) => Promise<SettingsV4Snapshot | null>;
};
const ranges: Array<[Range, string]> = [["day", "24 小时"], ["week", "7 天"], ["month", "30 天"], ["total", "全部"]];
const tabs: Array<[Tab, string]> = [["requests", "请求日志"], ["providers", "服务商"], ["models", "模型"], ["tools", "工具"]];
const statusOptions: Array<{ value: Status; label: string }> = [{ value: "all", label: "全部状态" }, { value: "success", label: "成功" }, { value: "error", label: "失败" }, { value: "aborted", label: "已中止" }, { value: "unknown", label: "未知" }];
const button = "inline-flex h-8 items-center justify-center gap-2 rounded-act-md px-2.5 text-act-xs font-medium text-text-muted hover:bg-hover-overlay active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-40";
const cell = "h-[38px] px-3 py-1.5 align-middle";
const tableFrame = "min-w-0 overflow-x-auto rounded-act-group border border-line bg-surface";
const tableHead = "border-b border-line bg-surface-subtle text-left text-act-xs font-medium text-text-muted [&_th]:h-[34px] [&_th]:font-medium";
const numberCell = `${cell} text-right tabular-nums whitespace-nowrap`;
const labels: Record<string, string> = { success: "成功", error: "失败", aborted: "已中止", running: "进行中", unknown: "未知" };
const number = (value: number | null | undefined) => value == null ? "—" : value.toLocaleString("zh-CN");
const money = (summary?: UsageCostSummary) => !summary || summary.knownCostRequestCount === 0 ? "费用未知" : formatUsageAmount(summary.costUsd, "USD");

export function UsageStatisticsPage({ activitySnapshot: data, isLoading, error, onRefresh, onRequestPageChange, settingsV4, onUpdateNamespace }: Props) {
  const saved = settingsV4?.settings.activity.usage;
  const [range, setRange] = useState<Range>(saved?.range === "24h" ? "day" : saved?.range === "7d" ? "week" : saved?.range === "all" ? "total" : "month");
  const [tab, setTab] = useState<Tab>(saved?.activeTab === "pricing" ? "requests" : saved?.activeTab ?? "requests");
  const [status, setStatus] = useState<Status>(saved?.status ?? "all");
  const [search, setSearch] = useState(saved?.modelFilter ?? "");
  const [details, setDetails] = useState(saved?.showDetails ?? true);
  const kind: UsageActivityKind | undefined = undefined;
  const queryStatus = tab === "requests" ? status : "all";
  useEffect(() => {
    const timer = setTimeout(() => onRefresh?.(range, 1, queryStatus, search, kind), 200);
    return () => clearTimeout(timer);
  }, [range, queryStatus, search, tab]);
  useEffect(() => {
    if (!saved || !onUpdateNamespace) return;
    const next = { ...saved, range: range === "day" ? "24h" as const : range === "week" ? "7d" as const : range === "total" ? "all" as const : "30d" as const, status, activeTab: tab, modelFilter: search, showDetails: details };
    if (JSON.stringify(next) === JSON.stringify(saved)) return;
    const timer = setTimeout(() => { void onUpdateNamespace({ namespace: "activity", patch: { usage: next } }).catch(() => undefined); }, 300);
    return () => clearTimeout(timer);
  }, [range, status, tab, search, details, saved, onUpdateNamespace]);
  const summary = data?.summary;
  const cost = data?.costSummary;
  const totalInput = (summary?.inputTokens ?? 0) + (summary?.cacheReadTokens ?? 0) + (summary?.cacheWriteTokens ?? 0);
  const hitRate = totalInput ? `${((summary?.cacheReadTokens ?? 0) / totalInput * 100).toFixed(1)}%` : "—";
  const rows = data?.rows ?? [];
  const counts = { requests: data?.tabCounts?.requests ?? data?.rowsPage.totalRows ?? 0, providers: data?.tabCounts?.providers ?? data?.aggregates?.providers.length ?? 0, models: data?.tabCounts?.models ?? data?.aggregates?.models.length ?? 0, tools: data?.tabCounts?.tools ?? data?.aggregates?.tools.length ?? 0 };
  const page = data?.rowsPage;
  const updatePage = (next: number) => onRequestPageChange?.(next, range, queryStatus, search, kind);
  return <main className="h-full min-w-0 overflow-auto bg-app-bg text-text-main">
    <PageShell width="wide" title="使用统计" description="模型调用、Token 用量与估算费用。">
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex rounded-act-md border border-line/60 bg-surface-subtle p-0.5" role="tablist" aria-label="统计时间范围">{ranges.map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={range === value} className={`h-6 rounded-act-sm px-3 text-act-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/30 ${range === value ? "bg-surface font-medium text-text-main shadow-act-xs" : "text-text-muted hover:text-text-main"}`} onClick={() => setRange(value)}>{label}</button>)}</div>
        <Tooltip><TooltipTrigger asChild><button type="button" className={button} aria-label="刷新使用统计" disabled={isLoading} onClick={() => onRefresh?.(range, page?.page ?? 1, queryStatus, search, kind)}><RefreshCw size={15} className={isLoading ? "animate-spin motion-reduce:animate-none" : ""} /></button></TooltipTrigger><TooltipContent>刷新使用统计</TooltipContent></Tooltip>
      </div>
      {error ? <div role="alert" className="flex items-center justify-between rounded-act-md bg-danger-soft px-3 py-2 text-act-xs text-on-danger"><span>{error}</span><button className={button} onClick={() => onRefresh?.(range, 1, queryStatus, search, kind)}>重试</button></div> : null}
      {isLoading && !data ? <div role="status" className="rounded-act-md bg-surface-subtle p-5 text-act-sm text-text-faint">正在读取使用记录…</div> : <section aria-label="使用概览" className="-mt-5 grid grid-cols-4 gap-2.5 max-[800px]:grid-cols-2 max-[400px]:grid-cols-1">
        <Metric label="请求数" value={number(summary?.requestCount)} detail="模型调用" />
        <Metric label="Token 用量" value={number(summary?.totalTokens)} detail={`输入 ${number(summary?.inputTokens)} · 输出 ${number(summary?.outputTokens)}`} />
        <Metric label={cost?.knownCostRequestCount && cost.unknownCostRequestCount ? "已知费用" : "费用"} value={summary?.requestCount === 0 ? "—" : money(cost)} detail={cost?.unknownCostRequestCount ? `${cost.knownCostRequestCount ? "另有 " : ""}${cost.unknownCostRequestCount} 次请求缺少费用依据` : cost?.unverifiedHistoricalRequestCount ? "包含来源未验证的历史记录" : "按请求记录 · USD 汇总"} warn={Boolean(cost?.unknownCostRequestCount || cost?.unverifiedHistoricalRequestCount)} />
        <Metric label="缓存命中率" value={hitRate} detail={`${number(summary?.cacheReadTokens)} 缓存 Token`} />
      </section>}
      <section className="flex min-w-0 flex-col gap-3">
        <div className="mt-1 flex gap-5 overflow-x-auto border-b border-line" role="tablist" aria-label="统计分类">{tabs.map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={tab === value} className={`-mb-px shrink-0 border-b-2 px-0.5 pb-2.5 text-act-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${tab === value ? "border-text-main text-text-main" : "border-transparent text-text-faint hover:text-text-main"}`} onClick={() => { setTab(value); setSearch(""); }}>{label} <span className="ml-1 text-act-xs font-normal tabular-nums text-text-subtle">{counts[value] ?? "—"}</span></button>)}</div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="日志筛选">
          <span className="relative flex min-w-0 flex-[0_1_280px] max-[600px]:flex-[1_1_100%]"><Search size={14} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-subtle" /><input aria-label="搜索使用记录" placeholder={tab === "requests" ? "按模型或工具筛选" : tab === "tools" ? "搜索工具" : "搜索模型或服务商"} value={search} onChange={(event) => setSearch(event.target.value)} className="h-[30px] w-full min-w-0 rounded-act-sm border border-line bg-surface pl-8 pr-2.5 text-act-sm text-text-main outline-none placeholder:text-text-subtle hover:border-line-strong focus-visible:border-focus-ring focus-visible:ring-[3px] focus-visible:ring-focus-ring/15" /></span>
          {tab === "requests" ? <>
            <SettingsSelect size="sm" ariaLabel="筛选状态" value={status} options={statusOptions} onChange={(value) => setStatus(value as Status)} />
          </> : null}
          {search || queryStatus !== "all" ? <button className={button} onClick={() => { setSearch(""); setStatus("all"); }}>清除筛选</button> : null}
          {tab === "requests" ? <label className="ml-auto flex h-[30px] shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap text-act-xs text-text-muted">显示明细<Toggle ariaLabel="显示明细" checked={details} onChange={setDetails} /></label> : null}
        </div>
        {tab === "providers" || tab === "models" || tab === "tools" ? <AggregateTable rows={data?.aggregates?.[tab] ?? []} tools={tab === "tools"} search={search} pending={Boolean(isLoading || error)} /> : !details ? <div className="flex items-center justify-between gap-3 rounded-act-md border border-line px-4 py-4 text-act-sm text-text-muted"><span>当前仅显示汇总，开启详细记录查看模型和工具调用。</span><button className={button} onClick={() => setDetails(true)}>显示记录</button></div> : <>
          <div className={tableFrame}>
            <table aria-label="请求日志" className="w-full min-w-[800px] table-fixed text-act-sm leading-5">
              <colgroup><col className="w-[125px]" /><col className="w-[55px]" /><col /><col className="w-[130px]" /><col className="w-[80px]" /><col className="w-[95px]" /><col className="w-[75px]" /><col className="w-[65px]" /></colgroup>
              <thead className={tableHead}><tr><th className={cell}>时间</th><th className={cell}>类型</th><th className={cell}>对象</th><th className={cell}>会话</th><th className={numberCell}>Token</th><th className={numberCell}>费用</th><th className={numberCell}>耗时</th><th className={cell}>状态</th></tr></thead>
              <tbody className="divide-y divide-line/60">{rows.map((row) => <tr key={row.activityId} className="hover:bg-hover-overlay">
                <td className={cell}><CellHint text={new Date(row.startedAt).toLocaleString("zh-CN")}><span className="block truncate tabular-nums text-text-muted">{new Date(row.startedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span></CellHint></td>
                <td className={`${cell} text-act-xs text-text-muted`}>{row.kind === "llm_request" ? "模型" : "工具"}</td>
                <td className={cell}>{row.kind === "llm_request" ? <UsageHoverCard row={row} view="model"><span className="block truncate font-mono text-act-xs">{row.model?.replace(/^[^:]+:/, "") ?? "未知模型"}</span></UsageHoverCard> : <CellHint text={row.toolName ?? "未知工具"}><span className="block truncate">{row.toolName ?? "未知工具"}</span></CellHint>}</td>
                <td className={cell}><CellHint text={row.sessionTitle ?? row.sessionId}><span className="block truncate text-text-muted">{row.sessionTitle ?? `未命名会话 · ${row.sessionId.slice(0, 8)}`}</span></CellHint></td>
                <td className={numberCell}>{row.kind === "tool_invocation" ? <span className="text-text-subtle">—</span> : <UsageHoverCard row={row} view="tokens">{number(row.tokens.totalTokens)}</UsageHoverCard>}</td>
                <td className={numberCell}>{row.kind === "tool_invocation" ? <span className="text-text-subtle">—</span> : row.costAmount == null || row.costCurrency !== "USD" ? <span className="text-text-subtle">未知</span> : formatUsageAmount(row.costAmount, "USD")}</td>
                <td className={numberCell}>{row.durationMs == null ? "—" : row.durationMs < 1000 ? `${Math.round(row.durationMs)}ms` : `${(row.durationMs / 1000).toFixed(2)}s`}</td>
                <td className={`${cell} whitespace-nowrap`}><StatusDot tone={row.status === "error" ? "error" : row.status === "running" ? "ok" : row.status === "aborted" || row.status === "unknown" ? "warn" : "neutral"}>{labels[row.status]}</StatusDot></td>
              </tr>)}</tbody>
            </table>
            {!rows.length && !isLoading && !error ? <Empty search={search || (status !== "all" ? status : "")} /> : null}
          </div>
          {page && page.totalRows > 0 ? <div className="flex items-center justify-between text-act-xs text-text-faint"><span>{(page.page - 1) * page.pageSize + 1}–{Math.min(page.page * page.pageSize, page.totalRows)} / {page.totalRows}</span><div className="flex items-center gap-1"><button className={button} disabled={page.page <= 1 || isLoading} onClick={() => updatePage(page.page - 1)}>上一页</button><span>{page.page} / {page.totalPages}</span><button className={button} disabled={page.page >= page.totalPages || isLoading} onClick={() => updatePage(page.page + 1)}>下一页</button></div></div> : null}
        </>}
        {isLoading && data ? <p role="status" className="text-act-xs text-text-faint">正在刷新…</p> : null}
      </section>
    </PageShell>
  </main>;
}

function Metric({ label, value, detail, warn = false }: { label: string; value: string; detail: string; warn?: boolean }) {
  return <div className="min-w-0 rounded-act-group border border-line bg-surface px-3.5 py-3"><div className="text-act-xs text-text-muted">{label}</div><div className="mb-0.5 mt-1 break-words text-act-xl font-semibold leading-tight tracking-tight tabular-nums">{value}</div><div className={`flex items-start gap-1.5 text-act-xxs leading-relaxed ${warn ? "text-warning" : "text-text-faint"}`}>{warn ? <span aria-hidden="true" className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-warning" /> : null}<span>{detail}</span></div></div>;
}
function Empty({ search }: { search?: string }) { return <p className="py-12 text-center text-act-sm text-text-faint">{search ? "没有符合筛选条件的记录" : "所选时间范围内暂无使用记录"}</p>; }
function AggregateTable({ rows, tools, search, pending }: { rows: UsageActivityAggregate[]; tools: boolean; search: string; pending: boolean }) {
  return <div className={tableFrame}><table className="w-full text-act-sm"><thead className={tableHead}><tr><th className={cell}>{tools ? "工具" : "名称"}</th><th className={numberCell}>调用数</th><th className={numberCell}>{tools ? "失败数" : "Token"}</th><th className={numberCell}>{tools ? "耗时" : "费用"}</th></tr></thead><tbody className="divide-y divide-line/60">{rows.map((row) => <tr key={row.key} className="hover:bg-hover-overlay"><td className={cell}><div tabIndex={0} className="max-w-[230px] truncate font-medium" title={row.label}>{row.label}</div>{<div className="text-text-faint">{row.connectionId ?? row.providerId ?? ""}{row.costSummary.unknownCostRequestCount ? ` · ${row.costSummary.unknownCostRequestCount} 次费用未知` : ""}</div>}</td><td className={numberCell}>{number(row.count)}</td><td className={numberCell}>{number(tools ? row.errorCount : row.totalTokens)}</td><td className={numberCell}>{tools ? `${(row.durationMs / 1000).toFixed(1)} 秒` : money(row.costSummary)}</td></tr>)}</tbody></table>{!rows.length && !pending ? <Empty search={search} /> : null}</div>;
}

function CellHint({ text, children }: { text: string; children: React.ReactNode }) {
  return <Tooltip><TooltipTrigger asChild><span tabIndex={0} className="block min-w-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">{children}</span></TooltipTrigger><TooltipContent className="max-w-[340px] whitespace-pre-line">{text}</TooltipContent></Tooltip>;
}
