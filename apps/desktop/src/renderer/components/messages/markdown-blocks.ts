import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";

/**
 * 流式回复的 Markdown 分块（参考 DSH 的 IncrementalMarkdownParser）：
 * 按顶层块切开，除最后两块外全部冻结；内容只在末尾追加时，冻结块原样复用，只重新解析尾部。
 * 每块的源码从上一块的结束位置切到本块结束位置，拼起来就是原文，块之间的空行留在后一块开头。
 * 引用式链接定义和脚注定义自己是一个块，带上 `definition`；引用它们的块怎么拿到定义见 markdown/definitions.ts。
 */

/** 顶层的引用式链接定义（`[x]: url`）或脚注定义（`[^x]: …`）：自己不显示，由引用它的块带上。 */
export type BlockDefinition = {
  readonly kind: "link" | "footnote";
  /** 规范化后的标识（大小写、空白归一），引用方按它匹配。 */
  readonly id: string;
  /** 定义里写的原始标签。 */
  readonly label: string;
};

export type MarkdownBlock = {
  /** 在整条消息里的起始偏移，同时作为渲染 key。 */
  readonly start: number;
  readonly source: string;
  /** 冻结块后续不会再变。 */
  readonly frozen: boolean;
  readonly definition?: BlockDefinition;
};

export type MarkdownBlockSplit = {
  readonly content: string;
  readonly blocks: readonly MarkdownBlock[];
};

/** gfm 扩展只建一次：每次调用 gfm() / gfmFromMarkdown() 都会重新合并一整套语法扩展（规范 front-流式Markdown解析降频规范.md §3.3）。 */
const PARSE_OPTIONS = { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] };

/** 保留的未冻结块数：最后一块可能还在写，倒数第二块可能被后续内容改写（如 setext 标题、列表续行）。 */
const LIVE_BLOCK_COUNT = 2;

type TopLevelNode = { end: number; definition?: BlockDefinition };

export function splitMarkdownBlocks(content: string, previous?: MarkdownBlockSplit): MarkdownBlockSplit {
  if (previous?.content === content) return previous;
  if (content.length === 0) return { content, blocks: [] };

  const reusable = previous && content.startsWith(previous.content) ? frozenPrefix(previous.blocks) : [];
  const from = reusable.length > 0 ? end(reusable[reusable.length - 1]) : 0;
  const nodes = topLevelNodes(content.slice(from));

  const tail: { start: number; source: string; definition?: BlockDefinition }[] = [];
  let cursor = from;
  for (const node of nodes) {
    const cut = from + node.end;
    if (cut <= cursor) continue;
    tail.push({ start: cursor, source: content.slice(cursor, cut), ...(node.definition ? { definition: node.definition } : {}) });
    cursor = cut;
  }
  if (cursor < content.length) {
    // 末尾只剩空白时并进最后一块，避免出现空块。
    const last = tail.pop();
    tail.push(last ? { ...last, source: last.source + content.slice(cursor) } : { start: cursor, source: content.slice(cursor) });
  }

  const freezeBefore = Math.max(0, tail.length - LIVE_BLOCK_COUNT);
  const blocks = [
    ...reusable,
    ...tail.map((block, index) => reuse(previous, { ...block, frozen: index < freezeBefore })),
  ];
  return { content, blocks };
}

function frozenPrefix(blocks: readonly MarkdownBlock[]): readonly MarkdownBlock[] {
  const index = blocks.findIndex((block) => !block.frozen);
  return index === -1 ? blocks : blocks.slice(0, index);
}

function end(block: MarkdownBlock): number {
  return block.start + block.source.length;
}

/** 内容没变的块沿用上一次的对象，渲染层的 memo 才能跳过它。 */
function reuse(previous: MarkdownBlockSplit | undefined, block: MarkdownBlock): MarkdownBlock {
  const prior = previous?.blocks.find((candidate) => candidate.start === block.start);
  return prior && prior.source === block.source && prior.frozen === block.frozen ? prior : block;
}

type DefinitionNode = { type: string; identifier?: string; label?: string | null };

function definitionOf(node: DefinitionNode): BlockDefinition | undefined {
  if ((node.type !== "definition" && node.type !== "footnoteDefinition") || !node.identifier) return undefined;
  return { kind: node.type === "definition" ? "link" : "footnote", id: normalizeLabel(node.identifier), label: node.label ?? node.identifier };
}

/** 标签规范化：空白折叠、忽略大小写（与 micromark 一致），引用方和定义方都按它比较。 */
export function normalizeLabel(label: string): string {
  return label.replace(/[\t\n\r ]+/g, " ").trim().toLowerCase().toUpperCase();
}

function topLevelNodes(markdown: string): TopLevelNode[] {
  const tree = fromMarkdown(markdown, PARSE_OPTIONS);
  return tree.children.flatMap((node) => {
    const end = node.position?.end.offset;
    if (end === undefined) return [];
    const definition = definitionOf(node as DefinitionNode);
    return [definition ? { end, definition } : { end }];
  });
}
