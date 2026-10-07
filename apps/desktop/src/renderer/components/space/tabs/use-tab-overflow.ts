import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export interface TabOverflow {
  /** 放不下，需要「全部标签」菜单 */
  over: boolean;
  /** 左侧有被挡住的标签 */
  fadeLeft: boolean;
  /** 右侧有被挡住的标签 */
  fadeRight: boolean;
}

const REVEAL_MARGIN = 28;
const NONE: TabOverflow = { over: false, fadeLeft: false, fadeRight: false };

/**
 * 标签条的横向滚动：滚轮转横向、`ResizeObserver` 判断溢出、被挡一侧渐隐，
 * 切到看不到的标签时把它滚进视野（只在选中标签变化时，不和手动滚动抢位置）。
 * `signature` 是标签 id 的拼接，增删标签后重新测量。
 */
export function useTabOverflow(activeId: string, signature: string) {
  const stripRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState<TabOverflow>(NONE);
  const shownRef = useRef<string | null>(null);

  const measure = useCallback(() => {
    const el = stripRef.current;
    if (!el) return;
    const over = el.scrollWidth > el.clientWidth + 1;
    const next: TabOverflow = {
      over,
      fadeLeft: over && el.scrollLeft > 1,
      fadeRight: over && el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
    };
    setOverflow((prev) => (prev.over === next.over && prev.fadeLeft === next.fadeLeft && prev.fadeRight === next.fadeRight ? prev : next));
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [measure, signature]);

  useLayoutEffect(() => {
    const el = stripRef.current;
    if (!el || shownRef.current === activeId) return;
    shownRef.current = activeId;
    const tab = Array.from(el.querySelectorAll<HTMLElement>("[data-tab-id]")).find((t) => t.dataset.tabId === activeId);
    if (!tab) return;
    const r = tab.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    if (r.left < b.left + REVEAL_MARGIN) el.scrollLeft -= b.left + REVEAL_MARGIN - r.left;
    else if (r.right > b.right - REVEAL_MARGIN) el.scrollLeft += r.right - (b.right - REVEAL_MARGIN);
    measure();
  }, [activeId, signature, measure]);

  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      el.scrollLeft += event.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [measure, signature]);

  /** 打开菜单时用：哪些标签现在完整出现在条里。 */
  const visibleIds = useCallback((): Set<string> => {
    const el = stripRef.current;
    const seen = new Set<string>();
    if (!el) return seen;
    const b = el.getBoundingClientRect();
    for (const tab of Array.from(el.querySelectorAll<HTMLElement>("[data-tab-id]"))) {
      const r = tab.getBoundingClientRect();
      if (r.left >= b.left - 1 && r.right <= b.right + 1) seen.add(tab.dataset.tabId ?? "");
    }
    return seen;
  }, []);

  return { stripRef, ...overflow, visibleIds };
}
