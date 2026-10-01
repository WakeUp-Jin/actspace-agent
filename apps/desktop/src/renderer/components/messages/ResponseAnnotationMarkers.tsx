import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { ResponseAnnotationReference } from "@actspace/shared";
import { useResponseAnnotations } from "./response-annotation-context";
import { collectAnnotatableText, offsetsToRange, resolveAnnotation } from "./response-annotation-text";

const MARK_SIZE_PX = 16;
/** 圆点压进最后一行顶部的深度：像上标一样贴在最后一个字右上角，不盖住后面的正文。 */
const MARK_RAISE_PX = 11;
const MARK_INSET_PX = 3;
const MARK_MIN_SPACING_PX = 16;
const MARK_CLASS =
  "pointer-events-auto absolute grid size-4 place-items-center rounded-act-pill bg-annotation-mark p-0 text-act-xxs font-semibold leading-none text-on-annotation-mark tabular-nums ring-2 ring-surface transition-transform duration-(--motion-fast) hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring motion-reduce:transition-none";

/** 一条草稿批注和它在 Composer 卡片里的序号（从 1 开始，跨回复连续编号）。 */
export type DraftAnnotationMark = { annotation: ResponseAnnotationReference; label: number };

type MarkPosition = { annotationId: string; label: number; top: number; left: number };

/**
 * 草稿批注在回复里的编号圆点层。坐标以铺满内容容器的 layer 为基准，
 * 圆点放在原文最后一行的右上角；定位不上的草稿不画。点圆点重新打开该条的评论框。
 * 测量用 layer 自己的 ref：React 按后序挂 ref，layout effect 运行时外层容器的 ref 还没挂上。
 */
export function ResponseAnnotationMarkers({
  rootRef,
  marks,
}: {
  rootRef: RefObject<HTMLElement | null>;
  marks: readonly DraftAnnotationMark[];
}) {
  const context = useResponseAnnotations();
  const layerRef = useRef<HTMLDivElement | null>(null);
  const [positions, setPositions] = useState<readonly MarkPosition[]>([]);

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
      const placed: MarkPosition[] = [];
      for (const { annotation, label } of marks) {
        const resolution = resolveAnnotation(model, annotation);
        const range = resolution.status === "resolved" ? offsetsToRange(model, resolution.start, resolution.end) : null;
        if (!range || typeof range.getClientRects !== "function") continue;
        const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0);
        const last = rects[rects.length - 1];
        if (!last) continue;
        placed.push({
          annotationId: annotation.annotationId,
          label,
          top: last.top - layerRect.top - MARK_RAISE_PX,
          left: last.right - layerRect.left - MARK_INSET_PX,
        });
      }
      placed.sort((a, b) => a.top - b.top || a.left - b.left);
      // 量不到宽度（未布局）时不做右缘限制。
      const maxLeft = layerRect.width > MARK_SIZE_PX ? layerRect.width - MARK_SIZE_PX : Number.POSITIVE_INFINITY;
      for (const [index, current] of placed.entries()) {
        const previous = placed[index - 1];
        // 两段原文在同一行附近结束：向右错开，不叠在一起。
        if (previous && Math.abs(current.top - previous.top) < MARK_SIZE_PX && current.left - previous.left < MARK_MIN_SPACING_PX) {
          current.top = previous.top;
          current.left = previous.left + MARK_MIN_SPACING_PX;
        }
        current.left = Math.min(current.left, maxLeft);
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
  }, [marks, rootRef]);

  if (!context) return null;
  return (
    <div ref={layerRef} className="pointer-events-none absolute inset-0" data-annotation-exclude>
      {positions.map((position) => (
        <button
          key={position.annotationId}
          type="button"
          className={MARK_CLASS}
          style={{ top: position.top, left: position.left }}
          aria-label={`批注 ${position.label}，编辑评论`}
          data-annotation-mark={position.annotationId}
          onClick={() => context.setEditingAnnotationId(position.annotationId)}
        >
          {position.label}
        </button>
      ))}
    </div>
  );
}
