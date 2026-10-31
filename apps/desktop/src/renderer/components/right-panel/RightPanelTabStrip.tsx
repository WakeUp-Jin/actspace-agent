import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Loader2, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/Tooltip";

/**
 * 右侧面板 Tab 条的展示部分（参考 Cursor 编辑器标签的溢出处理）：
 *
 * - tab 保持内容宽度（标题截断到 160px），不挤压成不可读的窄条；
 * - tab 过多时横向滚动但**隐藏滚动条**（macOS 触控板自然滚动），激活的 tab 自动滚入可见区；
 * - 同时在右侧给出一个「溢出下拉」⌄ 按钮，列出全部 tab 供点选/关闭——这是无滚动条时的可达性兜底；
 * - 整条右侧预留两个浮层 chrome 控件宽度，tab 不会被「+ / 折叠」按钮盖住造成重叠。
 *
 * 不读 `useRightPanel`：普通会话的右栏和 Space 的右栏（状态在 Space store 里）共用这一条。
 * 关闭终端这类异步动作由调用方处理，这里只显示 `closing` / `closeHint`。
 */

export type RightPanelTabStripItem = {
  id: string;
  /** 用于关闭按钮可读名称的原始标题。 */
  title: string;
  /** 标签上显示的文字（可能是「正在启动…」「正在关闭…」）。 */
  label: string;
  closing?: boolean;
  /** 关闭按钮 Tooltip 的替代文字，例如关闭失败的原因。 */
  closeHint?: string;
  /** 标签前的小图标或状态点（侧边对话的运行中、未读）。 */
  icon?: ReactNode;
  /** 关闭按钮的动词，默认「关闭」（侧边对话是「收起」）。 */
  closeVerb?: string;
};

// 右侧预留两个 chrome 控件（+ 新建对象 / 折叠面板）的宽度，tab 永远不会滑到按钮下方造成重叠。
const RIGHT_TABS_CLASS =
  "relative z-[calc(var(--act-z-chrome)+1)] flex min-h-[var(--window-chrome-strip-height)] shrink-0 items-center border-b border-line py-0 pl-2.5 pr-[calc(2*var(--window-chrome-control-size)+28px)] [pointer-events:none] max-[600px]:pl-[var(--window-chrome-collapsed-left-width)]";
// 横向滚动条隐藏（scrollbar-none 见 electron.css）；溢出靠下拉而非可见滚动条。
const RIGHT_TAB_SCROLL_CLASS =
  "scrollbar-none flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [pointer-events:auto]";
const RIGHT_PANEL_EMPTY_TITLE_CLASS =
  "px-2 text-act-sm font-medium leading-none text-text-muted";
const RIGHT_TAB_GROUP_BASE =
  "group inline-flex h-[30px] shrink-0 items-center gap-2.5 rounded-act-md pl-2.5 pr-1.5 text-act-sm leading-none transition-colors duration-(--motion-fast) ease-in-out [pointer-events:auto] [-webkit-app-region:no-drag]";
const RIGHT_TAB_INACTIVE_CLASS = "bg-transparent text-text-muted hover:bg-hover-overlay hover:text-text-main";
const RIGHT_TAB_ACTIVE_CLASS = "bg-surface-subtle font-medium text-text-main";
const RIGHT_TAB_LABEL_CLASS =
  "h-full max-w-[160px] overflow-hidden text-ellipsis whitespace-nowrap border-0 bg-transparent text-[inherit] text-[color:inherit] [cursor:pointer] [-webkit-app-region:no-drag]";
const RIGHT_TAB_CLOSE_CLASS =
  "inline-flex h-4 w-4 items-center justify-center rounded-act-sm border-0 bg-transparent text-text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-text-main hover:bg-line [cursor:pointer] [-webkit-app-region:no-drag]";
const RIGHT_TAB_OVERFLOW_CLASS =
  "ml-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-act-sm border-0 bg-transparent text-text-faint hover:bg-line hover:text-text-main [pointer-events:auto] [-webkit-app-region:no-drag] [cursor:pointer]";
const RIGHT_TAB_MENU_CLASS =
  "absolute right-0 top-[calc(100%+4px)] z-(--act-z-dropdown) max-h-[60vh] w-[220px] overflow-auto rounded-act-md border border-line bg-surface-raised/98 p-1 shadow-act-popover [pointer-events:auto] [-webkit-app-region:no-drag]";
const RIGHT_TAB_MENU_ITEM_CLASS =
  "flex w-full items-center gap-2 rounded-act-sm px-2 py-1.5 text-left text-act-xs text-text-main [cursor:pointer] hover:bg-hover-overlay";
const RIGHT_TAB_MENU_ITEM_ACTIVE_CLASS = "bg-selected font-semibold text-text-main";
const RIGHT_TAB_MENU_LABEL_CLASS = "min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap";
const RIGHT_TAB_MENU_CLOSE_CLASS =
  "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-act-sm border-0 bg-transparent text-text-faint hover:bg-line hover:text-text-main [cursor:pointer]";

