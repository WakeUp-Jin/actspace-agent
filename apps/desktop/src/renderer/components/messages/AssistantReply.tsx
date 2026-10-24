import { memo, useMemo, useRef } from "react";
import type { MessageBlock } from "@actspace/shared";
import { MarkdownProse } from "./MarkdownProse";
import { useResponseAnnotations } from "./response-annotation-context";
import { ResponseAnnotationMarkers, type DraftAnnotationMark } from "./ResponseAnnotationMarkers";

const ASSISTANT_REPLY_CLASS = "message-row assistant-reply block animate-[rise-in_260ms_ease_both]";
const ASSISTANT_CONTENT_CLASS =
  "assistant-content relative max-w-[var(--conversation-block-max-width)] px-[var(--conversation-text-inset)] font-normal leading-[1.65] text-text-main";
const NO_MARKS: readonly DraftAnnotationMark[] = [];

/** 流式期间只有正在写的那条回复换了 message 对象，其余回复靠 memo 跳过。 */
export const AssistantReply = memo(function AssistantReply({ message, onOpenWorkspaceFile }: { message: Extract<MessageBlock, { kind: "assistant" }>; onOpenWorkspaceFile?: (path: string) => void }) {
  const drafts = useResponseAnnotations()?.drafts;
  const rootRef = useRef<HTMLDivElement | null>(null);
  // 序号沿用 Composer 卡片里的全局顺序；没有属于本回复的草稿时复用同一个空数组，不触发重新测量。
  const marks = useMemo(() => {
    const own = (drafts ?? []).flatMap((annotation, index) => (
      annotation.assistantMessageId === message.id ? [{ annotation, label: index + 1 }] : []
    ));
    return own.length > 0 ? own : NO_MARKS;
  }, [drafts, message.id]);
  return (
    <article className={ASSISTANT_REPLY_CLASS} data-assistant-message-id={message.id}>
      <div className={ASSISTANT_CONTENT_CLASS}>
        <div ref={rootRef} data-annotation-root>
          <MarkdownProse content={message.content} onOpenWorkspaceFile={onOpenWorkspaceFile} />
        </div>
        {marks.length > 0 ? <ResponseAnnotationMarkers rootRef={rootRef} marks={marks} /> : null}
      </div>
    </article>
  );
});
