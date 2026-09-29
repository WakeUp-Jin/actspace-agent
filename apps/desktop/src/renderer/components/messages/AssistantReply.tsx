import { useRef } from "react";
import type { MessageBlock } from "@actspace/shared";
import { MarkdownProse } from "./MarkdownProse";
import { useResponseAnnotations } from "./response-annotation-context";
import { ResponseAnnotationMarkers } from "./ResponseAnnotationMarkers";

const ASSISTANT_REPLY_CLASS = "message-row assistant-reply block animate-[rise-in_260ms_ease_both]";
const ASSISTANT_CONTENT_CLASS =
  "assistant-content relative max-w-[var(--conversation-block-max-width)] px-[var(--conversation-text-inset)] font-normal leading-[1.65] text-text-main";

export function AssistantReply({ message, onOpenWorkspaceFile }: { message: Extract<MessageBlock, { kind: "assistant" }>; onOpenWorkspaceFile?: (path: string) => void }) {
  const sentAnnotations = useResponseAnnotations()?.sentByMessageId.get(message.id);
  const rootRef = useRef<HTMLDivElement | null>(null);
  return (
    <article className={ASSISTANT_REPLY_CLASS} data-assistant-message-id={message.id}>
      <div className={ASSISTANT_CONTENT_CLASS}>
        <div ref={rootRef} data-annotation-root>
          <MarkdownProse content={message.content} onOpenWorkspaceFile={onOpenWorkspaceFile} />
        </div>
        {sentAnnotations?.length ? (
          <ResponseAnnotationMarkers rootRef={rootRef} annotations={sentAnnotations} />
        ) : null}
      </div>
    </article>
  );
}
