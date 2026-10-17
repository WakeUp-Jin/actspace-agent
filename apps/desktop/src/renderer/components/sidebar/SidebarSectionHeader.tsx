import { useEffect, useRef, useState } from "react";
import type { ReactNode, Ref } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { IconButton } from "../ui/IconButton";
import { NAV_SECTION_LABEL_BASE_CLASS, NAV_SECTION_ACTIONS_CLASS } from "./styles";

const SECTION_HEADER_CLASS = "nav-section-title group/nav-title relative flex min-w-0 items-center justify-between gap-2 px-2";
const SECTION_LABEL_CLASS = `nav-section-label ${NAV_SECTION_LABEL_BASE_CLASS} h-full gap-1 text-act-xs`;
// 收起时箭头转到朝右并常亮；展开时隐藏，悬停标题时出现（Cursor）。
const SECTION_CHEVRON_CLASS =
  "nav-section-chevron shrink-0 transition-[opacity,transform] duration-(--motion-slow) ease-(--ease-standard) group-hover/nav-title:opacity-100 group-has-[:focus-visible]/nav-title:opacity-100";
// 搜索时标题和按钮淡出，让位给搜索框。
const SECTION_HIDDEN_CLASS = "pointer-events-none opacity-0";
// 搜索框从图标位置向左展开到整行（DSH）。
const SEARCH_BOX_CLASS =
  "sidebar-search absolute inset-y-0.5 right-0.5 z-10 flex items-center gap-1.5 overflow-hidden rounded-act-md border border-line bg-surface-raised pl-2 pr-0.5 transition-[width] duration-(--motion-base) ease-in-out";
const SEARCH_INPUT_CLASS = "min-w-0 flex-1 border-0 bg-transparent p-0 text-act-sm text-text-main outline-none placeholder:text-text-faint";

type SidebarSectionHeaderProps = {
  label: ReactNode;
  collapsed: boolean;
  onToggle: () => void;
  /** 标题右侧的按钮（搜索、视图选项、添加工作区）。 */
  actions?: ReactNode;
  /** 盖在标题行上的内容（搜索框）；给了就把标题和按钮淡出。 */
  overlay?: ReactNode;
  /** 分区标题 30px；按时间分组的时间段标题 24px。 */
  compact?: boolean;
  className?: string;
};

/** 侧栏分区标题，也用作按时间分组的时间段标题：点文字折叠，悬停露出折叠箭头。 */
export function SidebarSectionHeader({ label, collapsed, onToggle, actions, overlay, compact = false, className = "" }: SidebarSectionHeaderProps) {
  const hidden = overlay ? SECTION_HIDDEN_CLASS : "";
  return (
    <div className={`${SECTION_HEADER_CLASS} ${compact ? "h-6" : "h-[30px]"} ${className}`}>
      <button className={`${SECTION_LABEL_CLASS} ${hidden}`} type="button" onClick={onToggle} aria-expanded={!collapsed}>
        {label}
        <ChevronDown size={12} strokeWidth={2} className={`${SECTION_CHEVRON_CLASS} ${collapsed ? "-rotate-90 opacity-100" : "opacity-0"}`} aria-hidden="true" />
      </button>
      {actions ? <div className={`nav-section-actions ${NAV_SECTION_ACTIONS_CLASS} gap-px ${hidden}`}>{actions}</div> : null}
      {overlay}
    </div>
  );
}

type SidebarSearchBoxProps = {
  query: string;
  onQueryChange: (query: string) => void;
  onClose: (restoreFocus: boolean) => void;
};

/** 标题行里展开的搜索框：Esc 或 ✕ 关闭；输入为空时点别处也关闭，有内容时保留。 */
export function SidebarSearchBox({ query, onQueryChange, onClose }: SidebarSearchBoxProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    inputRef.current?.focus();
    const frame = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div className={`${SEARCH_BOX_CLASS} ${grown ? "w-[calc(100%-4px)]" : "w-7"}`} role="search">
      <Search size={13} strokeWidth={1.9} className="shrink-0 text-text-faint" aria-hidden="true" />
      <input
        ref={inputRef}
        className={SEARCH_INPUT_CLASS}
        aria-label="搜索会话标题和片段"
        placeholder="搜索会话标题或内容"
        maxLength={300}
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(true); }
        }}
        onBlur={(event) => {
          if (!query.trim() && !event.currentTarget.parentElement?.contains(event.relatedTarget as Node | null)) onClose(false);
        }}
      />
      <IconButton size="xs" label="关闭搜索" tooltip={false} onClick={() => onClose(true)}>
        <X size={13} strokeWidth={1.9} aria-hidden="true" />
      </IconButton>
    </div>
  );
}

/** 标题行里的搜索图标按钮。 */
export function SidebarSearchButton({ onOpen, buttonRef }: { onOpen: () => void; buttonRef?: Ref<HTMLButtonElement> }) {
  return (
    <IconButton ref={buttonRef} className="sidebar-search-button" size="xs" label="搜索会话" tooltip="搜索会话" onClick={onOpen}>
      <Search size={13} strokeWidth={1.9} aria-hidden="true" />
    </IconButton>
  );
}
