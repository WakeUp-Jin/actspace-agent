/** 行内装饰：标题、强调、行内代码与路径、链接、图片、公式、原始 HTML（规范 §5）。 */
import { Decoration } from "@codemirror/view";
import type { SyntaxNodeRef } from "./lezer-types";
import {
  forEachLine,
  hide,
  isRevealed,
  lineClass,
  mark,
  replaceWith,
  trailingBlank,
  type InlineCtx,
  type InlineHandler,
} from "./inline-context";
import { isRemoteImage, resolveCodePath, resolveImagePath, routeHref } from "./paths";
import { FileIconWidget } from "./widgets/file-icon";
import { ImageWidget } from "./widgets/image";
import { MathWidget } from "./widgets/math";

const fileIcon = Decoration.widget({ widget: new FileIconWidget(), side: 1 });
const iconLead = Decoration.mark({ class: "md-path-lead", inclusiveStart: true });

/**
 * 文件图标插在 pos；图标和后面第一个字符包进不换行的 `.md-path-lead`，
 * 否则窄的时候图标会单独留在上一行末尾（图标是行内块，后面天然有断行机会）。
 */
function addFileIcon(ctx: InlineCtx, pos: number): void {
  ctx.out.push(fileIcon.range(pos));
  const next = ctx.state.sliceDoc(pos, pos + 2);
  const lead = next ? String.fromCodePoint(next.codePointAt(0)!) : "";
  if (lead && lead !== "`") ctx.out.push(iconLead.range(pos, pos + lead.length));
}

/** ATX 标题：整行按级别排字号；`#` 和后面的空格平时隐藏，光标在标题里时露出（D1）。 */
export const atxHeading: InlineHandler = (ctx, n) => {
  const level = Number(n.name.slice(-1));
  lineClass(ctx, ctx.doc.lineAt(n.from).from, `md-h md-h${Math.min(level, 4)}`);
  const first = n.node.firstChild;
  if (first?.name === "HeaderMark" && first.from === n.from && !isRevealed(ctx, n.from, n.to)) {
    hide(ctx, first.from, trailingBlank(ctx, first.to));
  }
};

/** Setext 标题：文字行按级别排字号；下划线那一行平时隐藏，光标在标题里时露出。 */
export const setextHeading: InlineHandler = (ctx, n) => {
  const level = Number(n.name.slice(-1));
  const last = ctx.doc.lineAt(n.to);
  const show = isRevealed(ctx, n.from, n.to);
  forEachLine(ctx, n.from, n.to, (line) => {
    if (line.number !== last.number) {
      lineClass(ctx, line.from, `md-h md-h${level}`);
    } else if (!show) {
      lineClass(ctx, line.from, "md-setext-mark");
      hide(ctx, line.from, line.to);
    }
  });
};

/** 粗体、斜体、删除线：标记平时隐藏，光标进入这个节点时露出（只露出这个节点的标记）。 */
export const emphasis: InlineHandler = (ctx, n) => {
  if (isRevealed(ctx, n.from, n.to)) return;
  for (let child = n.node.firstChild; child; child = child.nextSibling) {
    if (child.name === "EmphasisMark" || child.name === "StrikethroughMark") hide(ctx, child.from, child.to);
  }
};

/** 行内代码：灰底等宽；整段是工作区里的文件路径（D12）就变成强调色 + 文件图标，单击打开。 */
export const inlineCode: InlineHandler = (ctx, n) => {
  const marks = n.node.getChildren("CodeMark");
  if (marks.length < 2) return false;
  const first = marks[0];
  const last = marks[marks.length - 1];
  const text = ctx.state.sliceDoc(first.to, last.from).trim();
  const resolved = resolveCodePath(text, ctx.pathCtx);
  if (resolved) {
    const where = resolved.line ? `${resolved.relativePath}:${resolved.line}` : resolved.relativePath;
    mark(ctx, n.from, n.to, "md-path", { title: `在 ActSpace 中打开：${where}` });
    addFileIcon(ctx, first.to);
  } else {
    mark(ctx, n.from, n.to, "md-inline-code");
  }
  if (!isRevealed(ctx, n.from, n.to)) {
    hide(ctx, first.from, first.to);
    hide(ctx, last.from, last.to);
  }
  return false;
};

/**
 * 链接 `[文字](url)`：只显示文字。本地文件用强调色 + 文件图标，网页链接用链接色；
 * 解析不出去处的（其他协议、越界路径）只隐藏标记，不加链接样式，也不可点。光标进入时露出完整语法。
 */
