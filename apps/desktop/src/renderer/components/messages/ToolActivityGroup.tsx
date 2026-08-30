import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { formatWorkedDuration } from "./workedDuration";

/**
 * 工具活动组：把一个 turn 内连续的 thinking / 工具 / 工具间旁白 content 聚合展示。
 *
 * - running：直接平铺过程行（不做固定高度滚动视口，执行中保持正常阅读节奏）。
 * - done：塌缩成单行 `Worked for Xs`，默认折叠，点击展开完整过程。最终回复由父组件渲染在折叠块外。
 *
 * 折叠交互与子 Agent transcript panel 同源，共用 `formatWorkedDuration` 文案。
 */

const RUNNING_FLOW_CLASS = "flex flex-col gap-[9px]";
const DONE_GROUP_CLASS = "tool-activity-done flex flex-col gap-[9px]";
const TOGGLE_CLASS =
  "tool-activity-toggle inline-flex w-fit items-center gap-1.5 rounded-act-sm border-0 bg-transparent px-[var(--conversation-text-inset)] py-0.5 text-sm font-normal leading-[1.42] text-text-muted transition-colors duration-[150ms] ease-in-out hover:text-text-main";
const DONE_FLOW_CLASS = "flex flex-col gap-[9px]";

export function ToolActivityGroup({
  running,
  durationMs,
  children,
}: {
  running: boolean;
  durationMs?: number;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);

  if (running) {
    return <div className={RUNNING_FLOW_CLASS}>{children}</div>;
  }

  return (
    <div className={DONE_GROUP_CLASS}>
      <button
        className={TOGGLE_CLASS}
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span>{formatWorkedDuration(durationMs)}</span>
        {expanded ? (
          <ChevronDown size={15} strokeWidth={2.2} aria-hidden="true" />
        ) : (
          <ChevronRight size={15} strokeWidth={2.2} aria-hidden="true" />
        )}
      </button>
      {expanded ? <div className={DONE_FLOW_CLASS}>{children}</div> : null}
    </div>
  );
}
