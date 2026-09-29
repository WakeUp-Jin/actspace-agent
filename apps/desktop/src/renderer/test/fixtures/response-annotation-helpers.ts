import type { ResponseAnnotationReference } from "@actspace/shared";

/** 在 root 内找到包含 needle 的文本节点，返回 needle 起点（或终点）对应的 DOM 位置。 */
export function textPoint(root: Node, needle: string, edge: "start" | "end" = "start"): [Text, number] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const index = (node as Text).data.indexOf(needle);
    if (index >= 0) return [node as Text, edge === "start" ? index : index + needle.length];
  }
  throw new Error(`text not found: ${needle}`);
}

/** 用原生 Selection 选中 from 起点到 to 终点，并像浏览器一样派发 selectionchange。 */
export function selectText(root: Node, from: string, to: string = from, toRoot: Node = root): Range {
  const range = document.createRange();
  range.setStart(...textPoint(root, from, "start"));
  range.setEnd(...textPoint(toRoot, to, "end"));
  const selection = document.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  document.dispatchEvent(new Event("selectionchange"));
  return range;
}

export function clearSelection() {
  document.getSelection()?.removeAllRanges();
  document.dispatchEvent(new Event("selectionchange"));
}

/** jsdom 不做布局，Range 没有矩形。给所有 Range 一个固定矩形，返回还原函数。 */
export function stubRangeRects(rect: { top: number; left: number; width: number; height: number } = { top: 200, left: 100, width: 120, height: 18 }) {
  const domRect = { ...rect, x: rect.left, y: rect.top, right: rect.left + rect.width, bottom: rect.top + rect.height, toJSON: () => rect } as DOMRect;
  const proto = Range.prototype as unknown as Record<string, unknown>;
  const originalBounding = proto.getBoundingClientRect;
  const originalRects = proto.getClientRects;
  proto.getBoundingClientRect = () => domRect;
  proto.getClientRects = () => Object.assign([domRect], { item: (index: number) => (index === 0 ? domRect : null) });
  return () => {
    proto.getBoundingClientRect = originalBounding;
    proto.getClientRects = originalRects;
  };
}

export function makeAnnotation(overrides: Partial<ResponseAnnotationReference> = {}): ResponseAnnotationReference {
  return {
    annotationId: "ann_fixture_1",
    assistantMessageId: "v2-1",
    selectedText: "第二段",
    startOffset: 6,
    endOffset: 9,
    prefixContext: "第一段内容\n",
    suffixContext: "的正文",
    ...overrides,
  };
}
