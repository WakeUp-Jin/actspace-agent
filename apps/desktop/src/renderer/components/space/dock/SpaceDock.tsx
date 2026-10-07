import { useEffect, useRef, useState } from "react";
import { useSpaceDemoActions, useSpaceDemoState } from "../model/use-space-demo";
import { currentSpace, currentTab, pillCounts, STATUS_LABEL } from "../model/selectors";
import type { MemberStatus } from "../model/types";
import { ApprovalTray } from "./ApprovalTray";
import { SpaceComposer } from "./SpaceComposer";

const PILL_WRAP_CLASS =
  "mx-auto flex w-[min(calc(100%_-_var(--conversation-inline-padding)_*_2),var(--conversation-content-width))] flex-wrap items-center gap-1.5 max-[600px]:w-[calc(100%_-_36px)]";
const PILL_CLASS =
  "inline-flex h-[26px] items-center gap-1.5 rounded-act-pill px-2.5 text-act-xs transition-[background-color,color,transform] duration-(--motion-fast) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring";
const PILL_IDLE_CLASS = "bg-surface-subtle text-text-muted hover:bg-hover-overlay hover:text-text-main";
const PILL_WARN_CLASS = "bg-warning-soft font-medium text-on-warning aria-pressed:shadow-[inset_0_0_0_1px_var(--act-color-border-strong)]";

const DOT_CLASS: Record<MemberStatus, string> = {
  wait: "bg-warning",
  fail: "bg-danger",
  run: "bg-operational",
  result: "border-[1.5px] border-operational",
  idle: "bg-text-faint opacity-55",
};
const OTHER_STATUSES: readonly MemberStatus[] = ["fail", "run", "result", "idle"];

function StatusDot({ status }: { status: MemberStatus }) {
  return <span aria-hidden="true" className={`inline-block size-[7px] shrink-0 rounded-full ${DOT_CLASS[status]}`} />;
}

// 原生 button：胶囊的琥珀底和状态点样式 Button 没有；已 type="button" 并带可见 focus 环。
function Pill({ status, count, pressed, flash, onClick }: {
  status: MemberStatus;
  count: number;
  pressed?: boolean;
  flash?: boolean;
  onClick: () => void;
}) {
  const warn = status === "wait";
  return (
    <button
      type="button"
      className={`${PILL_CLASS} ${warn ? PILL_WARN_CLASS : PILL_IDLE_CLASS} ${flash ? "space-pill-flash" : ""}`}
      aria-pressed={warn ? Boolean(pressed) : undefined}
      onClick={onClick}
    >
      <StatusDot status={status} />
      {count} {STATUS_LABEL[status]}
    </button>
  );
}

/** approvalPulse 变化后的 1.2 秒内为 true，琥珀胶囊据此跳两下；首次渲染不跳 */
function useFlash(pulse: number): boolean {
  const [on, setOn] = useState(false);
  const last = useRef(pulse);
  useEffect(() => {
    if (pulse === last.current) return;
    last.current = pulse;
    setOn(true);
    const timer = window.setTimeout(() => setOn(false), 1200);
    return () => window.clearTimeout(timer);
  }, [pulse]);
  return on;
}

/** 输入区上方的一组：审批托盘、状态胶囊、输入框。名册页没有输入区。 */
export function SpaceDock() {
  const state = useSpaceDemoState();
  const actions = useSpaceDemoActions();
  const flash = useFlash(state.approvalPulse);
  if (state.view === "roster") return null;
  const space = currentSpace(state);
  const counts = pillCounts(space, currentTab(state));
  const showPills = state.view === "space" && space.msgs.length > 0;
  return (
    <div className="grid min-w-0 gap-2">
      {state.view === "space" ? <ApprovalTray /> : null}
      {showPills ? (
        <div className={PILL_WRAP_CLASS} role="group" aria-label="Actor 状态">
          {counts.wait > 0 ? <Pill status="wait" count={counts.wait} pressed={state.trayOpen} flash={flash} onClick={actions.toggleTray} /> : null}
          {OTHER_STATUSES.filter((st) => counts[st] > 0).map((st) => (
            <Pill key={st} status={st} count={counts[st]} onClick={actions.showActorsPanel} />
          ))}
        </div>
      ) : null}
      <SpaceComposer />
    </div>
  );
}
