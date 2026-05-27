import { useEffect, useMemo, useState } from "react";
import { Bolt, Pause, RotateCcw } from "lucide-react";
import type { KairosEventRow, KairosRuntimeState } from "@actspace/shared";
import { useKairos } from "../../state/useKairos";
import {
  formatKairosDuration,
  formatKairosTime,
  getKairosDisplayRows,
  getKairosStatusLabel,
  getLatestKairosReply,
  kairosKindLabel,
} from "../../state/kairosSelectors";

const COMPACT_ROW_LIMIT = 18;
const compactRootClass =
  "grid min-h-0 flex-1 grid-rows-[auto_minmax(112px,auto)_minmax(0,1fr)] overflow-hidden bg-[#f8fafc] text-[#1a1d24]";
const compactUnavailableClass = "flex items-center justify-center p-[18px]";
const compactHeaderClass = "grid gap-2.5 border-b border-[#e4e9f1] bg-surface px-3.5 pb-3 pt-3.5";
const compactIdentityClass = "flex min-w-0 items-center justify-between gap-2.5";
const compactStatusClass =
  "inline-flex h-[26px] min-w-0 max-w-[190px] items-center gap-1.5 overflow-hidden text-ellipsis whitespace-nowrap rounded-full border border-[#dfe8f3] bg-[#f8fbff] px-[9px] text-xs tabular-nums";
const compactActionsClass = "grid grid-cols-3 gap-1.5";
const compactButtonClass =
  "inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-[7px] border border-[#d7dce6] bg-surface px-2 text-xs text-[#2c303a] transition hover:border-[#b9c0cd] hover:bg-[#f5f7fb] disabled:cursor-not-allowed disabled:opacity-50 max-[980px]:[&>span]:hidden";
const compactPrimaryButtonClass = "border-brand bg-brand text-white hover:border-brand-strong hover:bg-brand-strong";
const compactErrorClass =
  "rounded-[7px] border border-[#f3c4b1] bg-[#fff5f1] px-[9px] py-[7px] text-xs leading-[1.45] text-[#b04014]";
const compactPanelClass = "grid min-w-0 min-h-0 grid-rows-[auto_minmax(0,1fr)] bg-surface";
const compactReplyClass = `${compactPanelClass} max-h-[220px] border-b border-[#e4e9f1]`;
const compactSectionHeadClass = "flex min-w-0 items-center justify-between gap-2.5 px-3.5 pb-2 pt-3";
const compactSectionMetaClass =
  "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs tabular-nums text-[#7a8292]";
const compactReplyBodyClass =
  "min-h-[72px] overflow-auto whitespace-pre-wrap break-words px-3.5 pb-3.5 text-[13px] leading-[1.62] text-[#20242d]";
const compactEmptyClass = "grid max-w-[250px] gap-1.5 text-center text-xs leading-[1.5] text-[#6c7281]";
const compactInlineEmptyClass = `${compactEmptyClass} place-self-center px-4 py-[22px]`;
const compactRowsClass = "flex min-h-0 flex-col overflow-auto px-2.5 pb-3";
const compactRowClass =
  "grid min-w-0 gap-[5px] border-b border-[#eef1f6] py-2.5 pl-[9px] pr-1";
const compactRowMetaClass =
  "grid min-w-0 grid-cols-[auto_minmax(52px,auto)_auto_minmax(32px,auto)] items-center gap-[7px] text-[11px] tabular-nums text-[#687083]";
const compactRowMetaItemClass = "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap";
const compactRowSummaryClass =
  "m-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs leading-[1.45] text-[#303541]";

