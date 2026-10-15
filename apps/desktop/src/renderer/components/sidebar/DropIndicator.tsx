/** 拖拽排序的插入位置：行上沿或下沿一条 2px 强调色线，左端一个圆点（DSH）。 */
export function DropIndicator({ position }: { position: "before" | "after" | null }) {
  if (!position) return null;
  return (
    <span
      aria-hidden="true"
      className={`sidebar-drop-indicator pointer-events-none absolute inset-x-1.5 z-10 h-0.5 rounded-act-pill bg-accent ${position === "before" ? "-top-px" : "-bottom-px"}`}
    >
      <span className="absolute -left-1 top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-accent" />
    </span>
  );
}
