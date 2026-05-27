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
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bolt,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Moon,
  Pause,
  RotateCcw,
  Wrench,
} from "lucide-react";
import type { KairosEventRow, KairosRuntimeState, SessionEvent } from "@actspace/shared";
import { useKairos } from "../state/useKairos";

type DetailTab = "reply" | "tool";
const EXECUTION_PAGE_SIZE = 10;

export function KairosPage() {
  const k = useKairos();
  const [detailTab, setDetailTab] = useState<DetailTab>("reply");
  const [page, setPage] = useState(1);

  const displayRows = useMemo(() => k.rows.slice().reverse(), [k.rows]);
  const totalPages = Math.max(1, Math.ceil(displayRows.length / EXECUTION_PAGE_SIZE));
  const pagedRows = useMemo(() => {
    const start = (page - 1) * EXECUTION_PAGE_SIZE;
    return displayRows.slice(start, start + EXECUTION_PAGE_SIZE);
  }, [displayRows, page]);
  const selectedRow = useMemo(
    () => k.rows.find((row) => row.id === k.selectedRowId) ?? null,
    [k.rows, k.selectedRowId],
  );
  const latestReplyEvents = useMemo(() => findLatestReplyEvents(k.rows, k.events), [k.rows, k.events]);
  const selectedReplyText = selectedRow?.kind === "reply" ? findReplyText(k.selectedEvents) : "";
  const latestReplyText = findReplyText(latestReplyEvents);
  const selectedTool = selectedRow?.kind === "tool" ? findToolDetail(k.selectedEvents) : null;
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
      <div className="kairos-page kairos-page--unavailable">
        <div className="kairos-page__card">
          <h2 className="kairos-page__heading">Kairos 桥未就绪</h2>
          <p className="kairos-page__hint">
            当前运行环境未暴露 <code>window.kairos</code>。请在 Electron 环境下打开，或确认 preload 已加载。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="kairos-page" role="region" aria-label="Kairos 自治模式">
      <KairosHeader
        state={k.state}
        onStart={() => k.control({ type: "start" }).catch(() => {})}
        onStop={() => k.control({ type: "stop" }).catch(() => {})}
        onWakeNow={() => k.control({ type: "wake_now" }).catch(() => {})}
        onResetToday={() => k.control({ type: "reset_today" }).catch(() => {})}
      />

      <KairosRuntimeTrace
        rows={displayRows}
        selectedRowId={k.selectedRowId}
        onSelectRow={selectRow}
      />

      <div className="kairos-page__main">
        <KairosExecutionList
          rows={pagedRows}
          totalRows={displayRows.length}
          page={page}
          totalPages={totalPages}
          selectedRowId={k.selectedRowId}
          onPageChange={setPage}
          onSelectRow={selectRow}
        />
        <div className="kairos-side">
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
        <div className="kairos-page__error" role="alert">
          {k.error}
        </div>
      ) : null}
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
  const rows = props.rows.slice(0, 36).reverse();
  const ticks = buildTraceTicks(rows);
  return (
    <section className="kairos-trace" aria-label="运行轨迹（近 60 分钟）">
      <div className="kairos-trace__head">
        <div>
          <h2 className="kairos-trace__title">运行轨迹</h2>
          <span className="kairos-trace__subtle">近 60 分钟</span>
        </div>
        <div className="kairos-trace__legend" aria-label="运行轨迹图例">
          <span><i data-tone="reply" />回复</span>
          <span><i data-tone="sleep" />睡眠</span>
          <span><i data-tone="error" />异常</span>
          <span><i data-tone="other" />其他</span>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="kairos-trace__empty">等待 Kairos 事件</div>
      ) : (
        <div className="kairos-trace__blocks" role="list">
          {rows.map((row) => (
            <button
              key={row.id}
              type="button"
              role="listitem"
              data-tone={traceTone(row)}
              className={[
                "kairos-trace__block",
                `kairos-trace__block--${traceTone(row)}`,
                props.selectedRowId === row.id ? "is-selected" : "",
              ].filter(Boolean).join(" ")}
              title={`${formatTime(row.startedAt)} · ${kindLabel(row.kind)} · ${row.summary}`}
              aria-label={`${formatTime(row.startedAt)} ${kindLabel(row.kind)} ${row.summary}`}
              onClick={() => props.onSelectRow(row.id)}
            />
          ))}
        </div>
      )}
      {ticks.length > 0 ? (
        <div className="kairos-trace__axis" aria-hidden="true">
          {ticks.map((tick) => (
            <span key={`${tick.index}-${tick.label}`}>{tick.label}</span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

// ─── Header ─────────────────────────────────────────────────────────

interface KairosHeaderProps {
  state: ReturnType<typeof useKairos>["state"];
  onStart(): void;
  onStop(): void;
  onWakeNow(): void;
  onResetToday(): void;
}

function KairosHeader(props: KairosHeaderProps) {
  const { state } = props;
  const enabled = state?.enabled === true;
  const runState = state?.state ?? "stopped";
  const sleepRemaining = useSleepCountdown(state?.sleepEndsAt);

  let statusText: string;
  if (!state) {
    statusText = "Loading";
  } else if (runState === "sleeping" && sleepRemaining !== null) {
    statusText = `Sleeping · ${formatDuration(sleepRemaining)}`;
  } else {
    statusText = stateLabel(runState);
  }

  return (
    <header className="kairos-header" data-state={runState}>
      <div className="kairos-header__identity">
        <span className="kairos-header__brand">Kairos</span>
        <span className="kairos-header__status">
          <span className="kairos-header__dot" aria-hidden="true" />
          {statusText}
        </span>
      </div>
      <div className="kairos-header__actions">
        {enabled ? (
          <button type="button" className="kairos-btn" onClick={props.onStop}>
            <Pause size={14} aria-hidden="true" />
            暂停
          </button>
        ) : (
          <button type="button" className="kairos-btn kairos-btn--primary" onClick={props.onStart}>
            <Bolt size={14} aria-hidden="true" />
            开启
          </button>
        )}
        <button
          type="button"
          className="kairos-btn"
          disabled={!enabled || runState === "ticking"}
          onClick={props.onWakeNow}
        >
          <Bolt size={14} aria-hidden="true" />
          立即唤醒
        </button>
        <button type="button" className="kairos-btn" onClick={props.onResetToday}>
          <RotateCcw size={14} aria-hidden="true" />
          重置今日
        </button>
      </div>
    </header>
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
      <section className="kairos-events kairos-events--empty" aria-label="执行列表">
        <div className="kairos-events__empty">
          暂无 Kairos 事件。开启后会出现巡检、工具执行、最终回复和睡眠条目。
        </div>
      </section>
    );
  }
  const pageNumbers = visiblePages(props.page, props.totalPages);
  return (
    <section className="kairos-events" aria-label="执行列表">
      <table className="kairos-events__table" role="grid">
        <thead>
          <tr>
            <th>时间</th>
            <th>类型</th>
            <th>状态</th>
            <th>摘要</th>
            <th>耗时</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className={[
                "kairos-events__row",
                `kairos-events__row--${row.kind}`,
                `kairos-events__row--${row.status}`,
                props.selectedRowId === row.id ? "kairos-events__row--selected" : "",
              ]
                .filter(Boolean)
                .join(" ")}
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
              <td>{formatTime(row.startedAt)}</td>
              <td>
                <span className="kairos-events__kind">
                  <KindIcon kind={row.kind} />
                  {kindLabel(row.kind)}
                </span>
              </td>
              <td>
                <span className={`kairos-status kairos-status--${row.status}`}>
                  {row.status}
                </span>
              </td>
              <td className="kairos-events__summary">{row.summary || "—"}</td>
              <td>{row.durationMs ? formatDuration(Math.round(row.durationMs / 1000)) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="kairos-events__footer" aria-label="执行列表分页">
        <span>共 {props.totalRows} 条</span>
        <div className="kairos-events__pager">
          <button
            type="button"
            className="kairos-events__page-btn kairos-events__page-btn--icon"
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
              className={[
                "kairos-events__page-btn",
                pageNumber === props.page ? "is-active" : "",
              ].filter(Boolean).join(" ")}
              aria-current={pageNumber === props.page ? "page" : undefined}
              onClick={() => props.onPageChange(pageNumber)}
            >
              {pageNumber}
            </button>
          ))}
          <button
            type="button"
            className="kairos-events__page-btn kairos-events__page-btn--icon"
            aria-label="下一页"
            disabled={props.page >= props.totalPages}
            onClick={() => props.onPageChange(Math.min(props.totalPages, props.page + 1))}
          >
            <ChevronRight size={15} aria-hidden="true" />
          </button>
        </div>
        <button type="button" className="kairos-events__page-size" aria-label="每页 10 条">
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
  const stats = buildStats(props.state, props.rows, sleepRemaining);
  return (
    <section className="kairos-stats" aria-label="统计">
      {stats.map((item) => (
        <div key={item.label} className="kairos-stats__item">
          <span>{item.label}</span>
          <strong>{item.value}</strong>
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
    <aside className="kairos-detail" role="complementary" aria-label="事件详情">
      <div className="kairos-detail__tabs" role="tablist" aria-label="详情类型">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "reply"}
          className={tab === "reply" ? "is-active" : ""}
          onClick={() => props.onTabChange("reply")}
        >
          最终回复
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "tool"}
          className={tab === "tool" ? "is-active" : ""}
          onClick={() => props.onTabChange("tool")}
        >
          工具结果
        </button>
      </div>
      <div className="kairos-detail__topline">
        <h2 className="kairos-detail__title">
          {tab === "reply" ? "最终回复" : "工具结果"}
        </h2>
        <div className="kairos-detail__meta">
          <span>{selectedRow ? formatTime(selectedRow.startedAt) : "最近一次回复"}</span>
          {selectedRow ? (
            <span className={`kairos-status kairos-status--${selectedRow.status}`}>
              {selectedRow.status}
            </span>
          ) : null}
        </div>
      </div>

      {tab === "reply" ? (
        <div className="kairos-detail__reply">
          {detail.replyText ? detail.replyText : <span className="kairos-detail__placeholder">暂无最终回复</span>}
        </div>
      ) : (
        <ToolResultView tool={detail.tool} />
      )}
    </aside>
  );
}

function ToolResultView({ tool }: { tool: ToolDetail | null }) {
  if (!tool) {
    return <div className="kairos-detail__placeholder">选择工具执行后查看结果</div>;
  }
  return (
    <div className="kairos-tool-result">
      <div className="kairos-tool-result__head">
        <span>{tool.name}</span>
        <span className={`kairos-status kairos-status--${tool.ok ? "success" : "failed"}`}>
          {tool.ok ? "success" : "failed"}
        </span>
      </div>
      {tool.input ? (
        <div className="kairos-tool-result__section">
          <span>输入</span>
          <code>{tool.input}</code>
        </div>
      ) : null}
      <div className="kairos-tool-result__section">
        <span>结果</span>
        <p>{tool.output || "工具执行完成，暂无输出摘要。"}</p>
      </div>
    </div>
  );
}

// ─── detail model ──────────────────────────────────────────────────

type DetailModel = {
  replyText: string;
  tool: ToolDetail | null;
};

type ToolDetail = {
  name: string;
  input: string;
  output: string;
  ok: boolean;
};

function findLatestReplyEvents(rows: KairosEventRow[], events: SessionEvent[]): SessionEvent[] {
  const latestReply = rows.filter((row) => row.kind === "reply").at(-1);
  if (!latestReply) return [];
  const ids = new Set(latestReply.relatedEventIds);
  return events.filter((event) => ids.has(event.id));
}

function findReplyText(events: SessionEvent[]): string {
  const reply = events
    .filter((event) => event.type === "assistant_message" || event.type === "assistant_reply")
    .at(-1);
  const payload = asRecord(reply?.payload);
  const content = payload?.content;
  return typeof content === "string" ? content : "";
}

function findToolDetail(events: SessionEvent[]): ToolDetail | null {
  const call = events.find((event) => event.type === "tool_call");
  const result = events.find((event) => event.type === "tool_result");
  if (!call && !result) return null;
  const callPayload = asRecord(call?.payload);
  const resultPayload = asRecord(result?.payload);
  const name = stringField(resultPayload, "toolName")
    || stringField(callPayload, "name")
    || "tool";
  const input = stringifyCompact(callPayload?.arguments);
  const error = asRecord(resultPayload?.error);
  const output = stringField(resultPayload, "summary")
    || stringField(error, "message")
    || stringifyCompact(resultPayload?.output)
    || stringifyCompact(resultPayload?.result);
  return {
    name,
    input,
    output,
    ok: resultPayload?.ok !== false,
  };
}

function buildStats(
  state: KairosRuntimeState | null,
  rows: KairosEventRow[],
  sleepRemaining: number | null,
): Array<{ label: string; value: string }> {
  const toolCount = rows.filter((row) => row.kind === "tool").length;
  const tickCount = state?.todayTickCount ?? rows.filter((row) => row.kind === "tick").length;
  const errorCount = rows.filter((row) => row.kind === "error" || row.status === "failed").length;
  return [
    { label: "工具调用", value: String(toolCount) },
    { label: "巡检", value: String(tickCount) },
    { label: "异常", value: String(errorCount) },
    { label: "睡眠剩余", value: sleepRemaining === null ? "--" : formatDuration(sleepRemaining) },
  ];
}

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
    return [{ index: 0, label: formatTimeShort(rows[0].startedAt) }];
  }
  const tickCount = Math.min(6, rows.length);
  return Array.from({ length: tickCount }, (_, index) => {
    const rowIndex = Math.round((index * (rows.length - 1)) / (tickCount - 1));
    return {
      index: rowIndex,
      label: formatTimeShort(rows[rowIndex].startedAt),
    };
  }).filter((tick, index, all) => index === 0 || tick.label !== all[index - 1].label);
}

function traceTone(row: KairosEventRow): "reply" | "sleep" | "error" | "other" {
  if (row.kind === "reply") return "reply";
  if (row.kind === "sleep") return "sleep";
  if (row.kind === "error" || row.status === "failed") return "error";
  return "other";
}

function kindLabel(kind: KairosEventRow["kind"]): string {
  switch (kind) {
    case "reply":
      return "最终回复";
    case "tool":
      return "工具执行";
    case "tick":
      return "巡检";
    case "sleep":
      return "睡眠";
    case "interrupt":
      return "中断";
    case "error":
      return "异常";
  }
}

function stateLabel(state: KairosRuntimeState["state"]): string {
  switch (state) {
    case "idle":
      return "Idle";
    case "ticking":
      return "Ticking";
    case "sleeping":
      return "Sleeping";
    case "interrupted":
      return "Interrupted";
    case "cooldown":
      return "Cooldown";
    case "stopped":
      return "Stopped";
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function stringField(record: Record<string, unknown> | null, key: string): string {
  const value = record?.[key];
  return typeof value === "string" ? value : "";
}

function stringifyCompact(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

// ─── utils ──────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function formatTimeShort(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) return `${h}h${pad2(m)}m`;
  if (m > 0) return `${m}m${pad2(s)}s`;
  return `${s}s`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
