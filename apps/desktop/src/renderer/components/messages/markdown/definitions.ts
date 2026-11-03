import { normalizeLabel, type MarkdownBlock } from "../markdown-blocks";

/**
 * 脚注与引用式链接定义的全局化（规范 §8.2）。
 * 定义可以出现在回复的任何位置，但每块是单独解析的，所以：
 * - 定义自己是一个块（`block.definition`），不显示；
 * - 块引用了哪些定义，就把这些定义追加到该块源码末尾再解析（见 `blockDefs`）；
 * - 每块自己生成的脚注区都去掉，整条回复只在最后渲染一次（见 `footnotes`），编号按全文第一次被引用的顺序。
 *
 * 脚注在块里只需要“定义存在”，所以追加的是占位定义 `[^x]: .`：脚注内容（可能还在流式写）变化时，
 * 引用它的块不用跟着重渲染；链接定义要带上地址，追加完整的定义。
 */

export type FootnoteSection = {
  /** 按全文首次被引用的顺序排列的脚注标签（原始写法）。 */
  readonly labels: readonly string[];
  /** 渲染脚注区用的 Markdown：先引用，再定义。 */
  readonly source: string;
};

export type DefinitionIndex = {
  /** 与 blocks 一一对应：该块要追加的定义文本，没有为空串。定义块自己也是空串。 */
  readonly blockDefs: readonly string[];
  /** 脚注标识（规范化后转小写）→ 编号。 */
  readonly footnoteNumbers: ReadonlyMap<string, number>;
  readonly footnotes: FootnoteSection | null;
};

type BlockRefs = { footnotes: readonly string[]; labels: readonly string[] };

const EMPTY_INDEX: DefinitionIndex = { blockDefs: [], footnoteNumbers: new Map(), footnotes: null };
const FENCE_START = /^\s*(?:`{3,}|~{3,})/;
const INLINE_CODE = /(`+)[\s\S]*?\1/g;
const FOOTNOTE_REF = /\[\^([^\]\s]+)\]/g;
const LABEL_REF = /\[((?:[^[\]\\]|\\.)+)\]/g;

const refsCache = new WeakMap<MarkdownBlock, BlockRefs>();

/** 块里出现的脚注引用和 `[label]` 写法（按块缓存：冻结块只扫一次）。围栏代码块和行内代码里的不算。 */
function scanRefs(block: MarkdownBlock): BlockRefs {
  const cached = refsCache.get(block);
  if (cached) return cached;
  const footnotes: string[] = [];
  const labels: string[] = [];
  if (!FENCE_START.test(block.source)) {
    const text = block.source.replace(INLINE_CODE, "");
    for (const match of text.matchAll(FOOTNOTE_REF)) footnotes.push(normalizeLabel(match[1]));
    for (const match of text.matchAll(LABEL_REF)) {
      if (!match[1].startsWith("^")) labels.push(normalizeLabel(match[1]));
    }
  }
  const refs = { footnotes, labels };
  refsCache.set(block, refs);
  return refs;
}

/** 脚注引用的 href（`#<前缀>fn-<标识>`）还原成编号表的 key；不是脚注引用返回 null。 */
export function footnoteKeyFromHref(href: string | undefined, prefix: string): string | null {
  const marker = `#${prefix}fn-`;
  if (!href?.startsWith(marker)) return null;
  try { return decodeURIComponent(href.slice(marker.length)).toLowerCase(); } catch { return null; }
}

export function collectDefinitions(blocks: readonly MarkdownBlock[]): DefinitionIndex {
  if (blocks.length === 0) return EMPTY_INDEX;
  const linkDefs = new Map<string, string>();
  const footnoteDefs = new Map<string, { label: string; source: string }>();
  for (const block of blocks) {
    const definition = block.definition;
    if (!definition) continue;
    if (definition.kind === "link") {
      if (!linkDefs.has(definition.id)) linkDefs.set(definition.id, block.source.trim());
    } else if (!footnoteDefs.has(definition.id)) {
      footnoteDefs.set(definition.id, { label: definition.label, source: block.source.trim() });
    }
  }
  if (linkDefs.size === 0 && footnoteDefs.size === 0) return { ...EMPTY_INDEX, blockDefs: blocks.map(() => "") };

  const order: string[] = [];
  const blockDefs = blocks.map((block) => {
    if (block.definition) return "";
    const refs = scanRefs(block);
    const lines: string[] = [];
    const seen = new Set<string>();
    for (const id of refs.labels) {
      const source = linkDefs.get(id);
      if (source !== undefined && !seen.has(id)) {
        seen.add(id);
        lines.push(source);
      }
    }
    const usedFootnotes = new Set<string>();
    for (const id of refs.footnotes) {
      const definition = footnoteDefs.get(id);
      if (!definition || usedFootnotes.has(id)) continue;
      usedFootnotes.add(id);
      lines.push(`[^${definition.label}]: .`);
      if (!order.includes(id)) order.push(id);
    }
    return lines.join("\n");
  });

  const footnoteNumbers = new Map(order.map((id, index) => [id.toLowerCase(), index + 1] as const));
  if (order.length === 0) return { blockDefs, footnoteNumbers, footnotes: null };
  const labels = order.map((id) => footnoteDefs.get(id)!.label);
  const source = `${labels.map((label) => `[^${label}]`).join(" ")}\n\n${order.map((id) => footnoteDefs.get(id)!.source).join("\n\n")}`;
  return { blockDefs, footnoteNumbers, footnotes: { labels, source } };
}