function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function KairosRightPanelView() {
  const k = useKairos();
  const sleepRemaining = useSleepCountdown(k.state?.sleepEndsAt);
  const latestReply = useMemo(() => getLatestKairosReply(k.events, k.rows), [k.events, k.rows]);
  const rows = useMemo(
    () => getKairosDisplayRows(k.rows, { limit: COMPACT_ROW_LIMIT }),
    [k.rows],
  );
  const enabled = k.state?.enabled === true;
  const runState = k.state?.state ?? "stopped";
  const statusText = getKairosStatusLabel(k.state, sleepRemaining);

  if (!k.bridgeAvailable) {
    return (
      <section className={cn(compactRootClass, compactUnavailableClass)} aria-label="Kairos 右侧紧凑视图">
        <div className={compactEmptyClass}>
          <strong className="text-[13px] text-[#171a22]">Kairos 桥未就绪</strong>
          <span>请在 Electron 环境下打开，或确认 preload 已加载。</span>
        </div>
      </section>
    );
  }

  return (
    <section className={compactRootClass} aria-label="Kairos 右侧紧凑视图">
      <header className={compactHeaderClass} data-state={runState}>
        <div className={compactIdentityClass}>
          <span className="min-w-0 text-lg font-semibold text-[#151922]">Kairos</span>
          <span className={cn(compactStatusClass, stateTextClass(runState))}>
            <span className={cn("h-[7px] w-[7px] shrink-0 rounded-full", stateDotClass(runState))} aria-hidden="true" />
            {statusText}
          </span>
        </div>
        <div className={compactActionsClass} aria-label="Kairos 控制">
          {enabled ? (
            <button
              type="button"
              className={compactButtonClass}
              title="暂停 Kairos"
              aria-label="暂停 Kairos"
              onClick={() => k.control({ type: "stop" }).catch(() => {})}
            >
              <Pause size={14} aria-hidden="true" />
              <span>暂停</span>
            </button>
          ) : (
            <button
              type="button"
              className={cn(compactButtonClass, compactPrimaryButtonClass)}
              title="开启 Kairos"
              aria-label="开启 Kairos"
              onClick={() => k.control({ type: "start" }).catch(() => {})}
            >
              <Bolt size={14} aria-hidden="true" />
              <span>开启</span>
            </button>
          )}
          <button
            type="button"
            className={compactButtonClass}
            title="立即唤醒 Kairos"
            aria-label="立即唤醒 Kairos"
            disabled={!enabled || runState === "ticking"}
            onClick={() => k.control({ type: "wake_now" }).catch(() => {})}
          >
            <Bolt size={14} aria-hidden="true" />
            <span>唤醒</span>
          </button>
          <button
            type="button"
            className={compactButtonClass}
            title="重置今日 Kairos 统计"
            aria-label="重置今日 Kairos 统计"
            onClick={() => k.control({ type: "reset_today" }).catch(() => {})}
          >
            <RotateCcw size={14} aria-hidden="true" />
            <span>重置</span>
          </button>
        </div>
        {k.error ? (
          <div className={compactErrorClass} role="alert">
            {k.error}
          </div>
        ) : null}
      </header>

      <section className={compactReplyClass} aria-label="最终回复">
        <div className={compactSectionHeadClass}>
          <h2 className="m-0 text-[13px] font-semibold text-[#171a22]">最终回复</h2>
          <span className={compactSectionMetaClass}>{latestReply.timestamp ? formatKairosTime(latestReply.timestamp) : "最近一次回复"}</span>
        </div>
        <div className={compactReplyBodyClass}>
          {latestReply.text ? latestReply.text : <span className="text-[#8a90a0]">暂无最终回复</span>}
        </div>
      </section>

      <section className={compactPanelClass} aria-label="轨迹列表">
        <div className={compactSectionHeadClass}>
          <h2 className="m-0 text-[13px] font-semibold text-[#171a22]">轨迹列表</h2>
          <span className={compactSectionMetaClass}>{rows.length > 0 ? `最近 ${rows.length} 条` : "等待事件"}</span>
        </div>
        {rows.length === 0 ? (
          <div className={compactInlineEmptyClass}>
            开启后会显示巡检、工具执行、回复和睡眠轨迹。
          </div>
        ) : (
          <div className={compactRowsClass} role="list">
            {rows.map((row) => (
              <KairosCompactRow key={row.id} row={row} />
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

function KairosCompactRow({ row }: { row: KairosEventRow }) {
  return (
    <div
      className={cn(compactRowClass, compactRowToneClass(row))}
      role="listitem"
    >
      <div className={compactRowMetaClass}>
        <time className={compactRowMetaItemClass} dateTime={row.startedAt}>{formatKairosTime(row.startedAt)}</time>
        <span className={compactRowMetaItemClass}>{kairosKindLabel(row.kind)}</span>
        <span className={statusBadgeClass(row.status, "compact")}>{row.status}</span>
        <span className={compactRowMetaItemClass}>{row.durationMs ? formatKairosDuration(Math.round(row.durationMs / 1000)) : "--"}</span>
      </div>
      <p className={compactRowSummaryClass}>{row.summary || "暂无摘要"}</p>
    </div>
  );
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

function statusBadgeClass(status: KairosEventRow["status"], size: "default" | "compact" = "default"): string {
  return cn(
    "inline-flex items-center rounded-full font-medium lowercase",
    size === "compact" ? "h-5 px-[7px] text-[11px]" : "h-[22px] px-[9px] text-xs",
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

function compactRowToneClass(row: KairosEventRow): string {
  if (row.kind === "reply") return "shadow-[inset_2px_0_0_#4a8af7]";
  if (row.kind === "sleep") return "shadow-[inset_2px_0_0_#f0ad3d]";
  if (row.kind === "error" || row.status === "failed") return "shadow-[inset_2px_0_0_#ee5a55]";
  return "shadow-[inset_2px_0_0_#d7dce5]";
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
