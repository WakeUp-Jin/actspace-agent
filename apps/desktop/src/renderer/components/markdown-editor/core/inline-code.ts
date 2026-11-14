/** 代码块、块公式、frontmatter 的行装饰（规范 §5）。块级 widget 在 `blocks.ts`。 */
import { Decoration } from "@codemirror/view";
import { forEachLine, hide, isRevealed, lineClass, replaceWith, type InlineHandler } from "./inline-context";
import { fenceLanguage, isFenceClosed, isTopLevel, lineExtent } from "./util";
import { CodeHeaderWidget } from "./widgets/code-header";

/**
 * 围栏代码块（D5）。
 * - 平时：隐藏两行围栏，首行位置显示“语言名 + 复制”，按语言高亮；
 * - 光标进入：显示两行围栏，代码头收起；
 * - 未闭合：按代码块显示（左侧一条警示线），不隐藏围栏；
 * - 最外层的已闭合 Mermaid：平时由块级 widget 整块替换，这里不画；光标进入时当普通代码显示源码。
 */
export const fencedCode: InlineHandler = (ctx, n) => {
  const first = ctx.doc.lineAt(n.from);
  const last = ctx.doc.lineAt(n.to);
  const closed = isFenceClosed(ctx.state, n.node);
  const lang = fenceLanguage(ctx.state, n.node);
  if (!closed) {
    forEachLine(ctx, n.from, n.to, (line) => lineClass(ctx, line.from, "md-code-line md-code-open"));
    return false;
  }
  const open = isRevealed(ctx, first.from, last.to);
  if (lang === "mermaid" && isTopLevel(n.node) && !open) return false;
  forEachLine(ctx, n.from, n.to, (line) => {
    const isFirst = line.number === first.number;
    const isLast = line.number === last.number;
    const fence = open && (isFirst || isLast);
    lineClass(
      ctx,
      line.from,
      ["md-code-line", isFirst && "md-code-first", isLast && "md-code-last", fence && "md-code-fence"]
        .filter(Boolean)
        .join(" "),
    );
    if (open || !(isFirst || isLast) || line.to <= line.from) return;
    if (isFirst) replaceWith(ctx, line.from, line.to, Decoration.replace({ widget: new CodeHeaderWidget(lang) }));
    else hide(ctx, line.from, line.to);
  });
  return false;
};

/** 块公式的源码行：只在光标进入（块 widget 收起）时才会走到这里，按等宽淡色显示。 */
export const mathBlock: InlineHandler = (ctx, n) => {
  const extent = lineExtent(ctx.state, n);
  if (!isRevealed(ctx, extent.from, extent.to)) return false;
  forEachLine(ctx, n.from, n.to, (line) => lineClass(ctx, line.from, "md-math-src"));
  return false;
};

/** Frontmatter：属性卡片收起（光标进入）时，把 YAML 源码按淡色等宽显示。 */
export const frontmatter: InlineHandler = (ctx, n) => {
  const extent = lineExtent(ctx.state, n);
  if (isRevealed(ctx, extent.from, extent.to))
    forEachLine(ctx, n.from, n.to, (line) => lineClass(ctx, line.from, "md-fm-raw"));
  return false;
};
