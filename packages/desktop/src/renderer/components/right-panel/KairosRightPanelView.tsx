import { useEffect, useMemo, useState } from "react";
import { Bolt, Pause, RotateCcw } from "lucide-react";
import type { KairosEventRow, KairosRuntimeState } from "@actspace/shared";
import { useKairos } from "../../state/useKairos";
import {
  KairosNotificationActions,
  KairosNotificationList,
  KairosNotificationTabBadge,
  useKairosNotifications,
} from "../kairos/KairosNotifications";
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
  "grid min-h-0 flex-1 grid-rows-[auto_minmax(112px,auto)_minmax(0,1fr)] overflow-hidden bg-app-bg text-text-main";
const compactUnavailableClass = "flex items-center justify-center p-[18px]";
const compactHeaderClass = "grid gap-2.5 border-b border-line bg-surface px-3.5 pb-3 pt-3.5";
const compactIdentityClass = "flex min-w-0 items-center justify-between gap-2.5";
const compactStatusClass =
  "inline-flex h-[26px] min-w-0 max-w-[190px] items-center gap-1.5 overflow-hidden text-ellipsis whitespace-nowrap rounded-full border border-line bg-surface-subtle px-[9px] text-xs tabular-nums";
const compactActionsClass = "grid grid-cols-3 gap-1.5";
const compactButtonClass =
  "inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-[7px] border border-line bg-surface px-2 text-xs text-text-main transition hover:border-line-strong hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50 max-[980px]:[&>span]:hidden";
// 主按钮是独立完整类，不叠加在 compactButtonClass 上——bg-surface/bg-brand、
// text-text-main/text-white 同属性类的胜负取决于生成 CSS 的顺序，叠加曾导致
// 「开启」按钮白底白字不可见（与分页激活按钮同一个坑）。
const compactPrimaryButtonClass =
  "inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-[7px] border border-brand bg-brand px-2 text-xs font-medium text-white transition hover:border-brand-strong hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-50 max-[980px]:[&>span]:hidden";
const compactErrorClass =
  "rounded-[7px] border border-on-danger/30 bg-danger-soft px-[9px] py-[7px] text-xs leading-[1.45] text-on-danger";
const compactPanelClass = "grid min-w-0 min-h-0 grid-rows-[auto_minmax(0,1fr)] bg-surface";
const compactReplyClass = `${compactPanelClass} max-h-[220px] border-b border-line`;
// 通知 tab 下放宽上限：展开的 Markdown 正文需要更多可视空间，轨迹列表往下挤。
const compactNotificationClass = `${compactPanelClass} max-h-[min(480px,60vh)] border-b border-line`;
const compactSectionHeadClass = "flex min-w-0 items-center justify-between gap-2.5 px-3.5 pb-2 pt-3";
const compactSectionMetaClass =
  "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs tabular-nums text-text-faint";
const compactReplyBodyClass =
  "min-h-[72px] overflow-auto whitespace-pre-wrap break-words px-3.5 pb-3.5 text-[13px] leading-[1.62] text-text-main";
const compactEmptyClass = "grid max-w-[250px] gap-1.5 text-center text-xs leading-[1.5] text-text-faint";
const compactInlineEmptyClass = `${compactEmptyClass} place-self-center px-4 py-[22px]`;
const compactRowsClass = "flex min-h-0 flex-col overflow-auto px-2.5 pb-3";
const compactRowClass =
  "grid min-w-0 gap-[5px] border-b border-line py-2.5 pl-[9px] pr-1";
const compactRowMetaClass =
  "grid min-w-0 grid-cols-[auto_minmax(52px,auto)_auto_minmax(32px,auto)] items-center gap-[7px] text-[11px] tabular-nums text-text-faint";
const compactRowMetaItemClass = "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap";
const compactRowSummaryClass =
  "m-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs leading-[1.45] text-text-main";
// 与 KairosPage 详情面板同款 Cursor 风格 segmented control（浅灰槽 + 激活项白底微浮起）。
const compactReplyTabClass =
  "inline-flex h-6 items-center gap-1 rounded-[5px] border-0 bg-transparent px-2 text-xs text-text-muted transition hover:text-text-main";
const compactReplyTabActiveClass =
  "bg-surface font-medium text-text-main shadow-[0_1px_2px_rgba(0,0,0,0.07),inset_0_0_0_1px_var(--act-color-border)]";

