import { useState } from "react";
import { CircleAlert, Info, RefreshCw, Share2, X } from "lucide-react";
import type {
  UsageStatisticsDailyRow,
  UsageStatisticsModelEntry,
  UsageStatisticsSnapshot,
  UsageStatisticsToolEntry,
} from "@actspace/shared";
import { mockUsageStatistics } from "../fixtures/usageStatisticsFixture";

type Props = {
  snapshot: UsageStatisticsSnapshot | null;
  isLoading?: boolean;
  error?: string | null;
  onRefresh?: (range: UsageStatisticsSnapshot["range"]) => void;
  onBackToChat?: () => void;
};

const RANGE_TABS = ["day", "week", "month", "total"] as const;
const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];
const MONTH_LABELS = ["1月", "2月", "3月", "4月", "5月"];
const TOOL_COLORS = ["#2f6fff", "#28b7d8", "#8b5cf6", "#9aa8bb", "#4f7cff", "#93a4b8"];

const panelClass =
  "w-full rounded-[18px] border border-line/90 bg-white/95 shadow-[0_12px_40px_rgba(31,45,61,0.05)]";
const metricCardClass =
  "rounded-act-lg border border-line bg-white px-4 py-3 shadow-none";
const iconButtonClass =
  "inline-flex h-9 w-9 items-center justify-center rounded-act-md border border-line bg-white text-text-main transition hover:border-brand/30 hover:bg-brand-soft hover:text-brand";
const actionButtonClass =
  "inline-flex h-9 items-center justify-center gap-2 rounded-act-md border border-line bg-white px-3 text-[13px] font-semibold text-text-main transition hover:border-brand/30 hover:bg-brand-soft hover:text-brand";