export function RightPanelTabStrip({
  label,
  emptyTitle,
  items,
  activeId,
  onSelect,
  onClose,
}: {
  label: string;
  /** 没有 tab 时标签栏左侧显示的标题。 */
  emptyTitle: string;
  items: readonly RightPanelTabStripItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // 检测横向溢出：scrollWidth > clientWidth 时显示溢出下拉按钮。
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setOverflow(el.scrollWidth - el.clientWidth > 1);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [items.length]);

  // 激活的 tab 自动滚入可见区（切换/新增 tab 后）。
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !activeId) return;
    for (const child of Array.from(el.children)) {
      const node = child as HTMLElement;
      if (node.dataset.tabId === activeId && typeof node.scrollIntoView === "function") {
        node.scrollIntoView({ inline: "nearest", block: "nearest" });
        break;
      }
    }
  }, [activeId, items.length]);

  // 溢出下拉的外点 / Esc 关闭。
  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!anchorRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  return (
    <div className={RIGHT_TABS_CLASS} role="tablist" aria-label={label}>
      <div ref={scrollRef} className={RIGHT_TAB_SCROLL_CLASS}>
        {items.length === 0 ? (
          <span className={RIGHT_PANEL_EMPTY_TITLE_CLASS}>{emptyTitle}</span>
        ) : null}
        {items.map((tab) => {
          const isActive = tab.id === activeId;
          const isClosing = tab.closing === true;
          const tabLabel = tab.label;
          return (
            <span
              key={tab.id}
              data-tab-id={tab.id}
              className={`${RIGHT_TAB_GROUP_BASE} ${isActive ? RIGHT_TAB_ACTIVE_CLASS : RIGHT_TAB_INACTIVE_CLASS}`}
            >
              {tab.icon ? <span className="-mr-1 inline-flex shrink-0 items-center text-text-faint">{tab.icon}</span> : null}
              <button
                className={RIGHT_TAB_LABEL_CLASS}
                type="button"
                role="tab"
                aria-selected={isActive}
                title={tabLabel}
                onClick={() => onSelect(tab.id)}
              >
                {tabLabel}
              </button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className={`${RIGHT_TAB_CLOSE_CLASS} ${isClosing ? "opacity-100" : ""}`}
                    type="button"
                    aria-label={isClosing ? `正在关闭 ${tab.title}` : `${tab.closeVerb ?? "关闭"} ${tab.title}`}
                    disabled={isClosing}
                    onClick={() => onClose(tab.id)}
                  >
                    {isClosing ? <Loader2 size={12} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <X size={12} strokeWidth={2.2} aria-hidden="true" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent>{tab.closeHint ?? (isClosing ? "正在关闭…" : `${tab.closeVerb ?? "关闭"} ${tab.title}`)}</TooltipContent>
              </Tooltip>
            </span>
          );
        })}
      </div>
      {overflow ? (
        <div ref={anchorRef} className="relative flex items-center [pointer-events:auto]">
          <button
            className={RIGHT_TAB_OVERFLOW_CLASS}
            type="button"
            aria-label="所有标签页"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title="所有标签页"
            onClick={() => setMenuOpen((value) => !value)}
          >
            <ChevronDown size={15} strokeWidth={2} />
          </button>
          {menuOpen ? (
            <div className={RIGHT_TAB_MENU_CLASS} role="menu">
              {items.map((tab) => {
                const isActive = tab.id === activeId;
                const isClosing = tab.closing === true;
                const tabLabel = tab.label;
                return (
                  <div
                    key={tab.id}
                    role="menuitemradio"
                    aria-checked={isActive}
                    tabIndex={0}
                    className={`${RIGHT_TAB_MENU_ITEM_CLASS} ${isActive ? RIGHT_TAB_MENU_ITEM_ACTIVE_CLASS : ""}`}
                    onClick={() => {
                      onSelect(tab.id);
                      setMenuOpen(false);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelect(tab.id);
                        setMenuOpen(false);
                      }
                    }}
                  >
                    <span className={RIGHT_TAB_MENU_LABEL_CLASS} title={tabLabel}>
                      {tabLabel}
                    </span>
                    <button
                      type="button"
                      className={RIGHT_TAB_MENU_CLOSE_CLASS}
                      aria-label={isClosing ? `正在关闭 ${tab.title}` : `${tab.closeVerb ?? "关闭"} ${tab.title}`}
                      disabled={isClosing}
                      onClick={(event) => {
                        event.stopPropagation();
                        onClose(tab.id);
                      }}
                    >
                      {isClosing ? <Loader2 size={12} className="animate-spin motion-reduce:animate-none" /> : <X size={12} strokeWidth={2.2} />}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