function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function KairosRightPanelView() {
  const k = useKairos();
  const notifications = useKairosNotifications();
  const [replyTab, setReplyTab] = useState<"reply" | "notification">("reply");
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
          <strong className="text-[13px] text-text-main">Kairos 桥未就绪</strong>
          <span>请在 Electron 环境下打开，或确认 preload 已加载。</span>
        </div>
      </section>
    );
  }

  return (
    <section className={compactRootClass} aria-label="Kairos 右侧紧凑视图">
      <header className={compactHeaderClass} data-state={runState}>
        <div className={compactIdentityClass}>
          <span className="min-w-0 text-lg font-semibold text-text-main">Kairos</span>
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
              className={compactPrimaryButtonClass}
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
            title="唤醒 Kairos"
            aria-label="唤醒 Kairos"
            disabled={!enabled || runState === "ticking"}
            onClick={() => k.control({ type: "wake_now" }).catch(() => {})}
          >
            <Bolt size={14} aria-hidden="true" />
            <span>唤醒</span>
          </button>
          <button
            type="button"
            className={compactButtonClass}
            title="重置 Kairos 统计"
            aria-label="重置 Kairos 统计"
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

      <section
        className={replyTab === "notification" ? compactNotificationClass : compactReplyClass}
        aria-label="最终回复与通知"
      >
        <div className={compactSectionHeadClass}>
          <div
            className="flex items-center gap-0.5 rounded-[7px] bg-surface-subtle p-0.5"
            role="tablist"
            aria-label="回复与通知切换"
          >
            <button
              type="button"
              role="tab"
              aria-selected={replyTab === "reply"}
              className={cn(compactReplyTabClass, replyTab === "reply" && compactReplyTabActiveClass)}
              onClick={() => setReplyTab("reply")}
            >
              最终回复
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={replyTab === "notification"}
              className={cn(compactReplyTabClass, replyTab === "notification" && compactReplyTabActiveClass)}
              data-testid="kairos-notification-tab"
              onClick={() => setReplyTab("notification")}
            >
              通知
              <KairosNotificationTabBadge count={notifications.unreadCount} />
            </button>
          </div>
          {replyTab === "reply" ? (
            <span className={compactSectionMetaClass}>{latestReply.timestamp ? formatKairosTime(latestReply.timestamp) : "最近一次回复"}</span>
          ) : (
            <KairosNotificationActions store={notifications} />
          )}
        </div>
        {replyTab === "reply" ? (
          <div className={compactReplyBodyClass}>
            {latestReply.text ? latestReply.text : <span className="text-text-faint">暂无最终回复</span>}
          </div>
        ) : (
          <div className="min-h-[72px] overflow-auto px-3.5 pb-3.5">
            <KairosNotificationList store={notifications} size="compact" />
          </div>
        )}
      </section>

      <section className={compactPanelClass} aria-label="轨迹列表">
        <div className={compactSectionHeadClass}>
          <h2 className="m-0 text-[13px] font-semibold text-text-main">轨迹列表</h2>
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
  if (state === "cooldown" || state === "interrupted") return "text-on-danger";
  return "text-on-success";
}

function stateDotClass(state: KairosRuntimeState["state"]): string {
  if (state === "cooldown" || state === "interrupted")
    return "bg-danger shadow-[0_0_0_3px_var(--act-color-danger-soft)]";
  if (state === "stopped") return "bg-text-faint shadow-[0_0_0_3px_var(--act-color-hover-overlay)]";
  return "bg-success shadow-[0_0_0_3px_var(--act-color-success-soft)]";
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
      return "bg-success-soft text-on-success";
    case "running":
      return "bg-brand-soft text-brand-strong";
    case "failed":
      return "bg-danger-soft text-on-danger";
    case "interrupted":
      return "bg-warm-soft text-on-warm";
  }
}

function compactRowToneClass(row: KairosEventRow): string {
  if (row.kind === "reply") return "shadow-[inset_2px_0_0_var(--act-color-brand)]";
  if (row.kind === "sleep") return "shadow-[inset_2px_0_0_var(--act-color-warm)]";
  if (row.kind === "error" || row.status === "failed") return "shadow-[inset_2px_0_0_var(--act-color-danger)]";
  return "shadow-[inset_2px_0_0_var(--act-color-border-strong)]";
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
