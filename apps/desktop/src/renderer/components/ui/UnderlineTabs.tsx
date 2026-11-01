import { useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { cn } from "./cn";

// 下划线标签条：设置页内容区的二级分类（Harness 统计）。
// 键盘：← → 在标签间移动并选中，Home / End 到首尾。面板由调用方用 role="tabpanel" 渲染。

export type UnderlineTab<T extends string> = { value: T; label: string; count?: ReactNode };

export function UnderlineTabs<T extends string>({
  value,
  tabs,
  onChange,
  ariaLabel,
  idPrefix,
}: {
  value: T;
  tabs: readonly UnderlineTab<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  /** 给了就为每个标签生成 `${idPrefix}-tab-${value}` 的 id，面板用 aria-labelledby 指回来。 */
  idPrefix?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((tab) => tab.value === value);
    let next = -1;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    if (next < 0) return;
    event.preventDefault();
    const target = tabs[next]!;
    onChange(target.value);
    listRef.current?.querySelector<HTMLButtonElement>(`[data-tab="${target.value}"]`)?.focus();
  };
  return (
    <div ref={listRef} role="tablist" aria-label={ariaLabel} onKeyDown={onKeyDown} className="flex gap-5 overflow-x-auto border-b border-line">
      {tabs.map((tab) => {
        const selected = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            id={idPrefix ? `${idPrefix}-tab-${tab.value}` : undefined}
            data-tab={tab.value}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.value)}
            className={cn(
              "-mb-px shrink-0 whitespace-nowrap border-b-2 px-0.5 pb-2.5 text-act-sm font-medium transition-colors duration-(--motion-fast) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
              selected ? "border-text-main text-text-main" : "border-transparent text-text-faint hover:text-text-main",
            )}
          >
            {tab.label}
            {tab.count != null ? <span className="ml-1 text-act-xs font-normal tabular-nums text-text-subtle">{tab.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
