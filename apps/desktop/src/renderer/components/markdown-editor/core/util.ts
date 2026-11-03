/** core 内部共用的小工具：语法节点、围栏代码块、行范围。 */
import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { SyntaxNode } from "./lezer-types";

/** 节点所在的整行范围：起点是首行行首，终点是末行行尾。块级装饰按整行替换。 */
export function lineExtent(state: EditorState, node: { from: number; to: number }): { from: number; to: number } {
  return { from: state.doc.lineAt(node.from).from, to: state.doc.lineAt(node.to).to };
}

/** 围栏的语言名：信息串的第一个词，没有就是空串。 */
export function fenceLanguage(state: EditorState, node: SyntaxNode): string {
  const info = node.getChild("CodeInfo");
  return info ? state.sliceDoc(info.from, info.to).trim().split(/\s+/, 1)[0].toLowerCase() : "";
}

/**
 * 围栏里的代码原文，不含围栏行。顶层围栏只有一个 CodeText 节点；
 * 引用、列表里的围栏按行拆成多个 CodeText（行间的容器标记不在节点里），拼起来正好是代码本身。
 */
export function fenceCode(state: EditorState, node: SyntaxNode): string {
  return node
    .getChildren("CodeText")
    .map((child) => state.sliceDoc(child.from, child.to))
    .join("");
}

/** 围栏是否闭合：有两个围栏标记，且结束围栏不在开头那一行。 */
export function isFenceClosed(state: EditorState, node: SyntaxNode): boolean {
  return node.getChildren("CodeMark").length >= 2 && state.doc.lineAt(node.to).number > state.doc.lineAt(node.from).number;
}

/** 节点是不是文档最外层的块（块级 widget 只替换最外层的块，容器里的保持普通显示）。 */
export function isTopLevel(node: SyntaxNode): boolean {
  return node.parent?.name === "Document";
}

/** 在某个位置附近找节点，往上走到根：先偏右，再偏左（光标可能正好在节点末尾）。 */
export function* ancestorsAt(state: EditorState, pos: number): Generator<SyntaxNode> {
  const tree = syntaxTree(state);
  const seen = new Set<SyntaxNode>();
  for (const side of [1, -1] as const) {
    for (let node: SyntaxNode | null = tree.resolveInner(pos, side); node; node = node.parent) {
      if (seen.has(node)) continue;
      seen.add(node);
      yield node;
    }
  }
}
