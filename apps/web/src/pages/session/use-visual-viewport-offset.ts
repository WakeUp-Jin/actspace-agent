import { useEffect, useState } from "react";

/** 软键盘弹出时可视视口比布局视口矮，返回被遮住的高度，供输入坞上移。 */
export function useVisualViewportOffset(): number {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const viewport = typeof window !== "undefined" ? window.visualViewport : null;
    if (!viewport) return;
    const update = () => setOffset(Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop)));
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => { viewport.removeEventListener("resize", update); viewport.removeEventListener("scroll", update); };
  }, []);
  return offset;
}
