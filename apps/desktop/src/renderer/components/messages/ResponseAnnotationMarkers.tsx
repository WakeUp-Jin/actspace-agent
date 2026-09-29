import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { MAX_MARKERS_PER_REPLY, useResponseAnnotations, type SentResponseAnnotation } from "./response-annotation-context";
import { ResponseAnnotationPopover } from "./ResponseAnnotationPopover";
import { collectAnnotatableText, offsetsToRange, resolveAnnotation, type AnnotatableText } from "./response-annotation-text";

const MARKER_SIZE_PX = 16;
const MARKER_GAP_PX = 2;
const MARKER_MIN_SPACING_PX = 20;
const HIGHLIGHT_NAME = "act-annotation";

type MarkerPosition = { annotationId: string; top: number; left: number };

type HighlightRegistry = { set: (name: string, highlight: unknown) => void; delete: (name: string) => boolean };

function highlightRegistry(): { registry: HighlightRegistry; Highlight: new (...ranges: Range[]) => unknown } | null {
  const registry = (globalThis.CSS as unknown as { highlights?: HighlightRegistry } | undefined)?.highlights;
  const Highlight = (globalThis as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
  return registry && Highlight ? { registry, Highlight } : null;
}

/**
 * 选区最后一行的行尾 x：选区停在行中间时，marker 放在选区右侧会压住后面的正文，
 * 所以取「选区终点到所在块末尾」这段文字里与最后一行同一行的最右边。
 */
function lineEndRight(range: Range, last: DOMRect): number {
  const block = (range.endContainer.nodeType === Node.ELEMENT_NODE ? range.endContainer as Element : range.endContainer.parentElement)
    ?.closest("p, h1, h2, h3, h4, h5, h6, li, blockquote, td, th");
  if (!block) return last.right;
  const tail = range.cloneRange();
  tail.setEndAfter(block.lastChild ?? block);
  tail.setStart(range.endContainer, range.endOffset);
  const middle = last.top + last.height / 2;
  let right = last.right;
  for (const rect of Array.from(tail.getClientRects())) {
    if (rect.width > 0 && rect.top <= middle && rect.bottom >= middle) right = Math.max(right, rect.right);
  }
  return right;
}

function resolvedRange(model: AnnotatableText, item: SentResponseAnnotation): Range | null {
  const resolution = resolveAnnotation(model, item.annotation);
  return resolution.status === "resolved" ? offsetsToRange(model, resolution.start, resolution.end) : null;
}

/**
 * 回复内容容器里的绝对定位 marker 层。坐标以铺满内容容器的 layer 为基准：marker 放在选区最后一行的行尾，
 * 同一行有多个时向右排开（向下顺延会压到下一行正文）。定位不上的批注不画，只把结果报给 context。
 * 测量用 layer 自己的 ref：React 按后序挂 ref，layout effect 运行时外层容器的 ref 还没挂上。
 */
export function ResponseAnnotationMarkers({
  rootRef,
  annotations,
}: {
  rootRef: RefObject<HTMLElement | null>;
  annotations: readonly SentResponseAnnotation[];
}) {
  const context = useResponseAnnotations();
  const contextRef = useRef(context);
  contextRef.current = context;
  const layerRef = useRef<HTMLDivElement | null>(null);
  const [positions, setPositions] = useState<readonly MarkerPosition[]>([]);
  const activeId = context?.activeAnnotationId ?? null;
  const activeItem = annotations.find((item) => item.annotation.annotationId === activeId);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const layer = layerRef.current;
    const container = layer?.parentElement;
    if (!root || !layer || !container) return;
    let frame: number | null = null;
    const measure = () => {
      frame = null;
      const model = collectAnnotatableText(root);
      const layerRect = layer.getBoundingClientRect();
      const placed: MarkerPosition[] = [];
      for (const [index, item] of annotations.entries()) {
        const range = resolvedRange(model, item);
        contextRef.current?.reportResolution(item.annotation.annotationId, range !== null);
        if (!range || index >= MAX_MARKERS_PER_REPLY || typeof range.getClientRects !== "function") continue;
        const rects = range.getClientRects();
        const last = rects[rects.length - 1];
        if (!last) continue;
        placed.push({
          annotationId: item.annotation.annotationId,
          top: last.top - layerRect.top + (last.height - MARKER_SIZE_PX) / 2,
          left: lineEndRight(range, last) - layerRect.left + MARKER_GAP_PX,
        });
      }
      placed.sort((a, b) => a.top - b.top || a.left - b.left);
      // 量不到宽度（未布局）时不做右缘限制。
      const maxLeft = layerRect.width > MARKER_SIZE_PX ? layerRect.width - MARKER_SIZE_PX : Number.POSITIVE_INFINITY;
      for (const [index, current] of placed.entries()) {
        const previous = placed[index - 1];
        // 行距小于 marker 间距，视为同一行：对齐到同一行，并排在上一个右边。
        if (previous && current.top - previous.top < MARKER_MIN_SPACING_PX) {
          current.top = previous.top;
          current.left = Math.max(current.left, previous.left + MARKER_MIN_SPACING_PX);
        }
        // 窄窗里行尾已贴近容器右缘：不越界，贴着右缘向下排。
        if (current.left > maxLeft) {
          if (previous && Math.abs(current.top - previous.top) < MARKER_MIN_SPACING_PX && maxLeft - previous.left < MARKER_MIN_SPACING_PX) {
            current.top = previous.top + MARKER_MIN_SPACING_PX;
          }
          current.left = maxLeft;
        }
      }
      setPositions(placed);
    };
    const schedule = () => {
      if (frame === null) frame = window.requestAnimationFrame(measure);
    };
    measure();
    const observer = new ResizeObserver(schedule);
    observer.observe(container);
    window.addEventListener("resize", schedule);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [annotations, rootRef]);

  // 选中态：用 Custom Highlight API 高亮原文，不改 DOM；点击回复外部或 Escape 清除。
  useEffect(() => {
    const root = rootRef.current;
    if (!activeItem || !root) return;
    const highlights = highlightRegistry();
    const range = resolvedRange(collectAnnotatableText(root), activeItem);
    if (highlights && range) highlights.registry.set(HIGHLIGHT_NAME, new highlights.Highlight(range));
    const clear = () => contextRef.current?.setActiveAnnotationId(null);
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && layerRef.current?.parentElement?.contains(target)) return;
      if (target instanceof Element && target.closest("[role='dialog']")) return;
      clear();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") clear();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      if (highlights && range) highlights.registry.delete(HIGHLIGHT_NAME);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeItem, rootRef]);

  if (!context) return null;
  const byId = new Map(annotations.map((item) => [item.annotation.annotationId, item]));
  return (
    <div ref={layerRef} className="pointer-events-none absolute inset-0" data-annotation-exclude>
      {positions.map((position) => {
        const item = byId.get(position.annotationId);
        if (!item) return null;
        return (
          <ResponseAnnotationPopover
            key={position.annotationId}
            item={item}
            active={position.annotationId === activeId}
            style={{ top: position.top, left: position.left }}
            onSelect={() => context.setActiveAnnotationId(position.annotationId)}
            onCopyToDraft={context.onCopyToDraft}
          />
        );
      })}
    </div>
  );
}
