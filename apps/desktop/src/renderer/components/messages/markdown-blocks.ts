import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";

/**
 * 流式回复的 Markdown 分块（参考 DSH 的 IncrementalMarkdownParser）：
 * 按顶层块切开，除最后两块外全部冻结；内容只在末尾追加时，冻结块原样复用，只重新解析尾部。
 * 每块的源码从上一块的结束位置切到本块结束位置，拼起来就是原文，块之间的空行留在后一块开头。
 * 引用式链接定义和脚注会跨块生效，出现时整条消息退回成一块。
 */

export type MarkdownBlock = {
  /** 在整条消息里的起始偏移，同时作为渲染 key。 */
  readonly start: number;
  readonly source: string;
  /** 冻结块后续不会再变。 */
  readonly frozen: boolean;
};

export type MarkdownBlockSplit = {
  readonly content: string;
  readonly blocks: readonly MarkdownBlock[];
};

/** 保留的未冻结块数：最后一块可能还在写，倒数第二块可能被后续内容改写（如 setext 标题、列表续行）。 */
const LIVE_BLOCK_COUNT = 2;
const CROSS_BLOCK_SYNTAX = /^ {0,3}\[[^\]\n]+\]:|\[\^[^\]\n]+\]/m;

export function splitMarkdownBlocks(content: string, previous?: MarkdownBlockSplit): MarkdownBlockSplit {
  if (previous?.content === content) return previous;
  if (content.length === 0 || CROSS_BLOCK_SYNTAX.test(content)) return single(content);

  const reusable = previous && content.startsWith(previous.content) ? frozenPrefix(previous.blocks) : [];
  const from = reusable.length > 0 ? end(reusable[reusable.length - 1]) : 0;
  const cuts = topLevelEnds(content.slice(from)).map((offset) => from + offset);

  const tail: { start: number; source: string }[] = [];
  let cursor = from;
  for (const cut of cuts) {
    if (cut <= cursor) continue;
    tail.push({ start: cursor, source: content.slice(cursor, cut) });
    cursor = cut;
  }
  if (cursor < content.length) {
    // 末尾只剩空白时并进最后一块，避免出现空块。
    const last = tail.pop();
    tail.push(last ? { start: last.start, source: last.source + content.slice(cursor) } : { start: cursor, source: content.slice(cursor) });
  }

  const freezeBefore = Math.max(0, tail.length - LIVE_BLOCK_COUNT);
  const blocks = [
    ...reusable,
    ...tail.map((block, index) => reuse(previous, { ...block, frozen: index < freezeBefore })),
  ];
  return { content, blocks };
}

function single(content: string): MarkdownBlockSplit {
  return { content, blocks: content.length === 0 ? [] : [{ start: 0, source: content, frozen: false }] };
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

function topLevelEnds(markdown: string): number[] {
  const tree = fromMarkdown(markdown, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });
  return tree.children.flatMap((node) => (node.position?.end.offset === undefined ? [] : [node.position.end.offset]));
}
