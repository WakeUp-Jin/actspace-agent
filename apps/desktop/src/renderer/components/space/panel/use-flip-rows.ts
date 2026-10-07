import { useLayoutEffect, useRef, useState, type RefObject } from "react";

/** 一次测量：行 id → 顶边位置（px） */
export type RowTops = Readonly<Record<string, number>>;

/** 位移小于这个值不动画，免得亚像素抖动 */
export const FLIP_MIN_DELTA = 0.5;

/** 两次测量之间每行要补的位移（旧位置 − 新位置）；两边都有且移动了才算 */
export function flipDeltas(before: RowTops, after: RowTops): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of Object.keys(after)) {
    if (!(id in before)) continue;
    const dy = before[id] - after[id];
    if (Math.abs(dy) >= FLIP_MIN_DELTA) out[id] = dy;
  }
  return out;
}

/** 这次新出现的行（旧测量里没有） */
export function freshRowIds(before: RowTops, after: RowTops): string[] {
  return Object.keys(after).filter((id) => !(id in before));
}

function collect(root: HTMLElement): { tops: Record<string, number>; els: Record<string, HTMLElement> } {
  const tops: Record<string, number> = {};
  const els: Record<string, HTMLElement> = {};
  root.querySelectorAll<HTMLElement>("[data-row]").forEach((el) => {
    const id = el.dataset.row as string;
    tops[id] = el.getBoundingClientRect().top;
    els[id] = el;
  });
  return { tops, els };
}

/**
 * 分组变化（rowsRevision 加一）时让行平滑移动：先把行放回旧位置，下一帧回落（.space-row-flip 提供过渡）。
 * 返回这次新出现的行 id，调用方给它们加 `space-row-fresh`。第一次渲染不做动画。
 */
export function useFlipRows(rootRef: RefObject<HTMLElement>, revision: number): ReadonlySet<string> {
  const last = useRef<{ revision: number; tops: RowTops } | null>(null);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set());

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const { tops, els } = collect(root);
    const prev = last.current;
    last.current = { revision, tops };
    if (!prev || prev.revision === revision) return;

    const moved = Object.entries(flipDeltas(prev.tops, tops));
    for (const [id, dy] of moved) {
      els[id].style.transition = "none";
      els[id].style.transform = `translateY(${dy}px)`;
    }
    if (moved.length) {
      void root.offsetHeight; // 强制回流，让「放回旧位置」先生效
      for (const [id] of moved) {
        els[id].style.transition = "";
        els[id].style.transform = "";
      }
    }
    setFresh(new Set(freshRowIds(prev.tops, tops)));
  });

  return fresh;
}
