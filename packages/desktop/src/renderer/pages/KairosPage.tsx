/**
 * KairosPage —— Kairos 自治模式主视图。
 *
 * 监控页布局：
 *   ┌────────────────────────────────────────────────────────────┐
 *   │ KairosHeader：品牌 + 状态胶囊 + 控制按钮                    │
 *   ├────────────────────────────────────────────────────────────┤
 *   │ KairosRuntimeTrace：低矮运行轨迹                            │
 *   ├──────────────────────────┬─────────────────────────────────┤
 *   │ KairosExecutionList      │ KairosStats + KairosDetailPanel  │
 *   └──────────────────────────┴─────────────────────────────────┘
 *
 * 注意：
 *   - 顶部必须 padding-top: var(--window-chrome-strip-height)（见 styles.css），
 *     否则 fixed chrome bar 会覆盖 KairosHeader 上的按钮。
 *   - 配置、Briefs、笔记 UI 暂不恢复；用户仍可通过本地文件编辑 Kairos 配置。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bolt,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Coins,
  FileText,
  Infinity as InfinityIcon,
  MessageSquare,
  Moon,
  Pause,
  RotateCcw,
  Wrench,
} from "lucide-react";
import type { KairosEventRow, KairosRuntimeState } from "@actspace/shared";
import { useKairos } from "../state/useKairos";
import { KairosContextSheet } from "../components/kairos/KairosContextSheet";
import {
  buildKairosStats,
  buildKairosUsageBadge,
  findKairosReplyText,
  findKairosToolDetail,
  formatKairosDuration,
  formatKairosTime,
  formatKairosTimeShort,
  getKairosDisplayRows,
  getKairosStatusLabel,
  getLatestKairosReply,
  kairosKindLabel,
  type KairosToolDetail,
  type KairosUsageBadgeMode,
  type KairosUsageBadgeModel,
} from "../state/kairosSelectors";

const USAGE_MODE_STORAGE_KEY = "kairos.usageBadgeMode";

/**
 * 把"用量胶囊当前显示的是 lifetime 还是 sinceReset"持久化到 localStorage，
 * 让用户跨开关页保持上次选择。
 *
 * - 第一次访问没有存储 → 默认 `sinceReset`（更接近"今日"心智，跟其它 today* 字段一致）。
 * - localStorage 不可用时退化为只在内存里维护，不抛错。
 */
function useKairosUsageMode(): [KairosUsageBadgeMode, (mode: KairosUsageBadgeMode) => void] {
  const [mode, setModeInternal] = useState<KairosUsageBadgeMode>(() => {
    if (typeof window === "undefined") return "sinceReset";
    try {
      const stored = window.localStorage.getItem(USAGE_MODE_STORAGE_KEY);
      return stored === "lifetime" ? "lifetime" : "sinceReset";
    } catch {
      return "sinceReset";
    }
  });
  const setMode = useCallback((next: KairosUsageBadgeMode) => {
    setModeInternal(next);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(USAGE_MODE_STORAGE_KEY, next);
    } catch {
      // localStorage 不可用（隐私模式 / quota 满）：仅内存维护，不报错。
    }
  }, []);
  return [mode, setMode];
}

type DetailTab = "reply" | "tool";
const EXECUTION_PAGE_SIZE = 10;
const TRACE_SEGMENT_GAP_PX = 4;
const TRACE_SEGMENT_BASE_PX = 20;
const TRACE_SEGMENT_PX_PER_SECOND = 5;
const TRACE_SEGMENT_MAX_PX = 100;
const TRACE_TONE_COLORS: Record<ReturnType<typeof traceTone>, string> = {
  reply: "#4a8af7",
  sleep: "#f0ad3d",
  error: "#ee5a55",
  other: "#d7dce5",
};
const pageRootClass =
  "relative flex h-full min-h-0 flex-col bg-[#f7f9fc] pt-[var(--window-chrome-strip-height)] text-[#1a1d24]";
const unavailablePageClass = `${pageRootClass} items-center justify-center`;
const unavailableCardClass =
  "max-w-[520px] rounded-act-lg border border-[#e6e8ef] bg-surface px-7 py-6 shadow-[0_4px_18px_rgba(15,23,42,0.04)]";
const headerClass =
  "flex items-center justify-between gap-4 border-b border-[#e6e8ef] bg-surface px-7 py-4 max-[760px]:items-start max-[760px]:flex-col max-[760px]:px-4";
