import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { MessageBlock } from "@actspace/shared";

export function ThinkingBlock({ message }: { message: Extract<MessageBlock, { kind: "thinking" }> }) {
  const [expanded, setExpanded] = useState(!message.collapsedByDefault);

  return (
    <article className="message-row thinking-block">
      <button className="thinking-toggle" type="button" onClick={() => setExpanded((value) => !value)}>
        <span>{message.title}</span>
        {expanded ? <ChevronDown size={14} strokeWidth={2.2} /> : <ChevronRight size={14} strokeWidth={2.2} />}
      </button>
      {expanded ? <pre className="thinking-content">{message.content}</pre> : null}
    </article>
  );
}
