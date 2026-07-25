import { useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight, CircleAlert, Info, RefreshCw, Share2, X } from "lucide-react";
import type {
  DeepSeekBalanceSnapshot,
  KimiBalanceSnapshot,
  ProviderBalanceSnapshot,
  UsageStatisticsDailyModelBreakdown,
  UsageStatisticsDailyRow,
  UsageStatisticsModelEntry,
  UsageStatisticsRequestRowsPage,
  UsageStatisticsRequestRow,
  UsageStatisticsSnapshot,
  UsageStatisticsToolEntry,
  WorkspaceEntry,
} from "@actspace/shared";
import { MODEL_REGISTRY, resolveModelSpecByApiModel } from "@actspace/shared";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/Tooltip";

type Props = {
  snapshot: UsageStatisticsSnapshot | null;
  isLoading?: boolean;
  error?: string | null;
  onRefresh?: (range: UsageStatisticsSnapshot["range"], requestRowsPage?: number) => void;
  onRequestPageChange?: (page: number, range: UsageStatisticsSnapshot["range"]) => void;
  deepSeekBalance?: DeepSeekBalanceSnapshot | null;
  isDeepSeekBalanceLoading?: boolean;
  deepSeekBalanceError?: string | null;
  onRefreshDeepSeekBalance?: () => void;
  kimiBalance?: KimiBalanceSnapshot | null;
  isKimiBalanceLoading?: boolean;
  kimiBalanceError?: string | null;
  onRefreshKimiBalance?: () => void;
  onBackToChat?: () => void;
  workspaces?: WorkspaceEntry[];
};

const RANGE_TABS = ["day", "week", "month", "total"] as const;
const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];
const MONTH_LABELS = ["1月", "2月", "3月", "4月", "5月"];
const TOOL_COLORS = [
  "var(--act-chart-series-1)",
  "var(--act-chart-series-2)",
  "var(--act-chart-series-3)",
  "var(--act-chart-series-4)",
  "var(--act-chart-series-5)",
  "var(--act-chart-series-6)",
];

const panelClass =
  "w-full rounded-[18px] border border-line/90 bg-surface/95 shadow-act-soft";
const metricCardClass =
  "rounded-act-lg border border-line bg-surface px-4 py-3 shadow-none";
const iconButtonClass =
  "inline-flex h-9 w-9 items-center justify-center rounded-act-md border border-line bg-surface text-text-main transition hover:border-line-strong hover:bg-hover-overlay";
const actionButtonClass =
  "inline-flex h-9 items-center justify-center gap-2 rounded-act-md border border-line bg-surface px-3 text-[13px] font-semibold text-text-main transition hover:border-line-strong hover:bg-hover-overlay";

const REQUEST_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

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

function formatRequestTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return REQUEST_TIME_FORMATTER.format(date);
}

function compactSessionId(sessionId: string): string {
  if (sessionId.length <= 18) return sessionId;
  return `${sessionId.slice(0, 10)}...${sessionId.slice(-5)}`;
}

function normalizeWorkspacePath(path: string | undefined | null): string | null {
  const trimmed = path?.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, "");
}

function workspaceLabelFromRoot(root: string | undefined | null): string {
  const normalized = normalizeWorkspacePath(root);
  if (!normalized) return "Default workspace";
  const segments = normalized.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? normalized;
}

function resolveWorkspaceLabel(row: UsageStatisticsRequestRow, workspaces: WorkspaceEntry[] = []): string {
  const byId = row.workspaceId ? workspaces.find((workspace) => workspace.id === row.workspaceId) : undefined;
  if (byId) return byId.label;

  const rowRoot = normalizeWorkspacePath(row.workspaceRoot);
  const byRoot = rowRoot
    ? workspaces.find((workspace) => normalizeWorkspacePath(workspace.path) === rowRoot)
    : undefined;
  return byRoot?.label ?? workspaceLabelFromRoot(row.workspaceRoot);
}

function resolveRequestModelLabel(row: UsageStatisticsRequestRow): string {
  if (row.modelId && row.modelId in MODEL_REGISTRY) {
    return MODEL_REGISTRY[row.modelId].label;
  }
  return resolveModelSpecByApiModel(row.model)?.label ?? row.model;
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
  const colors = [
    "bg-surface-subtle",
    "bg-chart-series-1/20",
    "bg-chart-series-1/55",
    "bg-chart-series-1",
  ];
  return `h-3.5 w-3.5 shrink-0 rounded-[4px] ${colors[level]}`;
}

/**
 * 热力图单元格的展示模型。
 *
 * 维护 `level` + `dailyRow` 两个字段是为了：
 * - `level` 决定颜色档（保持现有的 4 档 GitHub 风格视觉）；
 * - `dailyRow` 直接挂载到格子上，hover 时 tooltip 不需要再二次查找 Map，避免 60fps 移动时的开销。
 *   没数据的日期 `dailyRow === null`，UI 会渲染成"无数据"占位 + 不显示 tooltip。
 */
type HeatmapCell = {
  iso: string;
  level: 0 | 1 | 2 | 3;
  dailyRow: UsageStatisticsDailyRow | null;
};

