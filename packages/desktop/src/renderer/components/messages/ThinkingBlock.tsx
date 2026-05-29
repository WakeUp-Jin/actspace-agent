import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { MessageBlock } from "@actspace/shared";

const THINKING_BLOCK_CLASS =
  "message-row thinking-block max-w-[800px] px-[var(--conversation-text-inset)] animate-[rise-in_260ms_ease_both]";
const THINKING_BLOCK_DEFAULT_MARGIN_CLASS = "mt-0.5";
const THINKING_TOGGLE_CLASS =
  "thinking-toggle inline-flex items-center gap-2 border-0 bg-transparent p-0 text-sm font-medium text-text-muted";
const THINKING_CONTENT_CLASS =
  "thinking-content mt-2 whitespace-pre-wrap font-[inherit] text-sm leading-[1.65] text-text-muted";

export function ThinkingBlock({ message, className }: { message: Extract<MessageBlock, { kind: "thinking" }>; className?: string }) {
  const [expanded, setExpanded] = useState(!message.collapsedByDefault);
  const blockClassName = `${THINKING_BLOCK_CLASS} ${className ?? THINKING_BLOCK_DEFAULT_MARGIN_CLASS}`;

  return (
    <article className={blockClassName}>
      <button className={THINKING_TOGGLE_CLASS} type="button" onClick={() => setExpanded((value) => !value)}>
        <span>{message.title}</span>
        {expanded ? <ChevronDown size={14} strokeWidth={2.2} /> : <ChevronRight size={14} strokeWidth={2.2} />}
      </button>
      {expanded ? <pre className={THINKING_CONTENT_CLASS}>{message.content}</pre> : null}
    </article>
  );
}
