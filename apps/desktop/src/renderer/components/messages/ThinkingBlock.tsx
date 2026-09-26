import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { MessageBlock } from "@actspace/shared";
import {
  getToolLogRunningTextAttrs,
  TOOL_LOG_LINE_TEXT_RUNNING_CLASS,
} from "./toolLogStyles";

const THINKING_BLOCK_CLASS =
  "message-row thinking-block max-w-[var(--conversation-block-max-width)] px-[var(--conversation-text-inset)] animate-[rise-in_260ms_ease_both]";
const THINKING_TOGGLE_CLASS =
  "thinking-toggle flex items-center gap-2 border-0 bg-transparent p-0 text-act-md font-normal leading-[22px] text-text-faint";
const THINKING_CONTENT_CLASS =
  "thinking-content mt-[7px] mb-0 whitespace-pre-wrap font-[inherit] text-act-md leading-[1.65] text-text-muted";

export function ThinkingBlock({ message, className, replyCompleted = false }: {
  message: Extract<MessageBlock, { kind: "thinking" }>;
  className?: string;
  replyCompleted?: boolean;
}) {
  const [expanded, setExpanded] = useState(!replyCompleted && !message.collapsedByDefault);
  // A thinking segment can finish before the final answer. Collapse once the
  // whole reply finishes; later rerenders must preserve manual reopening.
  useEffect(() => {
    if (replyCompleted) setExpanded(false);
  }, [replyCompleted]);
  const blockClassName = `${THINKING_BLOCK_CLASS} ${className ?? ""}`;
  const running = message.status === "running";

  return (
    <article className={blockClassName}>
      <button className={THINKING_TOGGLE_CLASS} type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
        <span
          className={running ? TOOL_LOG_LINE_TEXT_RUNNING_CLASS : undefined}
          {...(running ? getToolLogRunningTextAttrs(message.title) : {})}
        >
          {message.title}
        </span>
        {expanded ? <ChevronDown size={14} strokeWidth={2.2} /> : <ChevronRight size={14} strokeWidth={2.2} />}
      </button>
      {expanded ? <pre className={THINKING_CONTENT_CLASS}>{message.content}</pre> : null}
    </article>
  );
}
