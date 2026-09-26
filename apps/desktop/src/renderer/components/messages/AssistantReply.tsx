import type { MessageBlock } from "@actspace/shared";
import { MarkdownProse } from "./MarkdownProse";

const ASSISTANT_REPLY_CLASS = "message-row assistant-reply block animate-[rise-in_260ms_ease_both]";
const ASSISTANT_CONTENT_CLASS =
  "assistant-content max-w-[var(--conversation-block-max-width)] px-[var(--conversation-text-inset)] font-normal leading-[1.65] text-text-main";

export function AssistantReply({ message, onOpenWorkspaceFile }: { message: Extract<MessageBlock, { kind: "assistant" }>; onOpenWorkspaceFile?: (path: string) => void }) {
  return (
    <article className={ASSISTANT_REPLY_CLASS}>
      <div className={ASSISTANT_CONTENT_CLASS}>
        <MarkdownProse content={message.content} onOpenWorkspaceFile={onOpenWorkspaceFile} />
      </div>
    </article>
  );
}
