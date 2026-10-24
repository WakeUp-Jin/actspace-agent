import { useState } from "react";
import { ChevronRight, RotateCcw } from "lucide-react";
import type { MessageBlock } from "@actspace/shared";

type BackgroundNoticeMessage = Extract<MessageBlock, { kind: "background_notice" }>;

// 空闲会话被后台任务通知唤醒的那一轮的开头：一条细分隔线，点开看通知原文（模型看到的就是这段）。
// 展开开关是分隔线中间的一段文字，与压缩分隔行一样用原生 button，不套 Button 的填充样式。
const BLOCK_CLASS = "message-row background-notice-row w-full px-[var(--conversation-text-inset)] animate-[rise-in_220ms_ease_both]";
const DIVIDER_CLASS = "flex w-full items-center gap-3 py-2.5 text-act-xs leading-4 font-medium text-text-faint";
const DIVIDER_LINE_CLASS = "h-px min-w-6 flex-1 bg-line";
const TOGGLE_CLASS =
  "inline-flex min-w-0 items-center gap-1 rounded-act-xs px-1 py-0.5 transition-colors duration-(--motion-fast) hover:text-text-main focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring";
const TEXT_CLASS = "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap";
const CHEVRON_CLASS = "shrink-0 transition-transform duration-(--motion-fast) motion-reduce:transition-none";
const BODY_CLASS =
  "mb-2 max-h-60 overflow-y-auto whitespace-pre-wrap break-words rounded-act-md bg-surface-subtle px-3.5 py-3 font-mono text-act-xs leading-5 text-text-muted animate-[rise-in_180ms_ease_both]";

const STATUS_LABELS: Record<string, string> = { completed: "已完成", failed: "失败", stopped: "已停止", lost: "已失联", output_match: "输出匹配" };

export function backgroundNoticeLabel(message: Pick<BackgroundNoticeMessage, "taskKind" | "title" | "status">): string {
  return `后台任务 · ${message.taskKind === "agent" ? "Agent" : "Bash"}: ${message.title} · ${STATUS_LABELS[message.status] ?? message.status}`;
}

export function BackgroundNoticeRow({ message }: { message: BackgroundNoticeMessage }) {
  const [expanded, setExpanded] = useState(false);
  const label = backgroundNoticeLabel(message);
  return (
    <article className={BLOCK_CLASS}>
      <div className={DIVIDER_CLASS}>
        <span className={DIVIDER_LINE_CLASS} aria-hidden="true" />
        <button type="button" className={TOGGLE_CLASS} aria-expanded={expanded} title={label} onClick={() => setExpanded((value) => !value)}>
          <RotateCcw size={12} strokeWidth={2.2} className="shrink-0" aria-hidden="true" />
          <span className={TEXT_CLASS}>{label}</span>
          <ChevronRight size={12} strokeWidth={2.2} className={`${CHEVRON_CLASS}${expanded ? " rotate-90" : ""}`} aria-hidden="true" />
        </button>
        <span className={DIVIDER_LINE_CLASS} aria-hidden="true" />
      </div>
      {expanded ? <pre className={BODY_CLASS}>{message.content}</pre> : null}
    </article>
  );
}