function buildHeatmap(rows: UsageStatisticsDailyRow[]): { columns: HeatmapCell[][]; maxTokens: number } {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const map = new Map(sorted.map((row) => [row.date, row] as const));
  const latest = sorted.at(-1)?.date ?? new Date().toISOString().slice(0, 10);
  const anchor = new Date(`${latest}T00:00:00`);
  const totalCells = 7 * 16;
  const start = new Date(anchor);
  start.setDate(start.getDate() - (totalCells - 1));
  const maxTokens = Math.max(1, ...sorted.map((row) => row.totalTokens), 1);

  const columns = Array.from({ length: 16 }, (_, columnIndex) =>
    Array.from({ length: 7 }, (_, weekday): HeatmapCell => {
      const date = new Date(start);
      date.setDate(start.getDate() + columnIndex * 7 + weekday);
      const iso = date.toISOString().slice(0, 10);
      const row = map.get(iso) ?? null;
      return {
        iso,
        level: clampLevel((row?.totalTokens ?? 0) / maxTokens),
        dailyRow: row,
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
    <div className="fixed inset-0 z-[100] grid place-items-center bg-overlay p-7 backdrop-blur-md" role="presentation" onClick={onClose}>
      <div
        className="max-h-[calc(100vh-56px)] w-[640px] max-w-full overflow-auto rounded-2xl border border-line bg-surface-raised shadow-act-popover"
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
          <Tooltip>
            <TooltipTrigger asChild>
              <button className={iconButtonClass} type="button" aria-label="Close detail" onClick={onClose}>
                <X size={16} strokeWidth={2} aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent>关闭详情</TooltipContent>
          </Tooltip>
        </header>
        <div className="grid grid-cols-2 gap-2.5 px-5 py-5">
          {[
            ["调用次数", tool.callCount.toLocaleString()],
            ["占比", formatPercent(tool.percent)],
            ["失败", tool.failedCount.toLocaleString()],
            ["平均耗时", tool.averageDurationMs ? `${Math.round(tool.averageDurationMs / 100) / 10}s` : "-"],
          ].map(([label, value]) => (
            <div key={label} className="grid gap-1 rounded-act-lg border border-line bg-surface p-3">
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
    { label: "估算总成本", value: totalCost },
  ];

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-overlay p-7 backdrop-blur-md" role="presentation" onClick={onClose}>
      <div
        className="w-[660px] max-w-[calc(100vw-48px)] rounded-[20px] border border-line bg-surface-raised shadow-act-popover"
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
          <Tooltip>
            <TooltipTrigger asChild>
              <button className={iconButtonClass} type="button" aria-label="Close cost detail" onClick={onClose}>
                <X size={16} strokeWidth={2} aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent>关闭详情</TooltipContent>
          </Tooltip>
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
      className="grid w-full grid-cols-[12px_minmax(0,1fr)_auto] items-center gap-2 rounded-md py-0.5 text-left text-xs text-text-muted transition hover:text-text-main"
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
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-subtle text-[11px] font-semibold text-text-faint">
        {model.name === "gpt-5.5" ? "1" : model.name.includes("claude") ? "2" : "3"}
      </span>
      <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-text-muted">{model.name}</span>
      <strong className="min-w-[58px] text-right text-[15px] font-bold tabular-nums text-text-main">{formatPercent(model.percent)}</strong>
    </article>
  );
}

function BreakdownCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <article className={metricCardClass}>
      <span className="text-xs font-bold text-text-muted">{label}</span>
      <strong className="mt-1.5 block text-lg font-bold tabular-nums text-text-main">{value}</strong>
      {detail ? <em className="mt-1 block text-[11px] not-italic text-text-subtle">{detail}</em> : null}
    </article>
  );
}

function getBalanceSymbol(currency: string): string {
  switch (currency.toUpperCase()) {
    case "CNY":
      return "¥";
    case "USD":
      return "$";
    default:
      return "";
  }
}

const PROVIDER_BALANCE_META: Record<ProviderBalanceSnapshot["provider"], { title: string; notConfigured: string }> = {
  deepseek: { title: "DeepSeek 余额", notConfigured: "未配置 DeepSeek API Key" },
  kimi: { title: "Kimi 余额", notConfigured: "未配置 Kimi API Key" },
};

function ProviderBalanceCard({
  provider,
  balance,
  isLoading,
  error,
  onRefresh,
}: {
  provider: ProviderBalanceSnapshot["provider"];
  balance?: ProviderBalanceSnapshot | null;
  isLoading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
}) {
  const meta = PROVIDER_BALANCE_META[provider];
  const display = balance?.displayBalance;
  const amount = display ? `${getBalanceSymbol(display.currency)}${display.amount}` : "--";
  const currency = display?.currency ?? "CNY";
  const helperText = isLoading
    ? "正在刷新余额..."
    : error
      ? "刷新失败，保留上次余额"
      : balance?.isConfigured === false
        ? meta.notConfigured
        : "每 5 分钟自动刷新";

  return (
    <article className={`${panelClass} grid gap-3 p-5`} aria-label={`${provider} balance`}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-text-faint">{meta.title}</div>
        <button
          className={`${iconButtonClass} h-8 w-8`}
          type="button"
          aria-label={`Refresh ${provider} balance`}
          disabled={isLoading}
          onClick={onRefresh}
        >
          <RefreshCw size={14} strokeWidth={2} className={isLoading ? "animate-spin" : ""} />
        </button>
      </div>
      <div className="flex items-baseline gap-2">
        <strong className="text-[34px] font-bold leading-none tracking-[-0.02em] text-text-main tabular-nums">
          {amount}
        </strong>
        <span className="text-[15px] font-semibold text-text-faint">{currency}</span>
      </div>
      <div className="text-[11px] text-text-subtle">{helperText}</div>
    </article>
  );
}

/** Tooltip 单条 model 颜色条用——和主区 toolDistribution 同一组配色，保证全页视觉一致。 */
const HEATMAP_MODEL_COLORS = [
  "var(--act-chart-series-1)",
  "var(--act-chart-series-2)",
  "var(--act-chart-series-3)",
  "var(--act-chart-series-4)",
  "var(--act-chart-series-5)",
  "var(--act-chart-series-6)",
];

/**
 * 单格 hover tooltip 锚点信息。
 *
 * 这里**不**把 tooltip 渲染成 portal——它跟着 hover 的格子走，相对父容器绝对定位就够用。
 * 改成 portal 会让 tooltip 跨越外层 `overflow-x-auto` 区域（避免被裁剪），但本场景外层没裁剪需求，
 * 保留在格子内的 z-index 栈即可，避免 portal 引入的 SSR / 单测复杂度。
 */
type HeatmapHover = {
  cell: HeatmapCell;
  /** 鼠标所在格的行索引（0=周日, 6=周六），用来决定 tooltip 朝上还是朝下，避免顶部被裁掉。 */
  weekRowIndex: number;
  /**
   * 鼠标进入瞬间拍下的 cell viewport 坐标快照。
   *
   * 为什么必须存 rect 而不是 ref 元素：tooltip 用 `position: fixed` 锚到 viewport
   * 坐标，避免被父级 `overflow-x-auto` 容器 clip（CSS overflow 规范的 "implicit auto"
   * 副作用——一个轴 hidden/auto 时另一轴的 visible 也会被升级为 auto，
   * absolute 子元素也会一起被裁）。
   *
   * 副作用：用户 hover 同一个 cell 时如果横向滚动，tooltip 不会跟着滚——
   * 但 hover 离开会触发 leave 清空 hover state，所以下次 enter 自然会拍新照。
   */
  anchorRect: DOMRect;
};

/**
 * GitHub 风格热力图主体 + hover 详情 tooltip。
 *
 * 设计要点：
 * - hover 状态保留在父组件，单格只负责上报；这样 tooltip 只渲染一份（不是每格一份），
 *   60fps 拖动也只走一次 setState；
 * - `tabIndex` 暴露给键盘焦点，焦点也会触发 tooltip——给 a11y 让路；
 * - `cell.dailyRow === null` 的"未发生过 LLM 调用"日期不显示 tooltip，避免空气 popover。
 */
function HeatmapGrid({ columns }: { columns: HeatmapCell[][] }) {
  const [hover, setHover] = useState<HeatmapHover | null>(null);

  return (
    <div className="relative flex gap-2.5">
      <div className="flex flex-col gap-1 pt-px">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label} className="h-3.5 text-xs leading-[14px] text-text-faint">
            {label}
          </span>
        ))}
      </div>
      <div className="flex min-w-0 gap-1 overflow-x-auto pb-1.5">
        {columns.map((column, columnIndex) => (
          <div className="flex flex-col gap-1" key={columnIndex}>
            {column.map((cell, rowIndex) => (
              // 用 div + role="button" 而不是真的 <button>：
              // 1) <button> 默认 padding / border / appearance 会与 tailwind preflight 互相博弈，
              //    给 14×14 小格子带来不必要的 sizing 风险。
              // 2) 我们只需要 hover / focus 触发 tooltip，没有 click 语义，
              //    所以 div + tabIndex 提供"可 focus 元素"已足够；screen reader 仍按 button 读。
              <div
                key={`${columnIndex}-${rowIndex}`}
                role="button"
                tabIndex={cell.dailyRow ? 0 : -1}
                className={`${heatmapCellClass(cell.level)} cursor-pointer ring-offset-1 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring`}
                aria-label={cell.dailyRow
                  ? `${cell.iso}：${cell.dailyRow.totalTokens.toLocaleString()} tokens`
                  : `${cell.iso}：无数据`}
                onMouseEnter={(event) => {
                  if (!cell.dailyRow) return;
                  setHover({
                    cell,
                    weekRowIndex: rowIndex,
                    anchorRect: event.currentTarget.getBoundingClientRect(),
                  });
                }}
                onMouseLeave={() => setHover((current) => (current?.cell.iso === cell.iso ? null : current))}
                onFocus={(event) => {
                  if (!cell.dailyRow) return;
                  setHover({
                    cell,
                    weekRowIndex: rowIndex,
                    anchorRect: event.currentTarget.getBoundingClientRect(),
                  });
                }}
                onBlur={() => setHover((current) => (current?.cell.iso === cell.iso ? null : current))}
              />
            ))}
          </div>
        ))}
      </div>
      {/*
        tooltip 渲染在 overflow-x-auto 容器外，且使用 position: fixed 锚到 viewport——
        这是逃出"implicit auto clip"（一个轴 hidden/auto 时另一轴的 visible 也会被升级）的最稳路径。
        只有当 hover.cell.dailyRow 非空时才渲染（onMouseEnter / onFocus 已做过同样的判断）。
      */}
      {hover && hover.cell.dailyRow ? (
        <HeatmapTooltip
          row={hover.cell.dailyRow}
          placement={hover.weekRowIndex <= 2 ? "below" : "above"}
          anchorRect={hover.anchorRect}
        />
      ) : null}
    </div>
  );
}

