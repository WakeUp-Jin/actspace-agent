/**
 * 流式中的回复，最后一块的末尾会被 rehype-stream-tail 拆成几层渐显的 <span>（规范 §7.1），
 * `getByText("整句")` 这种按元素自身文字匹配的写法会找不到。这个匹配器改成按块级元素的完整 textContent 匹配，
 * 用法：`screen.findByText(replyText("整句"))`。
 */
export function replyText(text: string) {
  return (_content: string, element: Element | null): boolean =>
    element?.matches(".markdown-prose p, .markdown-prose li, .markdown-prose h1, .markdown-prose h2, .markdown-prose h3, .markdown-prose h4") === true && element.textContent === text;
}