const headerStatusClass =
  "inline-flex h-7 items-center gap-[7px] rounded-full border border-[#dfe8f3] bg-[#f8fbff] px-[11px] text-[13px] tabular-nums";
const headerUsageBadgeClass =
  "inline-flex h-7 items-center gap-[7px] rounded-full border border-[#e6e8ef] bg-[#fafbfe] pl-[6px] pr-[11px] text-[13px] tabular-nums text-[#4b5161]";
const headerUsageBadgeToggleClass =
  "inline-flex h-[22px] w-[22px] items-center justify-center rounded-full border border-transparent text-[#9aa3b2] transition hover:border-[#d4d7e0] hover:bg-[#eef1f6] hover:text-[#4b5161] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a7b3c4] focus-visible:ring-offset-1 focus-visible:ring-offset-[#fafbfe]";
const headerUsageBadgeSeparatorClass = "text-[#c5cad6]";
const headerUsageBadgeCostClass = "text-[#1a1d24] font-medium";
const headerUsageBadgeModeChipClass =
  "ml-[2px] inline-flex items-center rounded-full bg-[#eef1f6] px-[6px] py-[1px] text-[10.5px] tracking-wide text-[#6c7281]";
const kairosButtonClass =
  "inline-flex h-[38px] items-center justify-center gap-[7px] rounded-act-md border border-[#d4d7e0] bg-surface px-[18px] text-sm font-medium text-[#2c303a] transition hover:border-[#b5bac6] hover:bg-[#f5f7fb] disabled:cursor-not-allowed disabled:opacity-55";
const kairosPrimaryButtonClass =
  "border-[#bdd0f8] bg-[#edf4ff] text-[#1a1d24] hover:border-[#a9c0f3] hover:bg-[#e3eeff]";
const traceClass =
  "shrink-0 border-b border-[#e6e8ef] bg-surface px-7 pb-3.5 pt-4 max-[760px]:px-4";
const traceHeadClass =
  "mb-3 flex items-center justify-between gap-4 max-[760px]:items-start max-[760px]:flex-col";
const traceLegendClass = "flex items-center gap-4 text-xs text-[#6c7281]";
const traceBlockBaseClass =
  "h-[21px] min-w-5 flex-none rounded border border-transparent transition hover:-translate-y-px";
const mainGridClass =
  "grid min-h-0 flex-1 grid-cols-[minmax(620px,7fr)_minmax(340px,3fr)] gap-3 px-4 pb-4 pt-3 max-[1100px]:grid-cols-1";
const eventsPanelClass =
  "flex min-h-0 flex-col overflow-hidden rounded-act-md border border-[#e1e6ef] bg-surface";
const eventsTableClass = "w-full table-fixed border-collapse text-xs";
const eventsThClass =
  "sticky top-0 z-[1] border-b border-[#e6e8ef] bg-[#fafbfe] px-4 py-3 text-left text-xs font-medium text-[#6c7281]";
const eventsTdClass = "border-b border-[#f0f2f7] px-4 py-2.5 tabular-nums text-[#1a1d24]";
const eventsFooterClass =
  "mt-auto grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-t border-[#eef1f6] px-4 py-3 text-xs text-[#687083]";
const pageButtonClass =
  "inline-flex h-7 w-7 items-center justify-center rounded-[7px] border border-[#d9dfeb] bg-surface text-xs text-[#465063] hover:border-[#b9c6de] hover:bg-[#f7faff] disabled:cursor-not-allowed disabled:opacity-45";
const sideClass = "grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3 max-[1100px]:min-h-[520px]";
const statsClass =
  "grid grid-cols-4 overflow-hidden rounded-act-md border border-[#e1e6ef] bg-surface max-[760px]:grid-cols-2";
const detailPanelClass =
  "min-h-0 overflow-auto rounded-act-md border border-[#e1e6ef] bg-surface px-5 py-[18px]";
const detailTabsClass =
  "mb-[26px] inline-flex overflow-hidden rounded-act-md border border-[#dfe5ee] bg-surface";
const detailTabClass =
  "h-[38px] min-w-28 border-0 border-r border-[#dfe5ee] bg-transparent px-[18px] text-[13px] text-[#657085] last:border-r-0";
const detailActiveTabClass = "bg-[#f8fbff] text-[#1e5bd7] shadow-[inset_0_0_0_1px_#2f6fff]";
const detailToplineClass =
  "mb-6 flex items-center justify-between gap-4 max-[760px]:items-start max-[760px]:flex-col";
