import type { MarkdownBlock } from "../markdown-blocks";

/**
 * `<details>` 这类成对的 HTML 里常有空行，会被顶层分块切到不同块里（规范 §8.1）：
 * 遇到以 `<details` 开头、嵌套还没闭合的块，把后面的块并进来，直到 `</details>` 配平。
 * 只看以 `<details` 开头的块：段落或代码里提到 `<details>` 不算，否则后面所有块都会被吞进来。
 * 没配平时（流式中 `</details>` 还没到）一直并到末尾，这和 HTML 的真实语义一致。
 */

const DETAILS_START = /^\s*<details[\s>]/i;
const DETAILS_OPEN = /<details[\s>]/gi;
const DETAILS_CLOSE = /<\/details\s*>/gi;

function unclosedDepth(source: string): number {
  return (source.match(DETAILS_OPEN)?.length ?? 0) - (source.match(DETAILS_CLOSE)?.length ?? 0);
}

/**
 * previous 是上一次的合并结果：内容没变的合并块沿用旧对象，渲染层的 memo 才能跳过它。
 * 没有 `<details>` 时原样返回输入块（同一批对象）。
 */
export function mergeHtmlBlocks(
  blocks: readonly MarkdownBlock[],
  previous: readonly MarkdownBlock[] = [],
): readonly MarkdownBlock[] {
  const merged: MarkdownBlock[] = [];
  let changed = false;
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    if (!DETAILS_START.test(block.source) || unclosedDepth(block.source) <= 0) {
      merged.push(block);
      continue;
    }
    let source = block.source;
    let frozen = block.frozen;
    while (unclosedDepth(source) > 0 && i + 1 < blocks.length) {
      i += 1;
      source += blocks[i].source;
      frozen = frozen && blocks[i].frozen;
    }
    const candidate: MarkdownBlock = { start: block.start, source, frozen };
    const prior = previous.find(
      (item) => item.start === candidate.start && item.source === source && item.frozen === frozen,
    );
    merged.push(prior ?? candidate);
    changed = true;
  }
  return changed ? merged : blocks;
}