function formatMillions(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

function formatPercent(value: number): string {
  return `${value.toFixed(value >= 10 || Number.isInteger(value) ? 0 : 1)}%`;
}

function formatMoney(value: number): string {
  return `$${value.toFixed(2)}`;
}

function getRangeLabel(range: UsageStatisticsSnapshot["range"]): string {
  switch (range) {
    case "day":
      return "日";
    case "week":
      return "周";
    case "month":
      return "月";
    case "total":
      return "总计";
    default:
      return "自定义";
  }
}

function sumTokens(rows: UsageStatisticsDailyRow[]): number {
  return rows.reduce((total, row) => total + row.totalTokens, 0);
}

function clampLevel(value: number): 0 | 1 | 2 | 3 {
  if (value <= 0.18) return 0;
  if (value <= 0.42) return 1;
  if (value <= 0.72) return 2;
  return 3;
}

function heatmapCellClass(level: 0 | 1 | 2 | 3): string {
  const colors = ["bg-[#e9edf3]", "bg-[#cfe0ff]", "bg-[#78a9ff]", "bg-brand"];
  return `h-3.5 w-3.5 shrink-0 rounded-[4px] ${colors[level]}`;
}

function buildTrendBars(rows: UsageStatisticsDailyRow[]): Array<{ value: number; label: string }> {
  const source = rows.length > 0 ? rows.slice(0, 31) : [];
  const normalized = source.length > 0 ? source : mockUsageStatistics.dailyRows;
  const bars = Array.from({ length: 31 }, (_, index) => normalized[index % normalized.length]);
  const maxTokens = Math.max(1, ...bars.map((row) => row.totalTokens));
  return bars.map((row) => ({
    value: row.totalTokens / maxTokens,
    label: row.date.slice(5),
  }));
}

function buildHeatmap(rows: UsageStatisticsDailyRow[]) {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const map = new Map(sorted.map((row) => [row.date, row.totalTokens] as const));
  const latest = sorted.at(-1)?.date ?? mockUsageStatistics.dailyRows[0]?.date ?? new Date().toISOString().slice(0, 10);
  const anchor = new Date(`${latest}T00:00:00`);
  const totalCells = 7 * 16;
  const start = new Date(anchor);
  start.setDate(start.getDate() - (totalCells - 1));
  const maxTokens = Math.max(1, ...sorted.map((row) => row.totalTokens), 1);

  const columns = Array.from({ length: 16 }, (_, columnIndex) =>
    Array.from({ length: 7 }, (_, weekday) => {
      const date = new Date(start);
      date.setDate(start.getDate() + columnIndex * 7 + weekday);
      const iso = date.toISOString().slice(0, 10);
      const tokens = map.get(iso) ?? 0;
      return {
        iso,
        level: clampLevel(tokens / maxTokens),
      };
    }),
  );

  return { columns, maxTokens };
}

function ToolDetailModal({
  tool,
  onClose,
}: {
  tool: UsageStatisticsToolEntry;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-900/30 p-7 backdrop-blur-md" role="presentation" onClick={onClose}>
      <div
        className="max-h-[calc(100vh-56px)] w-[640px] max-w-full overflow-auto rounded-2xl border border-[#dce5f3] bg-white shadow-[0_24px_70px_rgba(17,24,39,0.18)]"
        role="dialog"
        aria-modal="true"
        aria-label={`${tool.name} details`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-5 border-b border-line px-5 py-5">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-subtle">Tool detail</div>
            <h3 className="mt-1 text-[22px] font-bold text-text-main">{tool.name}</h3>
          </div>
          <button className={iconButtonClass} type="button" aria-label="Close detail" onClick={onClose}>
            <X size={16} strokeWidth={2} />
          </button>
        </header>
        <div className="grid grid-cols-2 gap-2.5 px-5 py-5">
          {[
            ["调用次数", tool.callCount.toLocaleString()],
            ["占比", formatPercent(tool.percent)],
            ["失败", tool.failedCount.toLocaleString()],
            ["平均耗时", tool.averageDurationMs ? `${Math.round(tool.averageDurationMs / 100) / 10}s` : "-"],
          ].map(([label, value]) => (
            <div key={label} className="grid gap-1 rounded-act-lg border border-line bg-white p-3">
              <span className="text-xs text-text-muted">{label}</span>
              <strong className="text-lg font-bold text-text-main">{value}</strong>
            </div>
          ))}
        </div>
        <p className="m-0 px-5 pb-5 text-xs leading-relaxed text-text-muted">
          后续可以接调用链、参数、错误原因和关联会话。现在先保留一个轻量详情弹窗。
        </p>
      </div>
    </div>
  );
}

function CostDetailModal({
  totalCost,
  onClose,
}: {
  totalCost: number;
  onClose: () => void;
}) {
  const breakdown = [
    { label: "DeepSeek R1", value: 181.24 },
    { label: "Kimi K2", value: 72.9 },
    { label: "Mock / local", value: 0 },
    { label: "缓存节省估算", value: -25.82 },
  ];

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-900/30 p-7 backdrop-blur-md" role="presentation" onClick={onClose}>
      <div
        className="w-[660px] max-w-[calc(100vw-48px)] rounded-[20px] border border-[#dce5f3] bg-white shadow-[0_28px_84px_rgba(17,24,39,0.2)]"
        role="dialog"
        aria-modal="true"
        aria-label="Estimated cost details"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-5 border-b border-line px-7 py-6">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-subtle">Estimated Cost</div>
            <h3 className="mt-1 text-[26px] font-bold leading-none tracking-[-0.02em] text-text-main">{formatMoney(totalCost)}</h3>
            <p className="mt-3 text-[13px] leading-relaxed text-text-muted">基于当前模型单价与 token usage 估算。</p>
          </div>
          <button className={iconButtonClass} type="button" aria-label="Close cost detail" onClick={onClose}>
            <X size={16} strokeWidth={2} />
          </button>
        </header>
        <div className="grid px-7 pb-6 pt-2">
          {breakdown.map((item) => (
            <div key={item.label} className="flex items-center justify-between gap-4 border-b border-line py-4 text-lg last:border-b-0">
              <span className="text-text-main">{item.label}</span>
              <strong className="font-bold tabular-nums text-text-main">
                {item.value < 0 ? `-${formatMoney(Math.abs(item.value))}` : formatMoney(item.value)}
              </strong>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ToolRow({
  tool,
  color,
  onOpen,
}: {
  tool: UsageStatisticsToolEntry;
  color: string;
  onOpen: (tool: UsageStatisticsToolEntry) => void;
}) {
  return (
    <button
      className="grid w-full grid-cols-[12px_minmax(0,1fr)_auto] items-center gap-2 rounded-md py-0.5 text-left text-xs text-text-muted transition hover:text-brand"
      type="button"
      onClick={() => onOpen(tool)}
    >
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{tool.name}</span>
      <strong className="font-bold tabular-nums text-text-main">{formatPercent(tool.percent)}</strong>
    </button>
  );
}

function ModelRow({ model }: { model: UsageStatisticsModelEntry }) {
  return (
    <article className="flex items-center gap-3 text-[15px]">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#f1f3f5] text-[11px] font-semibold text-[#8f96a3]">
        {model.name === "gpt-5.5" ? "1" : model.name.includes("claude") ? "2" : "3"}
      </span>
      <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-text-muted">{model.name}</span>
      <strong className="min-w-[58px] text-right text-[15px] font-bold tabular-nums text-text-main">{formatPercent(model.percent)}</strong>
    </article>
  );
}

function BreakdownCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className={metricCardClass}>
      <span className="text-xs font-bold text-text-muted">{label}</span>
      <strong className="mt-1.5 block text-lg font-bold tabular-nums text-text-main">{value}</strong>
      <em className="mt-1 block text-[11px] not-italic text-text-subtle">{detail}</em>
    </article>
  );
}

export function UsageStatisticsPage({ snapshot, isLoading, error, onRefresh }: Props) {
  const effectiveSnapshot = snapshot ?? mockUsageStatistics;
  const [range, setRange] = useState<UsageStatisticsSnapshot["range"]>(effectiveSnapshot.range);
  const [selectedTool, setSelectedTool] = useState<UsageStatisticsToolEntry | null>(null);
  const [showCostDetail, setShowCostDetail] = useState(false);

  const summaryRows = effectiveSnapshot.dailyRows ?? [];
  const recent7d = sumTokens(summaryRows.slice(0, 7));
  const recent30d = sumTokens(summaryRows.slice(0, 30));
  const avg = summaryRows.length > 0 ? Math.round(recent30d / summaryRows.length) : 0;
  const monthValue = effectiveSnapshot.summary.toolCallCount;
  const trendBars = buildTrendBars(summaryRows);
  const heatmap = buildHeatmap(summaryRows);
  const cachePercent = effectiveSnapshot.summary.cacheEfficiencyPercent;

  return (
    <main className="h-full overflow-auto bg-[#f7f8fb] px-6 pb-6 pt-[calc(var(--window-chrome-strip-height)+12px)] text-text-main">
      <div className="grid min-h-[calc(100vh-48px)] min-w-0 grid-cols-[340px_minmax(0,1fr)] items-start gap-4">
        <section className="flex min-w-0 flex-col gap-4 self-stretch">
          <article className={`${panelClass} grid gap-3.5 p-4`}>
            <div className="grid grid-cols-4 gap-2">
              {[
                [formatMillions(recent7d), "7d"],
                [formatMillions(recent30d), "30d"],
                [formatMillions(avg), "avg"],
                [formatMillions(monthValue), "本月"],
              ].map(([value, label]) => (
                <div key={label} className="grid min-h-[58px] place-items-center rounded-act-lg bg-[#fafbfc] text-center">
                  <div>
                    <div className="text-base font-bold tabular-nums text-text-main">{value}</div>
                    <div className="mt-0.5 text-[11px] text-text-subtle">{label}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
              {effectiveSnapshot.modelDistribution.slice(0, 3).map((model) => (
                <ModelRow key={model.name} model={model} />
              ))}
            </div>
            <div className="mt-2 flex justify-between gap-3 border-t border-line pt-3 text-xs text-text-faint">
              <span>排名 {effectiveSnapshot.periodStart?.slice(0, 10) ?? "2025-09-01"}</span>
              <span>活跃天数 {summaryRows.length} 天</span>
            </div>
          </article>

          <article className={`${panelClass} grid gap-4 p-5`}>
            <div className="flex items-center justify-between gap-3">
              <div className="text-base font-semibold text-text-main">热力图</div>
              <div className="grid justify-items-end gap-2">
                <div className="flex rounded-[10px] border border-line bg-white p-0.5">
                  <button className="h-[26px] min-w-9 rounded-lg bg-surface-subtle px-2 text-xs font-bold text-text-main" type="button">2D</button>
                  <button className="h-[26px] min-w-9 rounded-lg px-2 text-xs font-bold text-text-faint" type="button">3D</button>
                </div>
                <span className="text-xs text-text-subtle">UTC+08:00</span>
              </div>
            </div>
            <div className="ml-[38px] flex gap-[26px] text-xs text-text-subtle">
              {MONTH_LABELS.map((month) => (
                <span key={month}>{month}</span>
              ))}
            </div>
            <div className="flex gap-2.5">
              <div className="flex flex-col gap-1 pt-px">
                {WEEKDAY_LABELS.map((label) => (
                  <span key={label} className="h-3.5 text-xs leading-[14px] text-text-faint">{label}</span>
                ))}
              </div>
              <div className="flex min-w-0 gap-1 overflow-x-auto pb-1.5">
                {heatmap.columns.map((column, columnIndex) => (
                  <div className="flex flex-col gap-1" key={columnIndex}>
                    {column.map((cell, rowIndex) => (
                      <span key={`${columnIndex}-${rowIndex}`} className={heatmapCellClass(cell.level)} title={cell.iso} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-end gap-1.5 text-xs text-text-subtle">
              <span>少</span>
              {[0, 1, 2, 3].map((level) => (
                <i key={level} className={heatmapCellClass(level as 0 | 1 | 2 | 3)} />
              ))}
              <span>多</span>
            </div>
          </article>

          <article className={`${panelClass} grid gap-4 p-5`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-subtle">Tool Calls</div>
                <div className="text-base font-bold text-text-main">工具调用</div>
              </div>
              <button className={actionButtonClass} type="button" onClick={() => setSelectedTool(effectiveSnapshot.toolDistribution[0] ?? null)}>
                查看详情
              </button>
            </div>
            <div className="rounded-act-lg border border-[#dbe7fa] bg-[#f8fbff] p-4">
              <div className="mb-2.5 flex items-center justify-between gap-3 text-xs font-bold text-text-faint">
                <span>本月工具调用分布</span>
                <strong className="text-[17px] font-bold tabular-nums text-text-main">{effectiveSnapshot.summary.toolCallCount.toLocaleString()} 次</strong>
              </div>
              <div className="flex h-[9px] overflow-hidden rounded-full bg-[#e8edf4]" aria-hidden="true">
                {effectiveSnapshot.toolDistribution.map((tool, index) => (
                  <span
                    key={tool.name}
                    className="h-full"
                    style={{
                      width: `${tool.percent}%`,
                      backgroundColor: TOOL_COLORS[index % TOOL_COLORS.length],
                    }}
                  />
                ))}
              </div>
              <div className="mt-3 flex flex-col gap-2">
                {effectiveSnapshot.toolDistribution.slice(0, 4).map((tool, index) => (
                  <ToolRow key={tool.name} tool={tool} color={TOOL_COLORS[index % TOOL_COLORS.length]} onOpen={setSelectedTool} />
                ))}
              </div>
            </div>
          </article>

          <article className={`${panelClass} flex flex-1 flex-col p-5`}>
            <div className="mb-[18px] text-base font-semibold text-text-main">使用趋势</div>
            <div className="flex h-[98px] items-end gap-1" aria-hidden="true">
              {trendBars.map((bar, index) => (
                <div className="flex h-full flex-1 items-end" key={index}>
                  <span
                    className="min-h-1 w-full rounded-t-md bg-gradient-to-b from-[#8bb6ff] to-brand opacity-75"
                    style={{ height: `${Math.max(8, bar.value * 100)}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-3 flex justify-between text-[13px] text-text-subtle">
              <span>{summaryRows.at(-1)?.date ?? "2026-05-01"}</span>
              <span>{summaryRows[0]?.date ?? "2026-05-31"}</span>
            </div>
          </article>
        </section>

        <section className="flex min-w-0 flex-col gap-4 self-stretch">
          {error ? (
            <section className={`${panelClass} grid gap-2 px-5 py-4`}>
              <CircleAlert size={20} strokeWidth={2} />
              <strong className="font-bold text-text-main">统计数据加载失败</strong>
              <p className="m-0 text-[13px] text-text-muted">{error}</p>
            </section>
          ) : null}

          <section className={`${panelClass} grid justify-items-center gap-4 px-6 pb-5 pt-[18px]`}>
            <div className="flex w-full items-center justify-between gap-3">
              <div className="inline-flex gap-1.5 rounded-full border border-line bg-white/85 p-1 shadow-[0_8px_24px_rgba(31,45,61,0.04)]" role="tablist" aria-label="Usage range">
                {RANGE_TABS.map((tab) => (
                  <button
                    key={tab}
                    className={`h-8 min-w-14 rounded-full px-3.5 text-[13px] font-semibold transition ${
                      tab === range ? "bg-brand-soft text-brand" : "text-text-muted hover:text-brand"
                    }`}
                    type="button"
                    role="tab"
                    aria-selected={tab === range}
                    onClick={() => {
                      setRange(tab);
                      onRefresh?.(tab);
                    }}
                  >
                    {getRangeLabel(tab)}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button className={actionButtonClass} type="button" onClick={() => onRefresh?.(range)}>
                  <RefreshCw size={15} strokeWidth={2} />
                  Refresh
                </button>
                <button className={actionButtonClass} type="button">
                  <Share2 size={15} strokeWidth={2} />
                  Share
                </button>
              </div>
            </div>

            <div className="grid justify-items-center gap-3 px-0 pb-0 pt-4 text-center">
              <div className="text-xs font-bold uppercase tracking-[0.05em] text-text-faint">TOKEN 总数</div>
              <div className="text-[clamp(56px,5.1vw,72px)] font-bold leading-[0.9] tracking-[-0.02em] text-black tabular-nums">
                {effectiveSnapshot.summary.totalTokens.toLocaleString()}
              </div>
              <button className="inline-flex items-center gap-1.5 text-xl font-bold text-brand transition hover:text-brand-strong" type="button" onClick={() => setShowCostDetail(true)}>
                {formatMoney(effectiveSnapshot.summary.costUsd)}
                <Info size={16} strokeWidth={2} />
              </button>
            </div>

            <div className="flex h-2 w-full overflow-hidden rounded-full bg-[#e8edf4]" aria-hidden="true">
              <span
                className="block h-full rounded-full bg-gradient-to-r from-brand via-[#28b7d8] to-[#8b5cf6]"
                style={{ width: `${Math.min(100, effectiveSnapshot.summary.cacheEfficiencyPercent)}%` }}
              />
            </div>
            <div className="flex w-full justify-between gap-3 text-[13px] text-text-faint">
              <span>缓存效率 {formatPercent(effectiveSnapshot.summary.cacheEfficiencyPercent)}</span>
              <span>{effectiveSnapshot.summary.toolCallCount.toLocaleString()} tool calls</span>
            </div>
            <section className="grid w-full grid-cols-4 gap-3">
              <BreakdownCard label="输入" value={formatMillions(effectiveSnapshot.summary.promptTokens)} detail="direct prompt" />
              <BreakdownCard label="输出" value={formatMillions(effectiveSnapshot.summary.completionTokens)} detail="assistant reply" />
              <BreakdownCard label="缓存" value={formatMillions(effectiveSnapshot.summary.cacheHitTokens)} detail="cache read" />
              <BreakdownCard label="推理" value={formatMillions(effectiveSnapshot.summary.reasoningTokens)} detail="reasoning" />
            </section>
          </section>

          <section className={`${panelClass} p-5`}>
            <div className="grid grid-cols-[minmax(0,0.76fr)_1.24fr] items-center gap-5">
              <div>
                <div className="text-base font-semibold text-text-main">缓存效率</div>
                <div className="mt-3 text-[42px] font-bold leading-none tracking-[-0.02em] text-brand tabular-nums">{formatPercent(cachePercent)}</div>
                <div className="mt-[18px] h-[9px] overflow-hidden rounded-full bg-[#e7edf7]" aria-hidden="true">
                  <span className="block h-full rounded-full bg-gradient-to-r from-brand to-[#72a5ff]" style={{ width: `${cachePercent}%` }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <BreakdownCard label="缓存命中" value={formatMillions(effectiveSnapshot.summary.cacheHitTokens)} detail="缓存命中" />
                <BreakdownCard label="缓存未命中" value={formatMillions(effectiveSnapshot.summary.cacheMissTokens)} detail="缓存未命中" />
                <BreakdownCard label="推理 Token" value={formatMillions(effectiveSnapshot.summary.reasoningTokens)} detail="推理 Token" />
                <BreakdownCard label="会话数" value={effectiveSnapshot.summary.conversationCount.toLocaleString()} detail="会话数" />
              </div>
            </div>
          </section>

          <section className={`${panelClass} flex min-h-[360px] flex-1 flex-col px-5 pb-2.5 pt-[18px]`}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="text-base font-semibold text-text-main">每日细目</div>
              <span className="text-xs text-text-faint">latest rows</span>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[760px] border-collapse">
                <thead>
                  <tr>
                    {["日期", "总计", "输入", "输出", "缓存", "推理", "对话数"].map((heading, index) => (
                      <th
                        key={heading}
                        className={`sticky top-0 z-[1] border-b border-line bg-white p-3 text-xs font-semibold text-text-muted ${
                          index === 0 ? "text-left" : "text-right"
                        }`}
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {effectiveSnapshot.dailyRows.length > 0 ? (
                    effectiveSnapshot.dailyRows.map((row) => (
                      <tr key={row.date} className="hover:bg-[#fafcff]">
                        <td className="border-b border-line p-3 text-[13px] tabular-nums text-text-faint">{row.date}</td>
                        <td className="border-b border-line p-3 text-right font-mono text-xs font-bold tabular-nums text-text-main">{row.totalTokens.toLocaleString()}</td>
                        <td className="border-b border-line p-3 text-right font-mono text-xs tabular-nums text-text-muted">{row.promptTokens.toLocaleString()}</td>
                        <td className="border-b border-line p-3 text-right font-mono text-xs tabular-nums text-text-muted">{row.completionTokens.toLocaleString()}</td>
                        <td className="border-b border-line p-3 text-right font-mono text-xs tabular-nums text-text-muted">{row.cacheHitTokens.toLocaleString()}</td>
                        <td className="border-b border-line p-3 text-right font-mono text-xs tabular-nums text-text-muted">{row.reasoningTokens.toLocaleString()}</td>
                        <td className="border-b border-line p-3 text-right font-mono text-xs font-bold tabular-nums text-brand">{row.conversationCount.toLocaleString()}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-sm text-text-muted">No usage data yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {isLoading ? <div className="px-0.5 pt-1 text-xs text-text-faint">Loading usage statistics...</div> : null}
        </section>
      </div>

      {selectedTool ? <ToolDetailModal tool={selectedTool} onClose={() => setSelectedTool(null)} /> : null}
      {showCostDetail ? <CostDetailModal totalCost={effectiveSnapshot.summary.costUsd} onClose={() => setShowCostDetail(false)} /> : null}
    </main>
  );
}
