import type { MessageBlock } from "@actspace/shared";
import { MarkdownProse } from "./MarkdownProse";

export function AssistantReply({ message }: { message: Extract<MessageBlock, { kind: "assistant" }> }) {
  return (
    <article className="message-row assistant-reply">
      <div className="assistant-content">
        <MarkdownProse content={message.content} />
      </div>
    </article>
  );
}
