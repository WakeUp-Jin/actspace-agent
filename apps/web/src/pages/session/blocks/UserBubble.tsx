/** 右对齐的用户气泡。 */
export function UserBubble({ text }: { readonly text: string }) {
  return <div className="user-bubble anim-rise">{text}</div>;
}
