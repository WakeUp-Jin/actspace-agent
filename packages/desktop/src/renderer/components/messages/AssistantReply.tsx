import type { MessageBlock } from "@actspace/shared";

export function AssistantReply({ message }: { message: Extract<MessageBlock, { kind: "assistant" }> }) {
  return (
    <article className="message-row assistant-reply">
      <div className="assistant-content">
        <p>{message.content}</p>
      </div>
    </article>
  );
}
