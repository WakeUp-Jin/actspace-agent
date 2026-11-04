import { useState } from "react";
import { ChevronRight, RotateCcw } from "lucide-react";
import { subagentActivationStatusLabel, type MessageBlock } from "@actspace/shared";
import { Button } from "../ui/Button";

type BackgroundNoticeMessage = Extract<MessageBlock, { kind: "background_notice" }>;

// 空闲会话被收件箱通知唤醒的那一轮的开头：一条细分隔线，点开看内容（Bash 是通知原文，子智能体是结论或来信正文）。
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

/** 子智能体一次激活结束：「子智能体 ‹描述› 已完成」；子智能体发来消息：「‹描述› 发来消息」；Bash 照旧（设计 05 §1）。 */
export function backgroundNoticeLabel(message: Pick<BackgroundNoticeMessage, "taskKind" | "title" | "status">): string {
  if (message.taskKind === "subagent") return `子智能体 ${message.title} ${subagentActivationStatusLabel(message.status)}`;
  if (message.taskKind === "agent_message") return `${message.title} 发来消息`;
  return `后台任务 · ${message.taskKind === "agent" ? "Agent" : "Bash"}: ${message.title} · ${STATUS_LABELS[message.status] ?? message.status}`;
}

/** 展开后显示的内容：子智能体完成看结论（没有就看 summary），来信看正文，Bash 看通知原文。 */
export function backgroundNoticeBody(message: Pick<BackgroundNoticeMessage, "taskKind" | "content">): string {
  if (message.taskKind === "subagent") {
    const closing = xmlText(message.content, "closing_message");
    const summary = xmlText(message.content, "summary");
    const note = xmlText(message.content, "note");
    return [closing && closing !== "(no closing message)" ? closing : summary, note].filter(Boolean).join("\n\n") || message.content;
  }
  if (message.taskKind === "agent_message") return /^\s*<agent_message\b[^>]*>\n?([\s\S]*?)\n?<\/agent_message>\s*$/.exec(message.content)?.[1] ?? message.content;
  return message.content;
}

/** 通知里一个标签的文字（通知生成时转义了 `& < >`，这里还原）。 */
function xmlText(content: string, tag: string): string | undefined {
  const value = new RegExp(`<${tag}>\\n?([\\s\\S]*?)\\n?</${tag}>`).exec(content)?.[1]?.trim();
  return value ? value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&") : undefined;
}

export function BackgroundNoticeRow({ message, onOpenSubagent }: { message: BackgroundNoticeMessage; onOpenSubagent?: (agentId: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const label = backgroundNoticeLabel(message);
  // 两种子智能体通知的 taskId 都是子智能体 id（agent_message 是发送方）。
  const openable = onOpenSubagent && (message.taskKind === "subagent" || message.taskKind === "agent_message");
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
      {expanded ? <pre className={BODY_CLASS}>{backgroundNoticeBody(message)}</pre> : null}
      {expanded && openable ? <div className="mb-2 flex justify-end"><Button size="xs" variant="ghost" onClick={() => onOpenSubagent(message.taskId)}>打开子智能体</Button></div> : null}
    </article>
  );
}
