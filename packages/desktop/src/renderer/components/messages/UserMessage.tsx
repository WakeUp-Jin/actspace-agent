import type { MessageBlock } from "@actspace/shared";

export function UserMessage({ message }: { message: Extract<MessageBlock, { kind: "user" }> }) {
  return (
    <article className="message-row user-message">
      <div className="user-card">{message.content}</div>
    </article>
  );
}
