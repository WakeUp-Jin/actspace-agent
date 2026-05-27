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
    <div className="usage-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="usage-modal" role="dialog" aria-modal="true" aria-label={`${tool.name} details`} onClick={(event) => event.stopPropagation()}>
        <header className="usage-modal-header">
          <div>
            <div className="usage-modal-eyebrow">Tool detail</div>
            <h3>{tool.name}</h3>
          </div>
          <button className="usage-icon-button" type="button" aria-label="Close detail" onClick={onClose}>
            <X size={16} strokeWidth={2} />
          </button>
        </header>
        <div className="usage-modal-grid">
          <div>
            <span>调用次数</span>
            <strong>{tool.callCount.toLocaleString()}</strong>
          </div>
          <div>
            <span>占比</span>
            <strong>{formatPercent(tool.percent)}</strong>
          </div>
          <div>
            <span>失败</span>
            <strong>{tool.failedCount.toLocaleString()}</strong>
          </div>
          <div>
            <span>平均耗时</span>
            <strong>{tool.averageDurationMs ? `${Math.round(tool.averageDurationMs / 100) / 10}s` : "-"}</strong>
          </div>
        </div>
        <p className="usage-modal-note">后续可以接调用链、参数、错误原因和关联会话。现在先保留一个轻量详情弹窗。</p>
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
    <div className="usage-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="usage-cost-modal" role="dialog" aria-modal="true" aria-label="Estimated cost details" onClick={(event) => event.stopPropagation()}>
        <header className="usage-cost-modal-header">
          <div>
            <div className="usage-modal-eyebrow">Estimated Cost</div>
            <h3>{formatMoney(totalCost)}</h3>
            <p>基于当前模型单价与 token usage 估算。</p>
          </div>
          <button className="usage-icon-button" type="button" aria-label="Close cost detail" onClick={onClose}>
            <X size={16} strokeWidth={2} />
          </button>
        </header>
        <div className="usage-cost-list">
          {breakdown.map((item) => (
            <div key={item.label} className="usage-cost-row">
              <span>{item.label}</span>
              <strong className={item.value < 0 ? "is-negative" : ""}>{item.value < 0 ? `-${formatMoney(Math.abs(item.value))}` : formatMoney(item.value)}</strong>
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
    <button className="usage-tool-line" type="button" onClick={() => onOpen(tool)}>
      <span className="usage-tool-dot" style={{ backgroundColor: color }} />
      <span className="usage-tool-name">{tool.name}</span>
      <strong>{formatPercent(tool.percent)}</strong>
    </button>
  );
}

function ModelRow({ model }: { model: UsageStatisticsModelEntry }) {
  return (
    <article className="usage-rank-row">
      <span className="usage-rank-badge">{model.name === "gpt-5.5" ? "1" : model.name.includes("claude") ? "2" : "3"}</span>
      <span className="usage-rank-name">{model.name}</span>
      <strong className="usage-rank-pct">{formatPercent(model.percent)}</strong>
    </article>
  );
}

export function UsageStatisticsPage({ snapshot, isLoading, error, onRefresh, onBackToChat }: Props) {
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
  const maxHeat = heatmap.maxTokens;

  const cachePercent = effectiveSnapshot.summary.cacheEfficiencyPercent;

  return (
    <main className="usage-page">
      <div className="usage-grid">
        <section className="usage-left-column">
          <article className="usage-panel usage-side-summary">
            <div className="usage-summary-metrics">
              <div className="usage-metric-tile">
                <div className="usage-metric-val">{formatMillions(recent7d)}</div>
                <div className="usage-metric-lbl">7d</div>
              </div>
              <div className="usage-metric-tile">
                <div className="usage-metric-val">{formatMillions(recent30d)}</div>
                <div className="usage-metric-lbl">30d</div>
              </div>
              <div className="usage-metric-tile">
                <div className="usage-metric-val">{formatMillions(avg)}</div>
                <div className="usage-metric-lbl">avg</div>
              </div>
              <div className="usage-metric-tile">
                <div className="usage-metric-val">{formatMillions(monthValue)}</div>
                <div className="usage-metric-lbl">本月</div>
              </div>
            </div>
            <div className="usage-rank-list">
              {effectiveSnapshot.modelDistribution.slice(0, 3).map((model) => (
                <ModelRow key={model.name} model={model} />
              ))}
            </div>
            <div className="usage-side-foot">
              <span>排名 {effectiveSnapshot.periodStart?.slice(0, 10) ?? "2025-09-01"}</span>
              <span>活跃天数 {summaryRows.length} 天</span>
            </div>
          </article>

          <article className="usage-panel usage-heatmap-card">
            <div className="usage-card-head">
              <div className="usage-card-title">热力图</div>
              <div className="usage-heatmap-controls">
                <div className="usage-segmented">
                  <button className="is-active" type="button">2D</button>
                  <button type="button">3D</button>
                </div>
                <span className="usage-tz">UTC+08:00</span>
              </div>
            </div>
            <div className="usage-heatmap-months">
              {MONTH_LABELS.map((month) => (
                <span key={month} className="usage-heatmap-month">{month}</span>
              ))}
            </div>
            <div className="usage-heatmap-body">
              <div className="usage-heatmap-labels">
                {WEEKDAY_LABELS.map((label) => (
                  <span key={label} className="usage-heatmap-label">{label}</span>
                ))}
              </div>
              <div className="usage-heatmap-grid">
                {heatmap.columns.map((column, columnIndex) => (
                  <div className="usage-heatmap-column" key={columnIndex}>
                    {column.map((cell, rowIndex) => (
                      <span
                        key={`${columnIndex}-${rowIndex}`}
                        className="usage-heatmap-cell"
                        data-l={cell.level}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <div className="usage-heatmap-legend">
              <span>少</span>
              <i data-l="0" />
              <i data-l="1" />
              <i data-l="2" />
              <i data-l="3" />
              <span>多</span>
            </div>
          </article>

          <article className="usage-panel usage-tool-summary">
            <div className="usage-tool-head">
              <div>
                <div className="usage-tool-title">工具调用</div>
              </div>
              <button className="usage-tool-detail-button" type="button" onClick={() => setSelectedTool(effectiveSnapshot.toolDistribution[0] ?? null)}>
                查看详情
              </button>
            </div>
            <div className="usage-tool-meter">
              <div className="usage-tool-meter-row">
                <span>本月工具调用分布</span>
                <strong>{effectiveSnapshot.summary.toolCallCount.toLocaleString()} 次</strong>
              </div>
              <div className="usage-tool-bar" aria-hidden="true">
                {effectiveSnapshot.toolDistribution.map((tool, index) => (
                  <span
                    key={tool.name}
                    className="usage-tool-seg"
                    style={{
                      width: `${tool.percent}%`,
                      backgroundColor: TOOL_COLORS[index % TOOL_COLORS.length],
                    }}
                  />
                ))}
              </div>
              <div className="usage-tool-list">
                {effectiveSnapshot.toolDistribution.slice(0, 4).map((tool, index) => (
                  <ToolRow key={tool.name} tool={tool} color={TOOL_COLORS[index % TOOL_COLORS.length]} onOpen={setSelectedTool} />
                ))}
              </div>
            </div>
          </article>

          <article className="usage-panel usage-trend-card">
            <div className="usage-card-title" style={{ marginBottom: 18 }}>使用趋势</div>
            <div className="usage-trend-bars" aria-hidden="true">
              {trendBars.map((bar, index) => (
                <div className="usage-trend-col" key={index}>
                  <span className="usage-trend-bar" style={{ height: `${Math.max(8, bar.value * 100)}%` }} />
                </div>
              ))}
            </div>
            <div className="usage-trend-dates">
              <span>{summaryRows.at(-1)?.date ?? "2026-05-01"}</span>
              <span>{summaryRows[0]?.date ?? "2026-05-31"}</span>
            </div>
          </article>
        </section>

        <section className="usage-right-column">
          {error ? (
            <section className="usage-empty-state">
              <CircleAlert size={20} strokeWidth={2} />
              <strong>统计数据加载失败</strong>
              <p>{error}</p>
            </section>
          ) : null}

          <section className="usage-overview-card">
            <div className="usage-toolbar">
              <div className="usage-range-tabs" role="tablist" aria-label="Usage range">
                {RANGE_TABS.map((tab) => (
                  <button
                    key={tab}
                    className={tab === range ? "is-active" : ""}
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
              <div className="usage-toolbar-actions">
                <button className="usage-action-button" type="button" onClick={() => onRefresh?.(range)}>
                  <RefreshCw size={15} strokeWidth={2} />
                  Refresh
                </button>
                <button className="usage-action-button" type="button">
                  <Share2 size={15} strokeWidth={2} />
                  Share
                </button>
              </div>
            </div>
            <div className="usage-overview-main">
              <div className="usage-overview-label">TOKEN 总数</div>
              <div className="usage-overview-value">{effectiveSnapshot.summary.totalTokens.toLocaleString()}</div>
              <button className="usage-overview-cost" type="button" onClick={() => setShowCostDetail(true)}>
                {formatMoney(effectiveSnapshot.summary.costUsd)}
                <Info size={16} strokeWidth={2} />
              </button>
            </div>
            <div className="usage-overview-meter" aria-hidden="true">
              <span style={{ width: `${Math.min(100, effectiveSnapshot.summary.cacheEfficiencyPercent)}%` }} />
            </div>
            <div className="usage-overview-foot">
              <span>缓存效率 {formatPercent(effectiveSnapshot.summary.cacheEfficiencyPercent)}</span>
              <span>{effectiveSnapshot.summary.toolCallCount.toLocaleString()} tool calls</span>
            </div>
            <section className="usage-breakdown-grid">
              <article className="usage-breakdown-card">
                <span>输入</span>
                <strong>{formatMillions(effectiveSnapshot.summary.promptTokens)}</strong>
                <em>direct prompt</em>
              </article>
              <article className="usage-breakdown-card">
                <span>输出</span>
                <strong>{formatMillions(effectiveSnapshot.summary.completionTokens)}</strong>
                <em>assistant reply</em>
              </article>
              <article className="usage-breakdown-card">
                <span>缓存</span>
                <strong>{formatMillions(effectiveSnapshot.summary.cacheHitTokens)}</strong>
                <em>cache read</em>
              </article>
              <article className="usage-breakdown-card">
                <span>推理</span>
                <strong>{formatMillions(effectiveSnapshot.summary.reasoningTokens)}</strong>
                <em>reasoning</em>
              </article>
            </section>
          </section>

          <section className="usage-cache-card">
            <div className="usage-cache-layout">
              <div className="usage-cache-main">
                <div className="usage-cache-title">缓存效率</div>
                <div className="usage-cache-percentage">{formatPercent(cachePercent)}</div>
                <div className="usage-cache-meter" aria-hidden="true">
                  <span style={{ width: `${cachePercent}%` }} />
                </div>
              </div>
              <div className="usage-cache-stats">
                <article className="usage-breakdown-card">
                  <span>缓存命中</span>
                  <strong>{formatMillions(effectiveSnapshot.summary.cacheHitTokens)}</strong>
                  <em>缓存命中</em>
                </article>
                <article className="usage-breakdown-card">
                  <span>缓存未命中</span>
                  <strong>{formatMillions(effectiveSnapshot.summary.cacheMissTokens)}</strong>
                  <em>缓存未命中</em>
                </article>
                <article className="usage-breakdown-card">
                  <span>推理 Token</span>
                  <strong>{formatMillions(effectiveSnapshot.summary.reasoningTokens)}</strong>
                  <em>推理 Token</em>
                </article>
                <article className="usage-breakdown-card">
                  <span>会话数</span>
                  <strong>{effectiveSnapshot.summary.conversationCount.toLocaleString()}</strong>
                  <em>会话数</em>
                </article>
              </div>
            </div>
          </section>

          <section className="usage-table-card">
            <div className="usage-table-head">
              <div className="usage-card-title">每日细目</div>
              <span>latest rows</span>
            </div>
            <div className="usage-table-wrapper">
              <table className="usage-table">
                <thead>
                  <tr>
                    <th>日期</th>
                    <th>总计</th>
                    <th>输入</th>
                    <th>输出</th>
                    <th>缓存</th>
                    <th>推理</th>
                    <th>对话数</th>
                  </tr>
                </thead>
                <tbody>
                  {effectiveSnapshot.dailyRows.length > 0 ? (
                    effectiveSnapshot.dailyRows.map((row) => (
                      <tr key={row.date}>
                        <td>{row.date}</td>
                        <td className="usage-bold">{row.totalTokens.toLocaleString()}</td>
                        <td>{row.promptTokens.toLocaleString()}</td>
                        <td>{row.completionTokens.toLocaleString()}</td>
                        <td>{row.cacheHitTokens.toLocaleString()}</td>
                        <td>{row.reasoningTokens.toLocaleString()}</td>
                        <td className="usage-blue">{row.conversationCount.toLocaleString()}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="usage-table-empty">No usage data yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {isLoading ? <div className="usage-loading">Loading usage statistics…</div> : null}
        </section>
      </div>

      {selectedTool ? <ToolDetailModal tool={selectedTool} onClose={() => setSelectedTool(null)} /> : null}
      {showCostDetail ? <CostDetailModal totalCost={effectiveSnapshot.summary.costUsd} onClose={() => setShowCostDetail(false)} /> : null}
    </main>
  );
}
