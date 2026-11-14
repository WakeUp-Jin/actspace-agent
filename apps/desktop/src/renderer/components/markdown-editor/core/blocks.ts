/**
 * 块级装饰（规范 §5、§11）：frontmatter 属性卡片、Mermaid 图、块公式。
 *
 * 块级 widget（`block: true` 的替换和插入）必须来自 StateField。重算策略：
 * - 文档或语法树变了：重新扫一遍最外层的块（只走文档的直接子节点，不进入行内）；
 * - 只有选区或焦点变了：只重新判断“哪些块需要露出”，露出集合不变就原样返回，
 *   所以光标在块外移动时前后是同一个 `DecorationSet`；
 * - 输入法组字期间：只映射已有装饰，不重算（`input.type.compose`）。
 *
 * 只处理最外层的块：引用、列表里的 Mermaid 和公式按普通代码显示，避免块替换范围里夹着容器标记。
 */
import { syntaxTree } from "@codemirror/language";
import { RangeSet, StateField, type EditorState, type Range, type Transaction } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import { frontmatterRange } from "./syntax";
import { isEditorFocused, selectionTouches, setFocusEffect } from "./focus";
import { fenceCode, fenceLanguage, isFenceClosed, isTopLevel, lineExtent } from "./util";
import { FrontmatterWidget, parseFrontmatter } from "./widgets/frontmatter";
import { MathWidget } from "./widgets/math";
import { MermaidWidget } from "./widgets/mermaid";

export type BlockInfo =
  | { kind: "frontmatter"; from: number; to: number; source: string }
  | { kind: "mermaid"; from: number; to: number; code: string }
  | { kind: "math"; from: number; to: number; tex: string };

/** 扫描最外层的块级 widget 候选。`from` / `to` 是整行范围。 */
export function collectBlocks(state: EditorState): BlockInfo[] {
  const blocks: BlockInfo[] = [];
  const front = frontmatterRange(state);
  if (front)
    blocks.push({ kind: "frontmatter", from: front.from, to: front.to, source: state.sliceDoc(front.from, front.to) });
  for (let node = syntaxTree(state).topNode.firstChild; node; node = node.nextSibling) {
    // 每次改文档都要整篇扫一遍：先看语言再看是否闭合，大部分代码块不是 Mermaid，省掉取子节点和定位行
    if (
      node.name === "FencedCode" &&
      fenceLanguage(state, node) === "mermaid" &&
      isTopLevel(node) &&
      isFenceClosed(state, node)
    ) {
      const { from, to } = lineExtent(state, node);
      blocks.push({ kind: "mermaid", from, to, code: fenceCode(state, node) });
    } else if (node.name === "MathBlock") {
      const { from, to } = lineExtent(state, node);
      const body = state.sliceDoc(from, to).split("\n").slice(1, -1).join("\n");
      blocks.push({ kind: "math", from, to, tex: body });
    }
  }
  return blocks;
}

function isRevealedBlock(state: EditorState, block: BlockInfo): boolean {
  return isEditorFocused(state) && selectionTouches(state, block.from, block.to);
}

function revealKey(state: EditorState, blocks: readonly BlockInfo[]): string {
  return blocks.map((block) => (isRevealedBlock(state, block) ? "1" : "0")).join("");
}

function decorate(
  state: EditorState,
  blocks: readonly BlockInfo[],
): { decorations: DecorationSet; atomic: DecorationSet } {
  const out: Range<Decoration>[] = [];
  const atomic: Range<Decoration>[] = [];
  for (const block of blocks) {
    const open = isRevealedBlock(state, block);
    if (block.kind === "mermaid") {
      // 露出时源码由行装饰显示，图放在源码下方；平时整块替换成图
      if (open)
        out.push(
          Decoration.widget({ block: true, side: 1, widget: new MermaidWidget(block.code, "below") }).range(block.to),
        );
      else {
        const range = Decoration.replace({ block: true, widget: new MermaidWidget(block.code, "replace") }).range(
          block.from,
          block.to,
        );
        out.push(range);
        atomic.push(range);
      }
    } else if (!open) {
      const widget =
        block.kind === "frontmatter"
          ? new FrontmatterWidget(parseFrontmatter(block.source))
          : new MathWidget(block.tex, true);
      const range = Decoration.replace({ block: true, widget }).range(block.from, block.to);
      out.push(range);
      atomic.push(range);
    }
  }
  return { decorations: Decoration.set(out, true), atomic: Decoration.set(atomic, true) };
}

export interface BlockFieldValue {
  blocks: readonly BlockInfo[];
  revealKey: string;
  decorations: DecorationSet;
  atomic: DecorationSet;
  /** 组字期间跳过了重算，下一次更新必须整体重算 */
  stale: boolean;
}

function build(state: EditorState): BlockFieldValue {
  const blocks = collectBlocks(state);
  return { blocks, revealKey: revealKey(state, blocks), ...decorate(state, blocks), stale: false };
}

function isComposing(tr: Transaction): boolean {
  return tr.isUserEvent("input.type.compose");
}

export const blockField = StateField.define<BlockFieldValue>({
  create: build,
  update(value, tr) {
    const state = tr.state;
    const structureChanged = tr.docChanged || syntaxTree(tr.startState) !== syntaxTree(state);
    if (structureChanged) {
      if (tr.docChanged && isComposing(tr)) {
        return {
          ...value,
          decorations: value.decorations.map(tr.changes),
          atomic: value.atomic.map(tr.changes),
          stale: true,
        };
      }
      return build(state);
    }
    if (value.stale) return build(state);
    if (tr.selection || tr.effects.some((effect) => effect.is(setFocusEffect))) {
      const key = revealKey(state, value.blocks);
      if (key !== value.revealKey) return { ...value, revealKey: key, ...decorate(state, value.blocks) };
    }
    return value;
  },
  provide: (field) => [
    EditorView.decorations.from(field, (value) => value.decorations),
    EditorView.atomicRanges.of((view) => view.state.field(field).atomic ?? RangeSet.empty),
  ],
});

/** 当前的块级装饰集合（测试：光标在块外移动时前后是同一个对象）。 */
export function blockDecorations(state: EditorState): DecorationSet {
  return state.field(blockField).decorations;
}
