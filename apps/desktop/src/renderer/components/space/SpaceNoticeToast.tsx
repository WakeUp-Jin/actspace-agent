import { useSpaceDemoSelector } from "./model/use-space-demo";

/** 一行轻提示（store 的 notice，2.2s 后自己消失）。绝对定位在最近的定位父级底部居中，位置由装配方决定。 */
export function SpaceNoticeToast() {
  const notice = useSpaceDemoSelector((s) => s.notice);
  if (!notice) return null;
  return (
    <div
      role="status"
      key={notice.id}
      className="pointer-events-none absolute bottom-full left-1/2 z-1 mb-2 -translate-x-1/2 whitespace-nowrap rounded-act-pill border border-line bg-surface-raised px-3 py-1.5 text-act-xs text-text-main shadow-act-popover"
    >
      {notice.text}
    </div>
  );
}
