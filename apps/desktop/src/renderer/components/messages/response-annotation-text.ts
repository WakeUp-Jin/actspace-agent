import { COMPOSER_REFERENCE_LIMITS, type ResponseAnnotationReference } from "@actspace/shared";

/**
 * 回复「可批注可见文本」：只收录段落、标题、列表项、引用和表格单元格里的文字，
 * 代码块和显式排除的节点不参与；相邻两个不同块之间插入一个虚拟 `\n`。
 * 批注偏移以这里拼出的 text 的 UTF-16 下标计。纯 DOM 函数，不依赖 React。
 */
export type AnnotatableText = {
  text: string;
  segments: AnnotatableSegment[];
};

export type AnnotatableSegment = { node: Text; start: number; end: number };

export type AnnotationResolution =
  | { status: "resolved"; start: number; end: number }
  | { status: "unresolved" };

const TEXT_BLOCK_SELECTOR = "p, h1, h2, h3, h4, h5, h6, li, blockquote, td, th";
const EXCLUDED_SELECTOR = "pre, .markdown-code-shell, [data-annotation-exclude]";
const BLOCK_LIKE_TAGS = new Set(["P", "UL", "OL", "LI", "BLOCKQUOTE", "PRE", "DIV", "TABLE", "THEAD", "TBODY", "TR", "TD", "TH", "H1", "H2", "H3", "H4", "H5", "H6", "HR"]);
const CONTEXT_CODE_UNITS = COMPOSER_REFERENCE_LIMITS.maxContextCodeUnits;

export function collectAnnotatableText(root: HTMLElement): AnnotatableText {
  const segments: AnnotatableSegment[] = [];
  let text = "";
  let previousBlock: Element | null = null;
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let current = walker.nextNode(); current; current = walker.nextNode()) {
    const node = current as Text;
    const value = node.data;
    if (!value || isLayoutWhitespace(node)) continue;
    const parent = node.parentElement;
    if (!parent || parent.closest(EXCLUDED_SELECTOR)) continue;
    const block = parent.closest(TEXT_BLOCK_SELECTOR);
    if (!block || !root.contains(block)) continue;
    if (previousBlock && previousBlock !== block) text += "\n";
    previousBlock = block;
    segments.push({ node, start: text.length, end: text.length + value.length });
    text += value;
  }
  return { text, segments };
}

/** 选区映射为偏移；端点落在未收录的文字里、或选区跨过代码块等排除节点时返回 null。首尾空白会被收缩掉。 */
export function rangeToOffsets(model: AnnotatableText, range: Range, root: HTMLElement): { start: number; end: number } | null {
  if (range.collapsed || model.segments.length === 0) return null;
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  for (const excluded of Array.from(root.querySelectorAll(EXCLUDED_SELECTOR))) {
    if (range.intersectsNode(excluded)) return null;
  }
  const start = boundaryToIndex(model, range.startContainer, range.startOffset, "start");
  const end = boundaryToIndex(model, range.endContainer, range.endOffset, "end");
  if (start === null || end === null) return null;
  let trimmedStart = start;
  let trimmedEnd = end;
  while (trimmedStart < trimmedEnd && /\s/u.test(model.text[trimmedStart]!)) trimmedStart += 1;
  while (trimmedEnd > trimmedStart && /\s/u.test(model.text[trimmedEnd - 1]!)) trimmedEnd -= 1;
  return trimmedStart < trimmedEnd ? { start: trimmedStart, end: trimmedEnd } : null;
}

export function offsetsToRange(model: AnnotatableText, start: number, end: number): Range | null {
  if (start < 0 || end > model.text.length || start >= end) return null;
  // 起点落在块间虚拟 \n 上时移到下一段开头；终点落在块间时收到上一段末尾。
  const startSegment = model.segments.find((segment) => start < segment.end && segment.end > segment.start && start >= segment.start)
    ?? model.segments.find((segment) => segment.start >= start);
  const endSegment = [...model.segments].reverse().find((segment) => end > segment.start && end <= segment.end)
    ?? [...model.segments].reverse().find((segment) => segment.end <= end);
  if (!startSegment || !endSegment) return null;
  const range = startSegment.node.ownerDocument.createRange();
  range.setStart(startSegment.node, Math.max(0, start - startSegment.start));
  range.setEnd(endSegment.node, Math.min(endSegment.node.data.length, end - endSegment.start));
  return range.collapsed ? null : range;
}

export function createAnnotationDraft(model: AnnotatableText, start: number, end: number, assistantMessageId: string): ResponseAnnotationReference {
  return {
    annotationId: createAnnotationId(),
    assistantMessageId,
    selectedText: model.text.slice(start, end),
    startOffset: start,
    endOffset: end,
    prefixContext: trimLeadingLowSurrogate(model.text.slice(Math.max(0, start - CONTEXT_CODE_UNITS), start)),
    suffixContext: trimTrailingHighSurrogate(model.text.slice(end, end + CONTEXT_CODE_UNITS)),
  };
}

export function createAnnotationId(): string {
  return `ann_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 偏移仍对得上就直接用；否则按「前文 + 原文 + 后文」找唯一出现位置；0 个或多个都算 unresolved，绝不猜位置。 */
export function resolveAnnotation(model: AnnotatableText, annotation: Pick<ResponseAnnotationReference, "selectedText" | "startOffset" | "endOffset" | "prefixContext" | "suffixContext">): AnnotationResolution {
  const { selectedText, startOffset, endOffset, prefixContext, suffixContext } = annotation;
  if (model.text.slice(startOffset, endOffset) === selectedText) return { status: "resolved", start: startOffset, end: endOffset };
  const needle = `${prefixContext}${selectedText}${suffixContext}`;
  const first = model.text.indexOf(needle);
  if (first < 0 || model.text.indexOf(needle, first + 1) >= 0) return { status: "unresolved" };
  const start = first + prefixContext.length;
  return { status: "resolved", start, end: start + selectedText.length };
}

function boundaryToIndex(model: AnnotatableText, container: Node, offset: number, edge: "start" | "end"): number | null {
  if (container.nodeType === Node.TEXT_NODE) {
    const segment = model.segments.find((candidate) => candidate.node === container);
    if (segment) return segment.start + Math.min(offset, segment.node.data.length);
    if (!isLayoutWhitespace(container as Text)) return null;
  }
  // 端点在元素或排版空白上：取它之后第一个（start）/之前最后一个（end）收录的文字。
  const point = container.ownerDocument!.createRange();
  point.setStart(container, offset);
  if (edge === "start") {
    const next = model.segments.find((segment) => point.comparePoint(segment.node, segment.node.data.length) > 0);
    return next ? next.start : null;
  }
  const previous = [...model.segments].reverse().find((segment) => point.comparePoint(segment.node, 0) < 0);
  return previous ? previous.end : null;
}

/** react-markdown 在块元素之间留下的换行文本节点：只有空白，且挨着块级元素。 */
function isLayoutWhitespace(node: Text): boolean {
  if (!/^\s*$/u.test(node.data)) return false;
  const siblings = [node.previousSibling, node.nextSibling];
  return siblings.some((sibling) => sibling instanceof Element && BLOCK_LIKE_TAGS.has(sibling.tagName))
    || (node.parentElement !== null && !node.parentElement.closest(TEXT_BLOCK_SELECTOR));
}

function trimLeadingLowSurrogate(value: string): string {
  const first = value.charCodeAt(0);
  return first >= 0xdc00 && first <= 0xdfff ? value.slice(1) : value;
}

function trimTrailingHighSurrogate(value: string): string {
  const last = value.charCodeAt(value.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? value.slice(0, -1) : value;
}
