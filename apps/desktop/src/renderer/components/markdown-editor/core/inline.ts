/**
 * 行内与行装饰的入口（规范 §3.1 的 `inline.ts`）。
 *
 * - `buildInlineDecorations` 是纯函数：给一个 EditorState 和要算的范围，返回装饰集合，可以直接单测；
 * - `inlineDecorations` 是 ViewPlugin：只算可见区域；输入法组字（`view.compositionStarted`）期间不重算，
 *   只把已有装饰映射到新文档，组字结束后补算一次。
 * - 被替换的范围（隐藏的标记、widget）同时登记为原子范围，方向键一步跨过去。
 *
 * 块级的 widget（frontmatter 卡片、Mermaid、块公式）必须来自 StateField，见 `blocks.ts`。
 */
import { syntaxTree } from "@codemirror/language";
import { RangeSet, type EditorState } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { hostFacet } from "./context";
import { setFocusEffect } from "./focus";
import { createCtx, type InlineHandler } from "./inline-context";
import * as blocks from "./inline-blocks";
import * as code from "./inline-code";
import * as text from "./inline-text";

const HANDLERS: Record<string, InlineHandler> = {
  ATXHeading1: text.atxHeading,
  ATXHeading2: text.atxHeading,
  ATXHeading3: text.atxHeading,
  ATXHeading4: text.atxHeading,
  ATXHeading5: text.atxHeading,
  ATXHeading6: text.atxHeading,
  SetextHeading1: text.setextHeading,
  SetextHeading2: text.setextHeading,
  HeaderMark: () => false,
  Emphasis: text.emphasis,
  StrongEmphasis: text.emphasis,
  Strikethrough: text.emphasis,
  InlineCode: text.inlineCode,
  Link: text.link,
  Autolink: text.autolink,
  URL: text.bareUrl,
  Image: text.image,
  MathInline: text.mathInline,
  HTMLBlock: text.htmlBlock,
  CommentBlock: text.htmlBlock,
  ProcessingInstructionBlock: text.htmlBlock,
  HTMLTag: text.htmlInline,
  Comment: text.htmlInline,
  ProcessingInstruction: text.htmlInline,
  LinkReference: () => false,
  Blockquote: blocks.blockquote,
  QuoteMark: blocks.quoteMark,
  BulletList: blocks.list,
  OrderedList: blocks.list,
  ListMark: blocks.listMark,
  TaskMarker: blocks.taskMarker,
  HorizontalRule: blocks.horizontalRule,
  TableHeader: blocks.tableRow,
  TableRow: blocks.tableRow,
  TableDelimiter: blocks.tableSeparator,
  FencedCode: code.fencedCode,
  MathBlock: code.mathBlock,
  Frontmatter: code.frontmatter,
};

export interface InlineDecorations {
  decorations: DecorationSet;
  /** 被替换的范围，给 `EditorView.atomicRanges` 用 */
  atomic: DecorationSet;
}

/** 算 [from, to] 范围内的行内与行装饰（到整份文档为止）。 */
export function buildInlineDecorations(state: EditorState, from = 0, to = state.doc.length): InlineDecorations {
  const ctx = createCtx(state, from, Math.min(to, state.doc.length));
  syntaxTree(state).iterate({
    from: ctx.from,
    to: ctx.to,
    enter(node) {
      const handler = HANDLERS[node.name];
      return handler ? handler(ctx, node) : undefined;
    },
  });
  return { decorations: Decoration.set(ctx.out, true), atomic: Decoration.set(ctx.atomic, true) };
}

class InlinePlugin {
  decorations: DecorationSet;
  atomic: DecorationSet;
  /** 组字期间跳过的重算，组字结束后的第一次更新补上 */
  private stale = false;

  constructor(view: EditorView) {
    ({ decorations: this.decorations, atomic: this.atomic } = this.compute(view));
  }

  update(update: ViewUpdate): void {
    const { state, startState } = update;
    const changed =
      update.docChanged ||
      update.selectionSet ||
      update.viewportChanged ||
      syntaxTree(startState) !== syntaxTree(state) ||
      startState.facet(hostFacet) !== state.facet(hostFacet) ||
      update.transactions.some((tr) => tr.effects.some((effect) => effect.is(setFocusEffect)));
    if (!changed && !this.stale) return;
    if (update.view.compositionStarted) {
      // 输入法组字（`compositionStarted` 比 `composing` 早：首字的组字期间 `composing` 还是 false）：不重算，避免装饰在组字文本下面跳动
      if (update.docChanged) {
        this.decorations = this.decorations.map(update.changes);
        this.atomic = this.atomic.map(update.changes);
      }
      this.stale = true;
      return;
    }
    this.stale = false;
    ({ decorations: this.decorations, atomic: this.atomic } = this.compute(update.view));
  }

  private compute(view: EditorView): InlineDecorations {
    const ranges = view.visibleRanges;
    if (ranges.length === 0) return buildInlineDecorations(view.state, 0, 0);
    // 没有折叠时只有一段可见范围；有多段就合成一段，省得同一个节点重复装饰
    return buildInlineDecorations(view.state, ranges[0].from, ranges[ranges.length - 1].to);
  }
}

const inlinePlugin = ViewPlugin.fromClass(InlinePlugin, {
  decorations: (plugin) => plugin.decorations,
});

export const inlineDecorations = [
  inlinePlugin,
  EditorView.atomicRanges.of((view) => view.plugin(inlinePlugin)?.atomic ?? RangeSet.empty),
];

/** 取当前的行内装饰（测试和调试用）。 */
export function currentInlineDecorations(view: EditorView): DecorationSet {
  return view.plugin(inlinePlugin)?.decorations ?? Decoration.none;
}
