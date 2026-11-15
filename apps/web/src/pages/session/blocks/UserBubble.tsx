import type { MessageBlock } from "@actspace/shared";

type UserBlock = Extract<MessageBlock, { kind: "user" }>;

/**
 * 气泡文字：没写文字、只发了附件或回复批注时写「N 个附件」「N 条批注」，不出空气泡。
 * Web 还不显示批注本身，所以只给数量。
 */
export function userBubbleText(block: UserBlock): string {
  if (block.content) return block.content;
  const attachments = block.attachments?.length ?? 0;
  if (attachments > 0) return `${attachments} 个附件`;
  const annotations = block.responseAnnotations?.length ?? 0;
  return annotations > 0 ? `${annotations} 条批注` : "";
}

/** 右对齐的用户气泡。 */
export function UserBubble({ block }: { readonly block: UserBlock }) {
  const text = userBubbleText(block);
  return <div className={block.content ? "user-bubble anim-rise" : "user-bubble user-bubble-meta anim-rise"}>{text}</div>;
}
