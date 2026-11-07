/**
 * 运行中文字的扫光层，放在带 `tool-log-text-running` 的文字 span 里（样式见 styles/base.css）。
 * 本身没有文字节点：文字由 CSS `content: attr(data-shimmer-text)` 画出，辅助技术与 `getByText` 都看不到它。
 * 这样扫光只靠 transform 在合成层上移动，不再每帧重绘 `background-clip: text` 的渐变。
 */
export function ToolLogShimmer({ text }: { text: string }) {
  return <span className="tool-log-shimmer" aria-hidden="true" data-shimmer-text={text} />;
}
