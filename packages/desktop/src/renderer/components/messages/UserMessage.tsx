import type { MessageBlock } from "@actspace/shared";

const USER_MESSAGE_CLASS = "message-row user-message flex justify-start animate-[rise-in_260ms_ease_both]";
const USER_CARD_CLASS =
  "user-card w-full rounded-act-lg border border-line bg-surface px-[var(--conversation-card-padding)] py-3 leading-[1.55] text-text-main shadow-[0_12px_34px_rgba(31,45,61,0.045)] dark:shadow-[0_12px_34px_rgba(0,0,0,0.3)]";

export function UserMessage({ message }: { message: Extract<MessageBlock, { kind: "user" }> }) {
  return (
    <article className={USER_MESSAGE_CLASS}>
      <div className={USER_CARD_CLASS}>{message.content}</div>
    </article>
  );
}
