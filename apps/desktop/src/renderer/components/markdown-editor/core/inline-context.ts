/** 行内 / 行装饰共用的上下文和小工具。 */
import type { EditorState, Range, Text } from "@codemirror/state";
import { Decoration } from "@codemirror/view";
import type { SyntaxNodeRef } from "./lezer-types";
import { pathContextOf, type PathContext } from "./context";
import { isEditorFocused, revealed, revealedLines } from "./focus";

export interface InlineCtx {
  state: EditorState;
  doc: Text;
  focused: boolean;
  pathCtx: PathContext;
  /** 本次要处理的文档范围（可见区域） */
  from: number;
  to: number;
  out: Range<Decoration>[];
  /** 被替换的范围（隐藏的标记、widget）：光标移动时当成一个整体跳过 */
  atomic: Range<Decoration>[];
}

/** 返回 false 表示不再往子节点走。 */
export type InlineHandler = (ctx: InlineCtx, node: SyntaxNodeRef) => false | void;

export function createCtx(state: EditorState, from: number, to: number): InlineCtx {
  return { state, doc: state.doc, focused: isEditorFocused(state), pathCtx: pathContextOf(state), from, to, out: [], atomic: [] };
}

const HIDE = Decoration.replace({});
const lineDecos = new Map<string, Decoration>();

/** 隐藏一段标记（`#`、`**`、`>` 等）。空范围忽略。 */
export function hide(ctx: InlineCtx, from: number, to: number): void {
  if (to <= from) return;
  const range = HIDE.range(from, to);
  ctx.out.push(range);
  ctx.atomic.push(range);
}

/** 用 widget 替换一段文字。 */
export function replaceWith(ctx: InlineCtx, from: number, to: number, deco: Decoration): void {
  const range = deco.range(from, to);
  ctx.out.push(range);
  ctx.atomic.push(range);
}

export function mark(ctx: InlineCtx, from: number, to: number, className: string, attributes?: Record<string, string>): void {
  if (to <= from) return;
  ctx.out.push(Decoration.mark({ class: className, attributes }).range(from, to));
}

export function lineClass(ctx: InlineCtx, pos: number, className: string, attributes?: Record<string, string>): void {
  let deco: Decoration;
  if (attributes) {
    deco = Decoration.line({ class: className, attributes });
  } else {
    deco = lineDecos.get(className) ?? Decoration.line({ class: className });
    lineDecos.set(className, deco);
  }
  ctx.out.push(deco.range(pos));
}

/** 逐行处理 [from, to]，只处理落在可见范围里的行（大代码块、大表格不用全算）。 */
export function forEachLine(ctx: InlineCtx, from: number, to: number, fn: (line: { from: number; to: number; number: number }) => void): void {
  const start = ctx.doc.lineAt(Math.max(from, ctx.from)).number;
  const end = ctx.doc.lineAt(Math.min(to, ctx.to)).number;
  for (let n = start; n <= end; n++) fn(ctx.doc.line(n));
}

export function isRevealed(ctx: InlineCtx, from: number, to: number): boolean {
  return revealed(ctx.state, from, to);
}

export function isLineRevealed(ctx: InlineCtx, from: number, to: number): boolean {
  return revealedLines(ctx.state, from, to);
}

/** 标记后面紧跟的一个空格或制表符（一并隐藏）。 */
export function trailingBlank(ctx: InlineCtx, pos: number): number {
  const next = ctx.state.sliceDoc(pos, pos + 1);
  return next === " " || next === "\t" ? pos + 1 : pos;
}