export const link: InlineHandler = (ctx, n) => {
  const marks = n.node.getChildren("LinkMark");
  const url = n.node.getChild("URL");
  if (!url || marks.length < 2 || ctx.state.sliceDoc(n.from, n.to).includes("\n")) return;
  const textFrom = marks[0].to;
  const textTo = marks[1].from;
  const href = ctx.state.sliceDoc(url.from, url.to);
  const route = routeHref(href, ctx.pathCtx);
  if (textTo > textFrom) {
    if (route.kind === "none") {
      mark(ctx, textFrom, textTo, "md-link-dead", { title: href });
    } else {
      if (route.kind === "path") {
        // inclusiveStart：起点处的文件图标落在链接里，和第一个字符同在一个不换行的 .md-path-lead 里
        ctx.out.push(
          Decoration.mark({ class: "md-link md-link-file", attributes: { title: href }, inclusiveStart: true }).range(
            textFrom,
            textTo,
          ),
        );
        addFileIcon(ctx, textFrom);
      } else {
        mark(ctx, textFrom, textTo, "md-link", { title: href });
      }
    }
  }
  if (textTo > textFrom && !isRevealed(ctx, n.from, n.to)) {
    hide(ctx, n.from, textFrom);
    hide(ctx, textTo, n.to);
  }
};

/** `<自动链接>`：链接色，可点；尖括号平时隐藏。 */
export const autolink: InlineHandler = (ctx, n) => {
  const url = n.node.getChild("URL");
  if (!url) return false;
  mark(ctx, url.from, url.to, "md-link");
  if (!isRevealed(ctx, n.from, n.to)) {
    hide(ctx, n.from, url.from);
    hide(ctx, url.to, n.to);
  }
  return false;
};

/** 裸 URL（GFM 自动链接）：链接色，可点。Link、Image、链接定义里的 URL 由各自的处理接管。 */
export const bareUrl: InlineHandler = (ctx, n) => {
  const parent = n.node.parent?.name;
  if (parent === "Link" || parent === "Image" || parent === "Autolink" || parent === "LinkReference") return false;
  mark(ctx, n.from, n.to, "md-link");
  return false;
};

/**
 * 图片（D10）：只渲染工作区里的本地图片。
 * 平时用图片替换源码，光标进入时显示源码，图片仍在下方；远程地址显示原文并提示“远程图片不加载”，不发网络请求；
 * 越界路径、其他协议保持普通文字。
 */
export const image: InlineHandler = (ctx, n) => {
  const marks = n.node.getChildren("LinkMark");
  const url = n.node.getChild("URL");
  if (!url || marks.length < 2 || ctx.state.sliceDoc(n.from, n.to).includes("\n")) return false;
  const src = ctx.state.sliceDoc(url.from, url.to);
  if (isRemoteImage(src)) {
    mark(ctx, n.from, n.to, "md-img-skipped", { title: "远程图片不加载" });
    return false;
  }
  const relativePath = resolveImagePath(src, ctx.pathCtx);
  if (!relativePath) return false;
  const alt = ctx.state.sliceDoc(marks[0].to, marks[1].from);
  const widget = new ImageWidget(relativePath, alt, ctx.state.sliceDoc(n.from, n.to));
  if (isRevealed(ctx, n.from, n.to)) ctx.out.push(Decoration.widget({ widget, side: 1 }).range(n.to));
  else replaceWith(ctx, n.from, n.to, Decoration.replace({ widget }));
  return false;
};

/** 行内公式 `$…$`：平时 KaTeX 行内显示，光标进入时露出源码。 */
export const mathInline: InlineHandler = (ctx, n) => {
  if (n.to - n.from > 2 && !isRevealed(ctx, n.from, n.to)) {
    replaceWith(
      ctx,
      n.from,
      n.to,
      Decoration.replace({ widget: new MathWidget(ctx.state.sliceDoc(n.from + 1, n.to - 1), false) }),
    );
  }
  return false;
};

/** 原始 HTML：按原文显示（淡色等宽），不渲染、不执行。 */
export const htmlBlock: InlineHandler = (ctx, n) => {
  forEachLine(ctx, n.from, n.to, (line) => lineClass(ctx, line.from, "md-html"));
  return false;
};

export const htmlInline = (ctx: InlineCtx, n: SyntaxNodeRef): false => {
  mark(ctx, n.from, n.to, "md-html");
  return false;
};
