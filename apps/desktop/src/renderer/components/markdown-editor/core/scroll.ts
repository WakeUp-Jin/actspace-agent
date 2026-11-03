/** 滚动与跳转：大纲点击、`#标题` 链接、带行号的路径打开后滚到那一行。 */
import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * 把 `pos` 所在的行滚到顶部，留 `margin` 像素。
 * 目标在已渲染的范围内且允许动效时平滑滚动；否则用 CM 的 scrollIntoView（距离远、高度还是估算值时更准）。
 */
export function scrollToPos(view: EditorView, pos: number, { smooth = false, margin = 12 }: { smooth?: boolean; margin?: number } = {}): void {
  const target = Math.max(0, Math.min(pos, view.state.doc.length));
  if (smooth && !prefersReducedMotion() && typeof view.scrollDOM.scrollTo === "function" && target >= view.viewport.from && target <= view.viewport.to) {
    const top = Math.max(0, view.lineBlockAt(target).top + view.documentPadding.top - margin);
    view.scrollDOM.scrollTo({ top, behavior: "smooth" });
    return;
  }
  view.dispatch({ effects: EditorView.scrollIntoView(target, { y: "start", yMargin: margin }) });
}

/**
 * 跳到第 `line` 行（1 起始，超出范围取边界）。`select` 为真时选中整行，
 * 选中会让光标碰到该行里的语法节点，预览模式下对应的标记会露出来（这就是编辑器的实时预览语义）。
 */
export function scrollToLine(view: EditorView, line: number, { select = true }: { select?: boolean } = {}): void {
  const doc = view.state.doc;
  const target = doc.line(Math.min(Math.max(Math.trunc(line) || 1, 1), doc.lines));
  view.dispatch({
    selection: select ? EditorSelection.range(target.from, target.to) : EditorSelection.cursor(target.from),
    effects: EditorView.scrollIntoView(target.from, { y: "center" }),
  });
}
