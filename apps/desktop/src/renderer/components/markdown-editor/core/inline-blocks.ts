/** 块级结构的行 / 行内装饰：引用、提示框、列表、任务、分隔线、伪表格（规范 §5）。 */
import { Decoration } from "@codemirror/view";
import type { SyntaxNode } from "./lezer-types";
import { CALLOUT_COLOR_VAR, parseCalloutMarker } from "../../markdown-common/callouts";
import { forEachLine, hide, isLineRevealed, isRevealed, lineClass, mark, replaceWith, trailingBlank, type InlineCtx, type InlineHandler } from "./inline-context";
import { BulletWidget } from "./widgets/bullet";
import { CalloutLabelWidget } from "./widgets/callout-label";
import { CheckboxWidget } from "./widgets/checkbox";

function countAncestors(node: SyntaxNode | null, name: string): number {
  let depth = 0;
  for (let p = node; p; p = p.parent) if (p.name === name) depth++;
  return depth;
}

/**
 * 引用：每行左侧一条强调色竖条。第一层以外的引用只加行样式；
 * 提示框 `> [!TYPE]`（首行只有标记）整块换成语义色，首行标记换成中文标签，光标碰到标记时露出原文。
 */
export const blockquote: InlineHandler = (ctx, n) => {
  if (n.node.parent?.name === "Blockquote") return;
  const first = ctx.doc.lineAt(n.from);
  const prefix = /^[ \t]*>[ \t]?/.exec(first.text)?.[0] ?? "";
  const rest = first.text.slice(prefix.length);
  const callout = prefix ? parseCalloutMarker(rest) : null;
  const matched = callout && callout.length === rest.length ? callout : null;
  const attributes = matched ? { style: `--md-callout: ${CALLOUT_COLOR_VAR[matched.type]}` } : undefined;
  const className = matched ? `md-quote md-callout md-callout-${matched.type}` : "md-quote";
  forEachLine(ctx, n.from, n.to, (line) => lineClass(ctx, line.from, className, attributes));
  if (matched) {
    const from = first.from + prefix.length;
    const to = from + rest.trimEnd().length;
    if (from >= ctx.from && from <= ctx.to && !isRevealed(ctx, from, to)) {
      replaceWith(ctx, from, to, Decoration.replace({ widget: new CalloutLabelWidget(matched.type) }));
    }
  }
};

/** 引用标记 `>`：平时隐藏，光标所在的行露出；嵌套的竖条叠加（行上最深的一层决定叠几条）。 */
export const quoteMark: InlineHandler = (ctx, n) => {
  const depth = countAncestors(n.node.parent, "Blockquote");
  if (depth >= 2) lineClass(ctx, ctx.doc.lineAt(n.from).from, `md-quote-d${Math.min(depth, 4)}`);
  if (!isLineRevealed(ctx, n.from, n.to)) hide(ctx, n.from, trailingBlank(ctx, n.to));
  return false;
};

/** 最外层的列表：每一行都加悬挂缩进。 */
export const list: InlineHandler = (ctx, n) => {
  if (n.node.parent?.name === "ListItem") return;
  forEachLine(ctx, n.from, n.to, (line) => lineClass(ctx, line.from, "md-li"));
};

/**
 * 列表标记。
 * - 任务项：`- ` 平时隐藏（复选框由 TaskMarker 画），光标碰到 `- [ ]` 时露出原文；
 * - 无序：圆点（三层实心 / 空心 / 方点），光标碰到时还原成原文；
 * - 有序：序号原文，淡色。
 */
export const listMark: InlineHandler = (ctx, n) => {
  const item = n.node.parent;
  const bulletList = item?.parent;
  const marker = item?.getChild("Task")?.getChild("TaskMarker");
  const line = ctx.doc.lineAt(n.from);
  if (marker) {
    if (!isRevealed(ctx, n.from, marker.to)) {
      hide(ctx, n.from, trailingBlank(ctx, n.to));
      lineClass(ctx, line.from, "md-li-hang");
    }
    return false;
  }
  if (bulletList?.name === "BulletList" && !isRevealed(ctx, n.from, n.to)) {
    replaceWith(ctx, n.from, n.to, Decoration.replace({ widget: new BulletWidget(countAncestors(bulletList, "BulletList")) }));
    lineClass(ctx, line.from, "md-li-hang");
  } else {
    mark(ctx, n.from, n.to, "md-list-mark");
  }
  return false;
};

/** 任务复选框 `[ ]` / `[x]`（D3）：已完成的项划线变淡。 */
export const taskMarker: InlineHandler = (ctx, n) => {
  const listMarkNode = n.node.parent?.parent?.getChild("ListMark");
  const checked = /x/i.test(ctx.state.sliceDoc(n.from, n.to));
  if (!isRevealed(ctx, listMarkNode ? listMarkNode.from : n.from, n.to)) {
    replaceWith(ctx, n.from, n.to, Decoration.replace({ widget: new CheckboxWidget(checked) }));
  }
  const task = n.node.parent;
  if (checked && task && task.to > n.to + 1) mark(ctx, n.to + 1, task.to, "md-task-done");
  return false;
};

/** 分隔线：平时一条细线，光标在这一行时还原成原文。 */
export const horizontalRule: InlineHandler = (ctx, n) => {
  if (isLineRevealed(ctx, n.from, n.to)) return false;
  lineClass(ctx, ctx.doc.lineAt(n.from).from, "md-hr");
  hide(ctx, n.from, n.to);
  return false;
};

/** 表头 / 表体的一行。竖线平时隐藏，只有光标所在的单元格显示它两侧的竖线；每个单元格按列宽均分（D4）。 */
export const tableRow: InlineHandler = (ctx, n) => {
  const row = n.node;
  lineClass(ctx, ctx.doc.lineAt(n.from).from, n.name === "TableHeader" ? "md-tr md-th" : "md-tr");
  const delimiters = row.getChildren("TableDelimiter");
  // 单元格 = 相邻两条竖线之间（含首尾）的区间；空区间不是单元格
  const cells: { from: number; to: number; left: number; right: number }[] = [];
  let start = row.from;
  let left = -1;
  delimiters.forEach((delimiter, index) => {
    if (delimiter.from > start && ctx.state.sliceDoc(start, delimiter.from).trim()) cells.push({ from: start, to: delimiter.from, left, right: index });
    start = delimiter.to;
    left = index;
  });
  if (row.to > start && ctx.state.sliceDoc(start, row.to).trim()) cells.push({ from: start, to: row.to, left, right: -1 });
  const shown = new Set<number>();
  for (const cell of cells) {
    mark(ctx, cell.from, cell.to, "md-td");
    if (isRevealed(ctx, cell.from, cell.to)) {
      shown.add(cell.left);
      shown.add(cell.right);
    }
  }
  delimiters.forEach((delimiter, index) => {
    if (!shown.has(index)) hide(ctx, delimiter.from, delimiter.to);
    else mark(ctx, delimiter.from, delimiter.to, "md-pipe");
  });
};

/** 表头下面的分隔行 `| --- | --- |`：平时整行隐藏，光标落在这一行时露出原文。 */
export const tableSeparator: InlineHandler = (ctx, n) => {
  if (n.node.parent?.name !== "Table") return false;
  if (isLineRevealed(ctx, n.from, n.to)) return false;
  lineClass(ctx, ctx.doc.lineAt(n.from).from, "md-tsep");
  hide(ctx, n.from, n.to);
  return false;
};

export type { InlineCtx };
