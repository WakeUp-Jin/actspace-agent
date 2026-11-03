/**
 * 链接点击路由（规范 §8.3、D6：单击直接打开）。
 *
 * - 位置用 `view.posAtDOM(链接元素)` 定位，不用 `posAtCoords`：折行加隐藏标记时后者会落到下一行；
 * - 目标从语法树和文档原文里取，不信任 DOM 属性；
 * - 拖选、⌘ / Ctrl / Shift / Alt 单击、双击都不打开；
 * - 路径、本地链接走 `host.openPath`；`http` / `https` / `mailto` 走 `host.openUrl`；`#标题` 在文档内平滑滚动；
 *   其他协议、越界路径不可点（装饰阶段就没有链接样式）。
 */
import { EditorSelection, type EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { hostOf, pathContextOf } from "./context";
import { findHeadingBySlug } from "./outline";
import { resolveCodePath, routeHref, type LinkRoute } from "./paths";
import { scrollToPos } from "./scroll";
import { ancestorsAt } from "./util";

/** 可点的目标：`none` 不会出现在这里。 */
export type ClickTarget = Exclude<LinkRoute, { kind: "none" }>;

/** 点击拖动超过这个距离（像素）就算拖选。 */
export const DRAG_THRESHOLD = 4;

/** 语法树里 `pos` 处的链接原文：行内代码的文字，或链接 / 自动链接 / 裸 URL 的地址；图片不算。 */
function sourceAt(state: EditorState, pos: number): { kind: "code"; text: string } | { kind: "href"; href: string } | null {
  for (const node of ancestorsAt(state, pos)) {
    switch (node.name) {
      case "Image":
        return null;
      case "InlineCode": {
        const marks = node.getChildren("CodeMark");
        if (marks.length >= 2) return { kind: "code", text: state.sliceDoc(marks[0].to, marks[marks.length - 1].from).trim() };
        break;
      }
      case "URL":
        if (node.parent?.name === "Image" || node.parent?.name === "LinkReference") return null;
        return { kind: "href", href: state.sliceDoc(node.from, node.to) };
      case "Link":
      case "Autolink": {
        const url = node.getChild("URL");
        return url ? { kind: "href", href: state.sliceDoc(url.from, url.to) } : null;
      }
      case "Document":
        return null;
    }
  }
  return null;
}

/**
 * `pos` 处能点开的目标。行内代码不是路径时继续往外找（`[`a.ts`](x)` 里的代码块属于外层链接）。
 */
export function clickTargetAt(state: EditorState, pos: number): ClickTarget | null {
  const ctx = pathContextOf(state);
  for (const node of ancestorsAt(state, pos)) {
    if (node.name === "InlineCode") {
      const marks = node.getChildren("CodeMark");
      if (marks.length >= 2) {
        const resolved = resolveCodePath(state.sliceDoc(marks[0].to, marks[marks.length - 1].from).trim(), ctx);
        if (resolved) return resolved.line ? { kind: "path", ...resolved } : { kind: "path", relativePath: resolved.relativePath };
      }
      continue;
    }
    if (node.name === "Link" || node.name === "Autolink" || node.name === "URL" || node.name === "Image") {
      const source = sourceAt(state, node.from);
      if (source?.kind === "href") {
        const route = routeHref(source.href, ctx);
        return route.kind === "none" ? null : route;
      }
      return null;
    }
  }
  return null;
}

/** 执行点击：路径 / 外链交给宿主，锚点在文档内滚动。返回是否做了事。 */
export function openClickTarget(view: EditorView, target: ClickTarget): boolean {
  const host = hostOf(view.state);
  switch (target.kind) {
    case "path":
      if (!host) return false;
      host.openPath(target.relativePath, target.line);
      return true;
    case "external":
      if (!host) return false;
      host.openUrl(target.url);
      return true;
    case "anchor": {
      const heading = findHeadingBySlug(view.state, target.id.toLowerCase());
      if (!heading) return false;
      scrollToPos(view, heading.from, { smooth: true, margin: 12 });
      return true;
    }
  }
}

/** 预览里可点的元素：行内代码路径、链接、裸 URL / 自动链接都带这两个类名之一。 */
const CLICKABLE = ".md-path, .md-link";

function isPlainClick(event: MouseEvent): boolean {
  return event.button === 0 && event.detail <= 1 && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey;
}

/**
 * mousedown 上就接管，不让光标移进链接（否则链接语法露出，布局一动，mouseup 的目标就变了）。
 * 点击在 mouseup 时打开；按下后移动超过阈值就当拖选：从按下的位置开始手动扩选，不打开。
 */
function startGesture(view: EditorView, event: MouseEvent, target: ClickTarget): void {
  const startX = event.clientX;
  const startY = event.clientY;
  let dragging = false;
  let anchor: number | null = null;
  const onMove = (move: MouseEvent): void => {
    if (!dragging && Math.hypot(move.clientX - startX, move.clientY - startY) <= DRAG_THRESHOLD) return;
    if (!dragging) {
      dragging = true;
      anchor = view.posAtCoords({ x: startX, y: startY });
      view.focus();
    }
    const head = view.posAtCoords({ x: move.clientX, y: move.clientY });
    if (anchor !== null && head !== null) view.dispatch({ selection: EditorSelection.single(anchor, head) });
  };
  const finish = (): void => {
    window.removeEventListener("mousemove", onMove, true);
    window.removeEventListener("mouseup", onUp, true);
  };
  const onUp = (): void => {
    finish();
    if (!dragging) openClickTarget(view, target);
  };
  window.addEventListener("mousemove", onMove, true);
  window.addEventListener("mouseup", onUp, true);
}

/** mousedown 处理：命中可点目标时接管并返回 true。导出给单测直接调用。 */
export function handleLinkMouseDown(event: MouseEvent, view: EditorView): boolean {
  if (!isPlainClick(event)) return false;
  const element = event.target instanceof Element ? event.target.closest(CLICKABLE) : null;
  if (!element || !view.contentDOM.contains(element)) return false;
  const target = clickTargetAt(view.state, view.posAtDOM(element, 0));
  if (!target) return false;
  event.preventDefault();
  startGesture(view, event, target);
  return true;
}

export const linkClicks = EditorView.domEventHandlers({
  mousedown: handleLinkMouseDown,
});