const detailMetaClass = "inline-flex items-center gap-2.5 text-xs tabular-nums text-[#6c7281]";
const detailReplyClass = "whitespace-pre-wrap break-words text-[17px] leading-[1.85] text-[#181b22]";
const detailPlaceholderClass =
  "flex min-h-40 items-center justify-center text-center text-[13px] text-[#8a90a0]";
const toolResultClass = "flex flex-col gap-3.5";
const toolResultSectionTextClass =
  "m-0 overflow-hidden text-ellipsis rounded-act-md border border-[#e6e8ef] bg-[#f8fafc] px-3 py-2.5 font-mono text-xs leading-[1.5] text-[#2c303a]";
const pageErrorClass =
  "absolute bottom-[18px] right-[18px] max-w-[min(520px,calc(100%_-_36px))] rounded-act-md border border-[#f3c4b1] bg-[#fff5f1] px-3 py-2.5 text-xs text-[#b04014] shadow-[0_12px_28px_rgba(166,62,38,0.12)]";

function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function KairosPage() {
  const k = useKairos();
  const [detailTab, setDetailTab] = useState<DetailTab>("reply");
  const [page, setPage] = useState(1);
  const [contextOpen, setContextOpen] = useState(false);

  // 用量胶囊：lifetime（全期账）+ sinceReset（阶段账）双维度。
  // 用户的选择持久化到 localStorage；缺省值为 sinceReset（更贴合日常关注的"今日"心智）。
  const [usageMode, setUsageMode] = useKairosUsageMode();
  const usageBadge = useMemo(
    () =>
      buildKairosUsageBadge(
        k.state ? { lifetime: k.state.usageLifetime, sinceReset: k.state.usageSinceReset } : null,
        usageMode,
      ),
    [k.state?.usageLifetime, k.state?.usageSinceReset, usageMode],
  );
  const toggleUsageMode = useCallback(() => {
    setUsageMode(usageMode === "lifetime" ? "sinceReset" : "lifetime");
  }, [usageMode, setUsageMode]);
  const displayRows = useMemo(() => getKairosDisplayRows(k.rows), [k.rows]);
  const totalPages = Math.max(1, Math.ceil(displayRows.length / EXECUTION_PAGE_SIZE));
  const pagedRows = useMemo(() => {
    const start = (page - 1) * EXECUTION_PAGE_SIZE;
    return displayRows.slice(start, start + EXECUTION_PAGE_SIZE);
  }, [displayRows, page]);
  const selectedRow = useMemo(
    () => k.rows.find((row) => row.id === k.selectedRowId) ?? null,
    [k.rows, k.selectedRowId],
  );
  const latestReply = useMemo(() => getLatestKairosReply(k.events, k.rows), [k.events, k.rows]);
  const selectedReplyText = selectedRow?.kind === "reply" ? findKairosReplyText(k.selectedEvents) : "";
  const latestReplyText = latestReply.text;
  const selectedTool = selectedRow?.kind === "tool" ? findKairosToolDetail(k.selectedEvents) : null;
  const detail: DetailModel = {
    replyText: selectedReplyText || latestReplyText,
    tool: selectedTool,
  };

  useEffect(() => {
    if (selectedRow?.kind === "tool") setDetailTab("tool");
    if (selectedRow?.kind === "reply") setDetailTab("reply");
  }, [selectedRow?.id, selectedRow?.kind]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const selectRow = (id: string | null) => {
    k.selectRow(id);
    if (!id) return;
    const index = displayRows.findIndex((row) => row.id === id);
    if (index >= 0) setPage(Math.floor(index / EXECUTION_PAGE_SIZE) + 1);
  };

  if (!k.bridgeAvailable) {
    return (
      <div className={unavailablePageClass}>
        <div className={unavailableCardClass}>
          <h2 className="m-0 mb-2 text-[17px] font-semibold">Kairos 桥未就绪</h2>
          <p className="m-0 text-[13px] leading-[1.55] text-[#5a6273]">
            当前运行环境未暴露 <code>window.kairos</code>。请在 Electron 环境下打开，或确认 preload 已加载。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={pageRootClass} role="region" aria-label="Kairos 自治模式">
      <KairosHeader
        state={k.state}
        usage={usageBadge}
        onToggleUsageMode={toggleUsageMode}
        bridgeAvailable={k.bridgeAvailable}
        contextOpen={contextOpen}
        onStart={() => k.control({ type: "start" }).catch(() => {})}
        onStop={() => k.control({ type: "stop" }).catch(() => {})}
        onWakeNow={() => k.control({ type: "wake_now" }).catch(() => {})}
        onResetToday={() => k.control({ type: "reset_today" }).catch(() => {})}
        onOpenContext={() => setContextOpen(true)}
      />

      <KairosRuntimeTrace
        rows={displayRows}
        selectedRowId={k.selectedRowId}
        onSelectRow={selectRow}
      />

      <div className={mainGridClass}>
        <KairosExecutionList
          rows={pagedRows}
          totalRows={displayRows.length}
          page={page}
          totalPages={totalPages}
          selectedRowId={k.selectedRowId}
          onPageChange={setPage}
          onSelectRow={selectRow}
        />
        <div className={sideClass}>
          <KairosStats state={k.state} rows={k.rows} />
          <KairosDetailPanel
            tab={detailTab}
            onTabChange={setDetailTab}
            detail={detail}
            selectedRow={selectedRow}
          />
        </div>
      </div>

      {k.error ? (
        <div className={pageErrorClass} role="alert">
          {k.error}
        </div>
      ) : null}

      <KairosContextSheet
        open={contextOpen}
        onOpenChange={setContextOpen}
        load={k.getContextSnapshot}
      />
    </div>
  );
}

// ─── RuntimeTrace ──────────────────────────────────────────────────

interface KairosRuntimeTraceProps {
  rows: KairosEventRow[];
  selectedRowId: string | null;
  onSelectRow(id: string): void;
}

function KairosRuntimeTrace(props: KairosRuntimeTraceProps) {
  const rows = props.rows.slice().reverse();
  const ticks = buildTraceTicks(rows);
  const segments = buildTraceSegments(rows);
  const timelineWidthPx = segments.reduce((sum, segment) => sum + segment.widthPx, 0)
    + Math.max(0, rows.length - 1) * TRACE_SEGMENT_GAP_PX;
  const viewportRef = useRef<HTMLDivElement>(null);
  const latestRowId = rows.at(-1)?.id;

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollLeft = viewport.scrollWidth;
  }, [latestRowId, rows.length]);

  return (
    <section className={traceClass} aria-label="运行轨迹（近 60 分钟）">
      <div className={traceHeadClass}>
        <div>
          <h2 className="m-0 inline text-[15px] font-semibold text-[#171a22]">运行轨迹</h2>
          <span className="ml-2 text-xs text-[#6c7281]">近 60 分钟</span>
        </div>
        <div className={traceLegendClass} aria-label="运行轨迹图例">
          <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-[3px] bg-[#4a8af7]" data-tone="reply" />回复</span>
          <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-[3px] bg-[#f0ad3d]" data-tone="sleep" />睡眠</span>
          <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-[3px] bg-[#ee5a55]" data-tone="error" />异常</span>
          <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-[3px] bg-[#d7dce5]" data-tone="other" />其他</span>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="flex h-7 items-center justify-center rounded-[7px] border border-dashed border-[#d8dee9] text-xs text-[#8a90a0]">等待 Kairos 事件</div>
      ) : (
        <div className="overflow-x-auto overflow-y-hidden pb-1" data-testid="kairos-trace-viewport" ref={viewportRef}>
          <div
            className="min-w-full"
            style={{ width: `max(100%, ${timelineWidthPx}px)` }}
          >
            <div className="flex min-h-6 flex-nowrap items-center gap-1" role="list">
              {rows.map((row, index) => (
                <button
                  key={row.id}
                  type="button"
                  role="listitem"
                  data-tone={traceTone(row)}
                  data-duration-ms={row.durationMs ?? 0}
                  data-testid="kairos-trace-block"
                  className={cn(
                    traceBlockBaseClass,
                    props.selectedRowId === row.id && "border-brand shadow-[0_0_0_2px_rgba(47,111,255,0.16)]",
                  )}
                  style={{
                    width: `${segments[index].widthPx}px`,
                    backgroundColor: TRACE_TONE_COLORS[traceTone(row)],
                  }}
                  title={`${formatKairosTime(row.startedAt)} · ${kairosKindLabel(row.kind)} · ${row.summary}`}
                  aria-label={`${formatKairosTime(row.startedAt)} ${kairosKindLabel(row.kind)} ${row.summary}`}
                  onClick={() => props.onSelectRow(row.id)}
                />
              ))}
            </div>
            {ticks.length > 0 ? (
              <div className="mt-[9px] flex justify-between gap-3 text-xs tabular-nums text-[#687083]" aria-hidden="true">
                {ticks.map((tick) => (
                  <span key={`${tick.index}-${tick.label}`}>{tick.label}</span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Header ─────────────────────────────────────────────────────────

interface KairosHeaderProps {
  state: ReturnType<typeof useKairos>["state"];
  /** 当前用量胶囊的展示模型（已选定 mode、附带 tooltip 等），由 KairosPage 派生后传入。 */
  usage: KairosUsageBadgeModel;
  /** 用户点击胶囊左侧 logo 切换 lifetime ↔ sinceReset。 */
  onToggleUsageMode(): void;
  /** 桥未就绪时禁用"上下文"按钮（依赖 IPC）。 */
  bridgeAvailable: boolean;
  /** Sheet 当前是否打开；用于 `aria-expanded` 绑定。 */
  contextOpen: boolean;
  onStart(): void;
  onStop(): void;
  onWakeNow(): void;
  onResetToday(): void;
  onOpenContext(): void;
}

function KairosHeader(props: KairosHeaderProps) {
  const { state, usage } = props;
  const enabled = state?.enabled === true;
  const runState = state?.state ?? "stopped";
  const sleepRemaining = useSleepCountdown(state?.sleepEndsAt);

  const statusText = getKairosStatusLabel(state, sleepRemaining);

  return (
    <header className={headerClass} data-state={runState}>
      <div className="flex min-w-0 flex-wrap items-center gap-2.5">
        <span className="text-2xl font-semibold text-[#12151c]">Kairos</span>
        <span className={cn(headerStatusClass, stateTextClass(runState))}>
          <span className={cn("h-2 w-2 rounded-full", stateDotClass(runState))} aria-hidden="true" />
          {statusText}
        </span>
        <KairosUsageBadge usage={usage} onToggleMode={props.onToggleUsageMode} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {enabled ? (
          <button type="button" className={kairosButtonClass} onClick={props.onStop}>
            <Pause size={14} aria-hidden="true" />
            暂停
          </button>
        ) : (
          <button type="button" className={cn(kairosButtonClass, kairosPrimaryButtonClass)} onClick={props.onStart}>
            <Bolt size={14} aria-hidden="true" />
            开启
          </button>
        )}
        <button
          type="button"
          className={kairosButtonClass}
          disabled={!enabled || runState === "ticking"}
          onClick={props.onWakeNow}
        >
          <Bolt size={14} aria-hidden="true" />
          唤醒
        </button>
        <button
          type="button"
          className={kairosButtonClass}
          disabled={!props.bridgeAvailable}
          aria-haspopup="dialog"
          aria-expanded={props.contextOpen}
          title={props.bridgeAvailable ? undefined : "Kairos 桥未就绪"}
          onClick={props.onOpenContext}
        >
          <FileText size={14} aria-hidden="true" />
          上下文
        </button>
        <button type="button" className={kairosButtonClass} onClick={props.onResetToday}>
          <RotateCcw size={14} aria-hidden="true" />
          重置
        </button>
      </div>
    </header>
  );
}

/**
 * Header 内的用量胶囊。
 *
 * - 主体 `<token> · <cost>`（无成本时省略后半段）。
 * - 左侧 logo 是**可点击的模式切换按钮**：
 *   - `sinceReset` 模式 → `Coins` 图标，胶囊右侧带"本阶段" mode chip；
 *   - `lifetime` 模式 → `Infinity` 图标，mode chip 为"累计"。
 *   点击切换并把选择持久化到 localStorage（由父组件管理）。
 * - hover 整个胶囊弹原生 `title` tooltip，含当前 mode 的明细 + 对面 mode 的简略数字。
 * - 单测可通过 `data-testid="kairos-usage-badge"` 选中；切换按钮 `data-testid="kairos-usage-toggle"`。
 */
function KairosUsageBadge({
  usage,
  onToggleMode,
}: {
  usage: KairosUsageBadgeModel;
  onToggleMode(): void;
}) {
  const ModeIcon = usage.mode === "lifetime" ? InfinityIcon : Coins;
  const toggleAria = `切换至「${usage.oppositeModeLabel}」（${usage.oppositeModeHint}）`;
  return (
    <span
      className={headerUsageBadgeClass}
      data-testid="kairos-usage-badge"
      data-has-data={usage.hasData ? "true" : "false"}
      data-mode={usage.mode}
      title={usage.tooltip}
      aria-label={`Token 与成本（${usage.modeLabel}）：${usage.tokensLabel}${usage.costLabel ? ` · ${usage.costLabel}` : ""}`}
    >
      <button
        type="button"
        className={headerUsageBadgeToggleClass}
        data-testid="kairos-usage-toggle"
        onClick={onToggleMode}
        aria-label={toggleAria}
        title={toggleAria}
      >
        <ModeIcon size={13} aria-hidden="true" />
      </button>
      <span data-testid="kairos-usage-tokens">{usage.tokensLabel}</span>
      {usage.costLabel ? (
        <>
          <span aria-hidden="true" className={headerUsageBadgeSeparatorClass}>
            ·
          </span>
          <span data-testid="kairos-usage-cost" className={headerUsageBadgeCostClass}>
            {usage.costLabel}
          </span>
        </>
      ) : null}
      <span aria-hidden="true" className={headerUsageBadgeModeChipClass} data-testid="kairos-usage-mode-chip">
        {usage.modeLabel}
      </span>
    </span>
  );
}

function useSleepCountdown(sleepEndsAt: string | undefined): number | null {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!sleepEndsAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [sleepEndsAt]);
  if (!sleepEndsAt) return null;
  const end = Date.parse(sleepEndsAt);
  if (!Number.isFinite(end)) return null;
  return Math.max(0, Math.round((end - now) / 1000));
}

// ─── ExecutionList ─────────────────────────────────────────────────

interface KairosExecutionListProps {
  rows: KairosEventRow[];
  totalRows: number;
  page: number;
  totalPages: number;
  selectedRowId: string | null;
  onPageChange(page: number): void;
  onSelectRow(id: string | null): void;
}

function KairosExecutionList(props: KairosExecutionListProps) {
  const rows = props.rows;
  if (rows.length === 0) {
    return (
      <section className={cn(eventsPanelClass, "items-center justify-center")} aria-label="执行列表">
        <div className="p-8 text-center text-[13px] text-[#6c7281]">
          暂无 Kairos 事件。开启后会出现巡检、工具执行、最终回复和睡眠条目。
        </div>
      </section>
    );
  }
  const pageNumbers = visiblePages(props.page, props.totalPages);
  return (
    <section className={eventsPanelClass} aria-label="执行列表">
      <table className={eventsTableClass} role="grid">
        <thead>
          <tr>
            <th className={cn(eventsThClass, "w-[92px]")}>时间</th>
            <th className={cn(eventsThClass, "w-[104px]")}>类型</th>
            <th className={cn(eventsThClass, "w-[88px]")}>状态</th>
            <th className={eventsThClass}>摘要</th>
            <th className={cn(eventsThClass, "w-[72px]")}>耗时</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className={cn(
                "cursor-pointer transition hover:bg-[#f8faff]",
                row.status === "failed" && "bg-[#fff8f5]",
                props.selectedRowId === row.id && "bg-[#eef4ff] shadow-[inset_2px_0_0_#2f6fff]",
              )}
              onClick={() => props.onSelectRow(row.id)}
              role="row"
              aria-selected={props.selectedRowId === row.id}
              tabIndex={0}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" || ev.key === " ") {
                  ev.preventDefault();
                  props.onSelectRow(row.id);
                }
              }}
            >
              <td className={cn(eventsTdClass, "w-[92px]")}>{formatKairosTime(row.startedAt)}</td>
              <td className={cn(eventsTdClass, "w-[104px]")}>
                <span className="inline-flex items-center gap-[7px] whitespace-nowrap font-medium text-[#4f5665] [&_svg]:text-[#687083]">
                  <KindIcon kind={row.kind} />
                  {kairosKindLabel(row.kind)}
                </span>
              </td>
              <td className={cn(eventsTdClass, "w-[88px]")}>
                <span className={statusBadgeClass(row.status)}>
                  {row.status}
                </span>
              </td>
              <td className={cn(eventsTdClass, "max-w-[320px] overflow-hidden text-ellipsis whitespace-nowrap")}>{row.summary || "—"}</td>
              <td className={cn(eventsTdClass, "w-[72px]")}>{row.durationMs ? formatKairosDuration(Math.round(row.durationMs / 1000)) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className={eventsFooterClass} aria-label="执行列表分页">
        <span>共 {props.totalRows} 条</span>
        <div className="inline-flex items-center gap-1.5 justify-self-center">
          <button
            type="button"
            className={pageButtonClass}
            aria-label="上一页"
            disabled={props.page <= 1}
            onClick={() => props.onPageChange(Math.max(1, props.page - 1))}
          >
            <ChevronLeft size={15} aria-hidden="true" />
          </button>
          {pageNumbers.map((pageNumber) => (
            <button
              key={pageNumber}
              type="button"
              className={cn(pageButtonClass, pageNumber === props.page && "border-brand bg-[#1f66e5] text-white")}
              aria-current={pageNumber === props.page ? "page" : undefined}
              onClick={() => props.onPageChange(pageNumber)}
            >
              {pageNumber}
            </button>
          ))}
          <button
            type="button"
            className={pageButtonClass}
            aria-label="下一页"
            disabled={props.page >= props.totalPages}
            onClick={() => props.onPageChange(Math.min(props.totalPages, props.page + 1))}
          >
            <ChevronRight size={15} aria-hidden="true" />
          </button>
        </div>
        <button type="button" className="inline-flex h-7 items-center justify-self-end gap-[5px] bg-transparent text-xs text-[#687083]" aria-label="每页 10 条">
          10 条/页
          <ChevronDown size={13} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}

function KindIcon({ kind }: { kind: KairosEventRow["kind"] }) {
  const size = 14;
  switch (kind) {
    case "reply":
      return <MessageSquare size={size} aria-hidden="true" />;
    case "tool":
      return <Wrench size={size} aria-hidden="true" />;
    case "sleep":
      return <Moon size={size} aria-hidden="true" />;
    case "error":
      return <AlertTriangle size={size} aria-hidden="true" />;
    case "interrupt":
    case "tick":
      return <Bolt size={size} aria-hidden="true" />;
  }
}

// ─── Stats ─────────────────────────────────────────────────────────

interface KairosStatsProps {
  state: KairosRuntimeState | null;
  rows: KairosEventRow[];
}

function KairosStats(props: KairosStatsProps) {
  const sleepRemaining = useSleepCountdown(
    props.state?.state === "sleeping" ? props.state.sleepEndsAt : undefined,
  );
  const stats = buildKairosStats(props.state, props.rows, sleepRemaining);
  return (
    <section className={statsClass} aria-label="统计">
      {stats.map((item, index) => (
        <div
          key={item.label}
          className={cn(
            "border-r border-[#eef1f6] px-4 py-3.5 last:border-r-0",
            index === 1 && "max-[760px]:border-r-0",
            index < 2 && "max-[760px]:border-b max-[760px]:border-[#eef1f6]",
          )}
        >
          <span className="mb-2 block text-xs text-[#6c7281]">{item.label}</span>
          <strong className="block text-xl font-semibold tabular-nums text-[#171a22]">{item.value}</strong>
        </div>
      ))}
    </section>
  );
}

// ─── DetailPanel ───────────────────────────────────────────────────

interface KairosDetailPanelProps {
  tab: DetailTab;
  onTabChange(tab: DetailTab): void;
  detail: DetailModel;
  selectedRow: KairosEventRow | null;
}

function KairosDetailPanel(props: KairosDetailPanelProps) {
  const { tab, detail, selectedRow } = props;
  return (
    <aside className={detailPanelClass} role="complementary" aria-label="事件详情">
      <div className={detailTabsClass} role="tablist" aria-label="详情类型">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "reply"}
          className={cn(detailTabClass, tab === "reply" && detailActiveTabClass)}
          onClick={() => props.onTabChange("reply")}
        >
          最终回复
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "tool"}
          className={cn(detailTabClass, tab === "tool" && detailActiveTabClass)}
          onClick={() => props.onTabChange("tool")}
        >
          工具结果
        </button>
      </div>
      <div className={detailToplineClass}>
        <h2 className="m-0 text-base font-semibold text-[#171a22]">
          {tab === "reply" ? "最终回复" : "工具结果"}
        </h2>
        <div className={detailMetaClass}>
          <span>{selectedRow ? formatKairosTime(selectedRow.startedAt) : "最近一次回复"}</span>
          {selectedRow ? (
            <span className={statusBadgeClass(selectedRow.status)}>
              {selectedRow.status}
            </span>
          ) : null}
        </div>
      </div>

      {tab === "reply" ? (
        <div className={detailReplyClass}>
          {detail.replyText ? detail.replyText : <span className={detailPlaceholderClass}>暂无最终回复</span>}
        </div>
      ) : (
        <ToolResultView tool={detail.tool} />
      )}
    </aside>
  );
}

function ToolResultView({ tool }: { tool: KairosToolDetail | null }) {
  if (!tool) {
    return <div className={detailPlaceholderClass}>选择工具执行后查看结果</div>;
  }
  return (
    <div className={toolResultClass}>
      <div className="flex items-center justify-between gap-3 border-b border-[#eef1f6] pb-3 font-semibold">
        <span>{tool.name}</span>
        <span className={statusBadgeClass(tool.ok ? "success" : "failed")}>
          {tool.ok ? "success" : "failed"}
        </span>
      </div>
      {tool.input ? (
        <div className="grid gap-2">
          <span className="text-xs text-[#6c7281]">输入</span>
          <code className={toolResultSectionTextClass}>{tool.input}</code>
        </div>
      ) : null}
      <div className="grid gap-2">
        <span className="text-xs text-[#6c7281]">结果</span>
        <p className={toolResultSectionTextClass}>{tool.output || "工具执行完成，暂无输出摘要。"}</p>
      </div>
    </div>
  );
}

// ─── detail model ──────────────────────────────────────────────────

type DetailModel = {
  replyText: string;
  tool: KairosToolDetail | null;
};

function visiblePages(current: number, total: number): number[] {
  if (total <= 5) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }
  const start = Math.min(Math.max(1, current - 2), total - 4);
  return Array.from({ length: 5 }, (_, index) => start + index);
}

function buildTraceTicks(rows: KairosEventRow[]): Array<{ index: number; label: string }> {
  if (rows.length === 0) return [];
  if (rows.length === 1) {
    return [{ index: 0, label: formatKairosTimeShort(rows[0].startedAt) }];
  }
  const tickCount = Math.min(6, rows.length);
  return Array.from({ length: tickCount }, (_, index) => {
    const rowIndex = Math.round((index * (rows.length - 1)) / (tickCount - 1));
    return {
      index: rowIndex,
      label: formatKairosTimeShort(rows[rowIndex].startedAt),
    };
  }).filter((tick, index, all) => index === 0 || tick.label !== all[index - 1].label);
}

function buildTraceSegments(rows: KairosEventRow[]): Array<{ widthPx: number }> {
  return rows.map((row) => {
    const durationMs = row.durationMs ?? 0;
    if (Number.isFinite(durationMs) && durationMs > 0) {
      const durationSeconds = Math.max(1, Math.round(durationMs / 1000));
      return {
        widthPx: Math.min(
          TRACE_SEGMENT_MAX_PX,
          TRACE_SEGMENT_BASE_PX + durationSeconds * TRACE_SEGMENT_PX_PER_SECOND,
        ),
      };
    }
    return {
      widthPx: TRACE_SEGMENT_BASE_PX,
    };
  });
}

function traceTone(row: KairosEventRow): "reply" | "sleep" | "error" | "other" {
  if (row.kind === "reply") return "reply";
  if (row.kind === "sleep") return "sleep";
  if (row.kind === "error" || row.status === "failed") return "error";
  return "other";
}

function stateTextClass(state: KairosRuntimeState["state"]): string {
  if (state === "cooldown" || state === "interrupted") return "text-[#b3433c]";
  return "text-[#16805b]";
}

function stateDotClass(state: KairosRuntimeState["state"]): string {
  if (state === "cooldown" || state === "interrupted") return "bg-[#e0524d] shadow-[0_0_0_3px_rgba(224,82,77,0.12)]";
  if (state === "stopped") return "bg-[#9aa3b2] shadow-[0_0_0_3px_rgba(154,163,178,0.13)]";
  return "bg-[#20b779] shadow-[0_0_0_3px_rgba(32,183,121,0.12)]";
}

function statusBadgeClass(status: KairosEventRow["status"]): string {
  return cn(
    "inline-flex h-[22px] items-center rounded-full px-[9px] text-xs font-medium lowercase",
    statusToneClass(status),
  );
}

function statusToneClass(status: KairosEventRow["status"]): string {
  switch (status) {
    case "success":
      return "bg-[#eaf8f1] text-[#17744f]";
    case "running":
      return "bg-brand-soft text-[#2f62c7]";
    case "failed":
      return "bg-[#fff0ef] text-[#bc3b35]";
    case "interrupted":
      return "bg-[#fff6e6] text-[#9b6514]";
  }
}