function HeatmapTooltip({
  row,
  placement,
  anchorRect,
}: {
  row: UsageStatisticsDailyRow;
  placement: "above" | "below";
  anchorRect: DOMRect;
}) {
  // 防御：旧 main 进程（未重启）返回的 dailyRow 可能不带 modelBreakdown 字段，
  // 此时按 `[]` 兜底，hover 仍能看到日期 + tokens，不至于整页崩溃。
  const breakdown = row.modelBreakdown ?? [];
  const topModels = breakdown.slice(0, 4);

  // 用 fixed + viewport 坐标定位：tooltip 完全脱离 overflow-x-auto 容器的 clip 范围。
  // - 水平：锚到 cell 水平中线，再 `translate(-50%)` 让 tooltip 居中；
  // - 垂直：placement=above 时 bottom 贴 cell 顶边上方 10px；below 时 top 贴 cell 底边下方 10px。
  const TOOLTIP_GAP = 10;
  const style: CSSProperties = {
    position: "fixed",
    left: `${anchorRect.left + anchorRect.width / 2}px`,
    top:
      placement === "above"
        ? `${anchorRect.top - TOOLTIP_GAP}px`
        : `${anchorRect.bottom + TOOLTIP_GAP}px`,
    transform:
      placement === "above" ? "translate(-50%, -100%)" : "translate(-50%, 0)",
    zIndex: 50,
  };

  return (
    <div
      role="tooltip"
      data-testid="heatmap-tooltip"
      style={style}
      className="pointer-events-none w-[260px] rounded-[14px] border border-line bg-surface-raised px-4 py-3.5 text-left shadow-act-popover"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12px] font-semibold tracking-[0.04em] text-text-subtle">{row.date}</span>
        {breakdown.length === 0 ? (
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-faint">no llm</span>
        ) : null}
      </div>
      <div className="mt-1.5 text-[22px] font-bold leading-none tabular-nums text-text-main">
        {row.totalTokens.toLocaleString()}
        <span className="ml-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-subtle">tokens</span>
      </div>
      {topModels.length > 0 ? (
        <>
          <div className="mt-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-subtle">model breakdown</div>
          <div className="mt-2 flex flex-col gap-1.5">
            {topModels.map((model, index) => (
              <HeatmapTooltipModelRow
                key={model.name}
                model={model}
                color={HEATMAP_MODEL_COLORS[index % HEATMAP_MODEL_COLORS.length]}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function HeatmapTooltipModelRow({
  model,
  color,
}: {
  model: UsageStatisticsDailyModelBreakdown;
  color: string;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_36px] items-center gap-2 text-[12px]">
      <div className="flex min-w-0 items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-text-muted" title={model.name}>
          {model.name}
        </span>
      </div>
      <span className="font-mono tabular-nums text-text-main">{model.totalTokens.toLocaleString()}</span>
      <span className="text-right text-[11px] font-semibold tabular-nums text-text-faint">
        {formatPercent(model.percent)}
      </span>
    </div>
  );
}

type RequestTokenHover = {
  row: UsageStatisticsRequestRow;
  anchorRect: DOMRect;
};

function RequestUsageTable({
  rows,
  page,
  workspaces,
  onPageChange,
}: {
  rows: UsageStatisticsRequestRow[];
  page: UsageStatisticsRequestRowsPage;
  workspaces?: WorkspaceEntry[];
  onPageChange?: (page: number) => void;
}) {
  const [hover, setHover] = useState<RequestTokenHover | null>(null);
  const hasPreviousPage = page.page > 1;
  const hasNextPage = page.page < page.totalPages;
  const firstRowNumber = page.totalRows > 0 ? (page.page - 1) * page.pageSize + 1 : 0;
  const lastRowNumber = page.totalRows > 0 ? firstRowNumber + rows.length - 1 : 0;

  return (
    <section className={`${panelClass} col-span-2 flex min-h-[340px] flex-col px-6 pb-5 pt-6`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-base font-semibold text-text-main">会话明细</div>
          <div className="mt-1 text-xs text-text-faint">按一轮用户输入聚合，每页 10 条，最近的模型调用在最前</div>
        </div>
        <span className="text-xs text-text-faint">
          {page.totalRows > 0
            ? `${firstRowNumber.toLocaleString()}-${lastRowNumber.toLocaleString()} / ${page.totalRows.toLocaleString()} rows`
            : "0 rows"}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[980px] border-collapse">
          <thead>
            <tr>
              {["时间", "Workspace", "sessionId", "模型", "Tokens", "模型调用"].map((heading, index) => (
                <th
                  key={heading}
                  className={`sticky top-0 z-[1] border-b border-line bg-surface p-3 text-xs font-semibold text-text-muted ${
                    index >= 4 ? "text-right" : "text-left"
                  }`}
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? (
              rows.map((row) => (
                <tr key={`${row.sessionId}:${row.turnId}`} className="hover:bg-surface-subtle">
                  <td className="border-b border-line p-3 text-[13px] tabular-nums text-text-faint">
                    {formatRequestTimestamp(row.timestamp)}
                  </td>
                  <td className="max-w-[190px] border-b border-line p-3 text-[13px] text-text-muted">
                    <span className="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap" title={row.workspaceRoot ?? resolveWorkspaceLabel(row, workspaces)}>
                      {resolveWorkspaceLabel(row, workspaces)}
                    </span>
                  </td>
                  <td className="border-b border-line p-3">
                    <span className="font-mono text-xs tabular-nums text-text-muted" title={row.sessionId}>
                      {compactSessionId(row.sessionId)}
                    </span>
                  </td>
                  <td className="max-w-[320px] border-b border-line p-3 text-[13px] text-text-muted">
                    <span className="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap" title={row.model}>
                      {resolveRequestModelLabel(row)}
                    </span>
                  </td>
                  <td className="border-b border-line p-3 text-right">
                    <button
                      type="button"
                      className="rounded-act-sm px-1.5 py-1 text-right font-mono text-xs font-bold tabular-nums text-text-main transition hover:bg-hover-overlay focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                      aria-label={`${row.totalTokens.toLocaleString()} tokens, show token breakdown`}
                      onMouseEnter={(event) => setHover({ row, anchorRect: event.currentTarget.getBoundingClientRect() })}
                      onMouseLeave={() => setHover((current) => (current?.row === row ? null : current))}
                      onFocus={(event) => setHover({ row, anchorRect: event.currentTarget.getBoundingClientRect() })}
                      onBlur={() => setHover((current) => (current?.row === row ? null : current))}
                    >
                      {row.totalTokens.toLocaleString()}
                    </button>
                  </td>
                  <td className="border-b border-line p-3 text-right font-mono text-xs tabular-nums text-text-muted">
                    {row.modelCallCount.toLocaleString()}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="p-8 text-center text-sm text-text-muted">No request rows yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center justify-end gap-2 border-t border-line pt-4">
        <button
          className={`${iconButtonClass} h-8 w-8`}
          type="button"
          aria-label="上一页会话明细"
          disabled={!hasPreviousPage}
          onClick={() => onPageChange?.(Math.max(1, page.page - 1))}
        >
          <ChevronLeft size={15} strokeWidth={2} aria-hidden="true" />
        </button>
        <div className="min-w-[118px] text-center text-xs font-semibold tabular-nums text-text-muted">
          {page.page.toLocaleString()} / {page.totalPages.toLocaleString()}
        </div>
        <button
          className={`${iconButtonClass} h-8 w-8`}
          type="button"
          aria-label="下一页会话明细"
          disabled={!hasNextPage}
          onClick={() => onPageChange?.(Math.min(page.totalPages, page.page + 1))}
        >
          <ChevronRight size={15} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
      {hover ? <RequestTokenTooltip row={hover.row} anchorRect={hover.anchorRect} /> : null}
    </section>
  );
}

function RequestTokenTooltip({
  row,
  anchorRect,
}: {
  row: UsageStatisticsRequestRow;
  anchorRect: DOMRect;
}) {
  const style: CSSProperties = {
    position: "fixed",
    left: `${anchorRect.left + anchorRect.width / 2}px`,
    top: `${anchorRect.bottom + 8}px`,
    transform: "translate(-50%, 0)",
    zIndex: 60,
  };
  const rows: Array<readonly [string, number]> = [
    ["Cache Read", row.cacheHitTokens],
    ["Input", row.promptTokens],
    ["Output", row.completionTokens],
    ...(row.reasoningTokens > 0 ? ([["Reasoning", row.reasoningTokens]] as const) : []),
  ];

  return (
    <div
      role="tooltip"
      data-testid="request-token-tooltip"
      style={style}
      className="pointer-events-none w-[220px] rounded-[14px] border border-line bg-surface-raised px-3.5 py-3 text-left shadow-act-popover"
    >
      <div className="grid gap-2 text-[12px]">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[minmax(0,1fr)_auto] gap-4">
            <span className="text-text-muted">{label}</span>
            <span className="font-mono tabular-nums text-text-main">{value.toLocaleString()}</span>
          </div>
        ))}
      </div>
      <div className="mt-2.5 grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-t border-line pt-2.5 text-[12px] font-semibold">
        <span className="text-text-main">Total</span>
        <span className="font-mono tabular-nums text-text-main">{row.totalTokens.toLocaleString()}</span>
      </div>
    </div>
  );
}

export function UsageStatisticsPage({
  snapshot,
  isLoading,
  error,
  onRefresh,
  onRequestPageChange,
  deepSeekBalance,
  isDeepSeekBalanceLoading,
  deepSeekBalanceError,
  onRefreshDeepSeekBalance,
  kimiBalance,
  isKimiBalanceLoading,
  kimiBalanceError,
  onRefreshKimiBalance,
  workspaces,
}: Props) {
  const [range, setRange] = useState<UsageStatisticsSnapshot["range"]>(snapshot?.range ?? "month");
  const [selectedTool, setSelectedTool] = useState<UsageStatisticsToolEntry | null>(null);
  const [showCostDetail, setShowCostDetail] = useState(false);

  if (!snapshot) {
    return (
      <main className="h-full overflow-auto bg-app-bg px-6 pb-6 pt-[calc(var(--window-chrome-strip-height)+12px)] text-text-main">
        <div className="grid min-h-[calc(100vh-48px)] min-w-0 grid-cols-[340px_minmax(0,1fr)] items-start gap-4">
          <section className="flex min-w-0 flex-col gap-4 self-stretch">
            <ProviderBalanceCard
              provider="deepseek"
              balance={deepSeekBalance}
              isLoading={isDeepSeekBalanceLoading}
              error={deepSeekBalanceError}
              onRefresh={onRefreshDeepSeekBalance}
            />
            <ProviderBalanceCard
              provider="kimi"
              balance={kimiBalance}
              isLoading={isKimiBalanceLoading}
              error={kimiBalanceError}
              onRefresh={onRefreshKimiBalance}
            />
          </section>

          <div className="grid min-h-[calc(100vh-48px)] place-items-center">
            <section className={`${panelClass} grid max-w-[560px] gap-4 p-7 text-center`}>
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-info-soft text-info">
                <Info size={22} strokeWidth={2} />
              </div>
              <div>
                <h1 className="m-0 text-2xl font-bold text-text-main">暂无 Usage 数据</h1>
                <p className="mx-auto mt-2 max-w-[420px] text-sm leading-6 text-text-muted">
                  这里汇总了你所有对话以及 Kairos 自主模式的 token、成本、缓存和工具调用。完成至少一次真实 Agent 调用后会自动出数据。
                </p>
              </div>
              {error ? (
                <div className="rounded-act-lg border border-danger/30 bg-danger-soft px-4 py-3 text-left text-sm text-on-danger">
                  {error}
                </div>
              ) : null}
              <div className="flex flex-wrap items-center justify-center gap-2">
                {RANGE_TABS.map((tab) => (
                  <button
                    key={tab}
                    className={`h-8 min-w-14 rounded-full px-3.5 text-[13px] font-semibold transition ${
                      tab === range ? "bg-selected font-semibold text-text-main" : "border border-line bg-surface text-text-muted hover:bg-hover-overlay hover:text-text-main"
                    }`}
                    type="button"
                    onClick={() => {
                      setRange(tab);
                      onRefresh?.(tab, 1);
                    }}
                  >
                    {getRangeLabel(tab)}
                  </button>
                ))}
              </div>
              <button className={`${actionButtonClass} mx-auto`} type="button" onClick={() => onRefresh?.(range, 1)}>
                <RefreshCw size={15} strokeWidth={2} />
                Refresh
              </button>
              {isLoading ? <div className="text-xs text-text-faint">Loading usage statistics...</div> : null}
            </section>
          </div>
        </div>
      </main>
    );
  }

  const effectiveSnapshot = snapshot;
  const summaryRows = effectiveSnapshot.dailyRows ?? [];
  const sortedSummaryRows = [...summaryRows].sort((a, b) => a.date.localeCompare(b.date));
  const recent7d = sumTokens(sortedSummaryRows.slice(-7));
  const recent30d = sumTokens(sortedSummaryRows.slice(-30));
  const avg = summaryRows.length > 0 ? Math.round(recent30d / summaryRows.length) : 0;
  const monthValue = effectiveSnapshot.summary.toolCallCount;
  const heatmap = buildHeatmap(summaryRows);
  const cachePercent = effectiveSnapshot.summary.cacheEfficiencyPercent;

  return (
    <main className="h-full overflow-auto bg-app-bg px-6 pb-6 pt-[calc(var(--window-chrome-strip-height)+12px)] text-text-main">
      <div className="grid min-h-[calc(100vh-48px)] min-w-0 grid-cols-[340px_minmax(0,1fr)] items-start gap-4">
        <section className="flex min-w-0 flex-col gap-4 self-stretch">
          <ProviderBalanceCard
            provider="deepseek"
            balance={deepSeekBalance}
            isLoading={isDeepSeekBalanceLoading}
            error={deepSeekBalanceError}
            onRefresh={onRefreshDeepSeekBalance}
          />
          <ProviderBalanceCard
            provider="kimi"
            balance={kimiBalance}
            isLoading={isKimiBalanceLoading}
            error={kimiBalanceError}
            onRefresh={onRefreshKimiBalance}
          />

          <article className={`${panelClass} grid gap-3.5 p-4`}>
            <div className="grid grid-cols-4 gap-2">
              {[
                [formatMillions(recent7d), "7d"],
                [formatMillions(recent30d), "30d"],
                [formatMillions(avg), "avg"],
                [formatMillions(monthValue), "本月"],
              ].map(([value, label]) => (
                <div key={label} className="grid min-h-[58px] place-items-center rounded-act-lg bg-surface-subtle text-center">
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
              <span>
                {effectiveSnapshot.scope === "global" ? "全部数据" : effectiveSnapshot.title}
                {typeof effectiveSnapshot.sourceCount === "number" && effectiveSnapshot.scope === "global"
                  ? ` · ${effectiveSnapshot.sourceCount} 个来源`
                  : ""}
              </span>
              <span>活跃天数 {summaryRows.length} 天</span>
            </div>
          </article>

          <article className={`${panelClass} grid gap-4 p-5`}>
            <div className="flex items-center justify-between gap-3">
              <div className="text-base font-semibold text-text-main">热力图</div>
              <div className="grid justify-items-end gap-2">
                <div className="flex rounded-[10px] border border-line bg-surface p-0.5">
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
            <HeatmapGrid columns={heatmap.columns} />
            <div className="flex items-center justify-end gap-1.5 text-xs text-text-subtle">
              <span>少</span>
              {[0, 1, 2, 3].map((level) => (
                <i key={level} className={heatmapCellClass(level as 0 | 1 | 2 | 3)} />
              ))}
              <span>多</span>
            </div>
          </article>

          {/*
            工具调用 panel：article 自己拿 `flex-1` 撑满左栏剩余空间（与右栏每日细目底部对齐），
            但**内部子项全部维持自然高度**——
              - 标题行：auto
              - 子卡片（蓝底分布卡）：auto，不加 flex-1
              - 4 行 ToolRow：gap-2 紧凑，不加 justify-between
            flex column 默认 `justify-content: flex-start` 会把多余空间收到底部，
            形成一整块 panel 内的下方留白；不会分散到 ToolRow 之间拉宽行距（用户认证为"丑"的形态）。
          */}
          <article className={`${panelClass} flex flex-1 min-h-0 flex-col gap-4 p-5`}>
            <div className="flex items-center justify-between gap-3">
              <div className="text-base font-bold text-text-main">工具调用</div>
              <button className={actionButtonClass} type="button" onClick={() => setSelectedTool(effectiveSnapshot.toolDistribution[0] ?? null)}>
                查看详情
              </button>
            </div>
            <div className="rounded-act-lg border border-line bg-surface-subtle p-4">
              <div className="mb-2.5 flex items-center justify-between gap-3 text-xs font-bold text-text-faint">
                <span>本月工具调用分布</span>
                <strong className="text-[17px] font-bold tabular-nums text-text-main">{effectiveSnapshot.summary.toolCallCount.toLocaleString()} 次</strong>
              </div>
              <div className="flex h-[9px] overflow-hidden rounded-full bg-surface-subtle" aria-hidden="true">
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
        </section>

        <section className="flex min-w-0 flex-col gap-4 self-stretch">
          {error ? (
            <section className={`${panelClass} grid gap-2 px-5 py-4`}>
              <CircleAlert size={20} strokeWidth={2} />
              <strong className="font-bold text-text-main">统计数据加载失败</strong>
              <p className="m-0 text-[13px] text-text-muted">{error}</p>
            </section>
          ) : null}

          <section className={`${panelClass} grid justify-items-center gap-4 px-6 pb-6 pt-6`}>
            <div className="flex w-full items-center justify-between gap-3">
              <div className="inline-flex gap-1.5 rounded-full border border-line bg-surface/85 p-1 shadow-[0_8px_24px_rgba(31,45,61,0.04)]" role="tablist" aria-label="Usage range">
                {RANGE_TABS.map((tab) => (
                  <button
                    key={tab}
                    className={`h-8 min-w-14 rounded-full px-3.5 text-[13px] font-semibold transition ${
                      tab === range ? "bg-selected font-semibold text-text-main" : "text-text-muted hover:bg-hover-overlay hover:text-text-main"
                    }`}
                    type="button"
                    role="tab"
                    aria-selected={tab === range}
                    onClick={() => {
                      setRange(tab);
                      onRefresh?.(tab, 1);
                    }}
                  >
                    {getRangeLabel(tab)}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button
                  className={actionButtonClass}
                  type="button"
                  onClick={() => onRefresh?.(range, effectiveSnapshot.requestRowsPage?.page ?? 1)}
                >
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
              <div className="text-[clamp(56px,5.1vw,72px)] font-bold leading-[0.9] tracking-[-0.02em] text-text-main tabular-nums">
                {effectiveSnapshot.summary.totalTokens.toLocaleString()}
              </div>
              <button className="inline-flex items-center gap-1.5 text-xl font-bold text-info transition hover:text-info-hover" type="button" onClick={() => setShowCostDetail(true)}>
                {formatMoney(effectiveSnapshot.summary.costUsd)}
                <Info size={16} strokeWidth={2} />
              </button>
            </div>

            <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-subtle" aria-hidden="true">
              <span
                className="block h-full rounded-full bg-gradient-to-r from-chart-series-1 via-chart-series-2 to-chart-series-3"
                style={{ width: `${Math.min(100, effectiveSnapshot.summary.cacheEfficiencyPercent)}%` }}
              />
            </div>
            <div className="flex w-full justify-between gap-3 text-[13px] text-text-faint">
              <span>缓存效率 {formatPercent(effectiveSnapshot.summary.cacheEfficiencyPercent)}</span>
              <span>{effectiveSnapshot.summary.toolCallCount.toLocaleString()} tool calls</span>
            </div>
            <section className="grid w-full grid-cols-4 gap-3">
              <BreakdownCard label="输入" value={formatMillions(effectiveSnapshot.summary.promptTokens)} />
              <BreakdownCard label="输出" value={formatMillions(effectiveSnapshot.summary.completionTokens)} />
              <BreakdownCard label="缓存" value={formatMillions(effectiveSnapshot.summary.cacheHitTokens)} />
              <BreakdownCard label="推理" value={formatMillions(effectiveSnapshot.summary.reasoningTokens)} />
            </section>
          </section>

          <section className={`${panelClass} p-6`}>
            <div className="grid grid-cols-[minmax(0,0.76fr)_1.24fr] items-center gap-5">
              <div>
                <div className="text-base font-semibold text-text-main">缓存效率</div>
                <div className="mt-3 text-[42px] font-bold leading-none tracking-[-0.02em] text-text-main tabular-nums">{formatPercent(cachePercent)}</div>
                <div className="mt-[18px] h-[9px] overflow-hidden rounded-full bg-surface-subtle" aria-hidden="true">
                  <span className="block h-full rounded-full bg-gradient-to-r from-chart-series-1 to-chart-series-2" style={{ width: `${cachePercent}%` }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {/*
                  缓存效率区 4 张卡的 detail 与 label 字面完全相同（"缓存命中"/"缓存未命中"/"推理 Token"/"会话数"），
                  属于冗余信息，全部省略 detail。主统计区的 detail 是中英对照（"输入"→"direct prompt" 等），
                  提供补充语义，保留不动。
                */}
                <BreakdownCard label="缓存命中" value={formatMillions(effectiveSnapshot.summary.cacheHitTokens)} />
                <BreakdownCard label="缓存未命中" value={formatMillions(effectiveSnapshot.summary.cacheMissTokens)} />
                <BreakdownCard label="推理 Token" value={formatMillions(effectiveSnapshot.summary.reasoningTokens)} />
                <BreakdownCard label="会话数" value={effectiveSnapshot.summary.conversationCount.toLocaleString()} />
              </div>
            </div>
          </section>

          <section className={`${panelClass} flex min-h-[360px] flex-1 flex-col px-6 pb-4 pt-6`}>
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
                        className={`sticky top-0 z-[1] border-b border-line bg-surface p-3 text-xs font-semibold text-text-muted ${
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
                      <tr key={row.date} className="hover:bg-surface-subtle">
                        <td className="border-b border-line p-3 text-[13px] tabular-nums text-text-faint">{row.date}</td>
                        <td className="border-b border-line p-3 text-right font-mono text-xs font-bold tabular-nums text-text-main">{row.totalTokens.toLocaleString()}</td>
                        <td className="border-b border-line p-3 text-right font-mono text-xs tabular-nums text-text-muted">{row.promptTokens.toLocaleString()}</td>
                        <td className="border-b border-line p-3 text-right font-mono text-xs tabular-nums text-text-muted">{row.completionTokens.toLocaleString()}</td>
                        <td className="border-b border-line p-3 text-right font-mono text-xs tabular-nums text-text-muted">{row.cacheHitTokens.toLocaleString()}</td>
                        <td className="border-b border-line p-3 text-right font-mono text-xs tabular-nums text-text-muted">{row.reasoningTokens.toLocaleString()}</td>
                        <td className="border-b border-line p-3 text-right font-mono text-xs font-bold tabular-nums text-text-main">{row.conversationCount.toLocaleString()}</td>
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

        <RequestUsageTable
          rows={effectiveSnapshot.requestRows ?? []}
          page={effectiveSnapshot.requestRowsPage ?? { page: 1, pageSize: 10, totalRows: 0, totalPages: 1 }}
          workspaces={workspaces}
          onPageChange={(page) => onRequestPageChange?.(page, effectiveSnapshot.range)}
        />
      </div>

      {selectedTool ? <ToolDetailModal tool={selectedTool} onClose={() => setSelectedTool(null)} /> : null}
      {showCostDetail ? <CostDetailModal totalCost={effectiveSnapshot.summary.costUsd} onClose={() => setShowCostDetail(false)} /> : null}
    </main>
  );
}
