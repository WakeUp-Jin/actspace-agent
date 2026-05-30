import { useEffect, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import type { ContextState } from "@actspace/shared";
import { ContextRenderView } from "./right-panel/ContextRenderView";
import { HtmlRenderView } from "./right-panel/HtmlRenderView";
import { KairosRightPanelView } from "./right-panel/KairosRightPanelView";
import { MarkdownRenderView } from "./right-panel/MarkdownRenderView";
import { ReplyHtmlRenderView } from "./right-panel/ReplyHtmlRenderView";
import { useRightPanel, type RightPanelTab } from "./right-panel/RightPanelContext";

const RIGHT_PANEL_CLASS = "flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-l border-line bg-surface";
// 右侧预留两个 chrome 控件（+ 新建对象 / 折叠面板）的宽度，tab 永远不会滑到按钮下方造成重叠。
const RIGHT_TABS_CLASS =
  "relative z-[61] flex min-h-[var(--window-chrome-strip-height)] shrink-0 items-center border-b border-line py-0 pl-2.5 pr-[calc(2*var(--window-chrome-control-size)+28px)] [pointer-events:none]";
// 横向滚动条隐藏（scrollbar-none 见 electron.css）；溢出靠下拉而非可见滚动条。
const RIGHT_TAB_SCROLL_CLASS =
  "scrollbar-none flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [pointer-events:auto]";
const RIGHT_TAB_GROUP_BASE =
  "group inline-flex shrink-0 items-center gap-1 rounded-act-sm pl-2 pr-1 text-[12px] leading-none [pointer-events:auto] [-webkit-app-region:no-drag]";
const RIGHT_TAB_INACTIVE_CLASS = "bg-transparent text-text-muted";
const RIGHT_TAB_ACTIVE_CLASS = "bg-brand-soft text-brand";
const RIGHT_TAB_LABEL_CLASS =
  "max-w-[160px] overflow-hidden text-ellipsis whitespace-nowrap border-0 bg-transparent py-1 text-[inherit] text-[color:inherit] [cursor:pointer] [-webkit-app-region:no-drag]";
const RIGHT_TAB_CLOSE_CLASS =
  "inline-flex h-4 w-4 items-center justify-center rounded-act-sm border-0 bg-transparent text-text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-text-main hover:bg-line [cursor:pointer] [-webkit-app-region:no-drag]";
const RIGHT_TAB_OVERFLOW_CLASS =
  "ml-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-act-sm border-0 bg-transparent text-text-faint hover:bg-line hover:text-text-main [pointer-events:auto] [-webkit-app-region:no-drag] [cursor:pointer]";
const RIGHT_TAB_MENU_CLASS =
  "absolute right-0 top-[calc(100%+4px)] z-[70] max-h-[60vh] w-[220px] overflow-auto rounded-act-md border border-line bg-surface-raised/98 p-1 shadow-act-popover [pointer-events:auto] [-webkit-app-region:no-drag]";
const RIGHT_TAB_MENU_ITEM_CLASS =
  "flex w-full items-center gap-2 rounded-act-sm px-2 py-1.5 text-left text-[12px] text-text-main [cursor:pointer] hover:bg-brand-soft";
const RIGHT_TAB_MENU_ITEM_ACTIVE_CLASS = "bg-brand-soft text-brand";
const RIGHT_TAB_MENU_LABEL_CLASS = "min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap";
const RIGHT_TAB_MENU_CLOSE_CLASS =
  "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-act-sm border-0 bg-transparent text-text-faint hover:bg-line hover:text-text-main [cursor:pointer]";
const RIGHT_PANEL_BODY_CLASS = "min-h-0 flex-1 overflow-auto p-[18px] leading-[1.6] text-text-main";
const RIGHT_PANEL_HEADING_CLASS = "m-0 mb-2 text-[15px] font-semibold";
const RIGHT_PANEL_TEXT_CLASS = "m-0 text-[13px] text-text-muted";

export function RightPanel({ contextState, sessionId }: { contextState?: ContextState | null; sessionId?: string | null }) {
  const { activeTab } = useRightPanel();

  return (
    <aside className={RIGHT_PANEL_CLASS}>
      <RightPanelTabs />
      <RightPanelBody tab={activeTab} contextState={contextState} sessionId={sessionId} />
    </aside>
  );
}

/**
 * 右侧面板 Tab 条（参考 Cursor 编辑器标签的溢出处理）：
 *
 * - tab 保持内容宽度（标题截断到 160px），不挤压成不可读的窄条；
 * - tab 过多时横向滚动但**隐藏滚动条**（macOS 触控板自然滚动），激活的 tab 自动滚入可见区；
 * - 同时在右侧给出一个「溢出下拉」⌄ 按钮，列出全部 tab 供点选/关闭——这是无滚动条时的可达性兜底；
 * - 整条右侧预留两个浮层 chrome 控件宽度，tab 不会被「+ / 折叠」按钮盖住造成重叠。
 */
function RightPanelTabs() {
  const { tabs, activeTabId, setActiveTab, closeTab } = useRightPanel();
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
  }, [tabs.length]);

  // 激活的 tab 自动滚入可见区（切换/新增 tab 后）。
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !activeTabId) return;
    for (const child of Array.from(el.children)) {
      const node = child as HTMLElement;
      if (node.dataset.tabId === activeTabId && typeof node.scrollIntoView === "function") {
        node.scrollIntoView({ inline: "nearest", block: "nearest" });
        break;
      }
    }
  }, [activeTabId, tabs.length]);

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
    <div className={RIGHT_TABS_CLASS} role="tablist" aria-label="右侧面板">
      <div ref={scrollRef} className={RIGHT_TAB_SCROLL_CLASS}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <span
              key={tab.id}
              data-tab-id={tab.id}
              className={`${RIGHT_TAB_GROUP_BASE} ${isActive ? RIGHT_TAB_ACTIVE_CLASS : RIGHT_TAB_INACTIVE_CLASS}`}
            >
              <button
                className={RIGHT_TAB_LABEL_CLASS}
                type="button"
                role="tab"
                aria-selected={isActive}
                title={tab.title}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.title}
              </button>
              <button
                className={RIGHT_TAB_CLOSE_CLASS}
                type="button"
                aria-label={`关闭 ${tab.title}`}
                onClick={() => closeTab(tab.id)}
              >
                <X size={12} strokeWidth={2.2} />
              </button>
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
              {tabs.map((tab) => {
                const isActive = tab.id === activeTabId;
                return (
                  <div
                    key={tab.id}
                    role="menuitemradio"
                    aria-checked={isActive}
                    tabIndex={0}
                    className={`${RIGHT_TAB_MENU_ITEM_CLASS} ${isActive ? RIGHT_TAB_MENU_ITEM_ACTIVE_CLASS : ""}`}
                    onClick={() => {
                      setActiveTab(tab.id);
                      setMenuOpen(false);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setActiveTab(tab.id);
                        setMenuOpen(false);
                      }
                    }}
                  >
                    <span className={RIGHT_TAB_MENU_LABEL_CLASS} title={tab.title}>
                      {tab.title}
                    </span>
                    <button
                      type="button"
                      className={RIGHT_TAB_MENU_CLOSE_CLASS}
                      aria-label={`关闭 ${tab.title}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        closeTab(tab.id);
                      }}
                    >
                      <X size={12} strokeWidth={2.2} />
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

function RightPanelBody({
  tab,
  contextState,
  sessionId,
}: {
  tab: RightPanelTab | null;
  contextState?: ContextState | null;
  sessionId?: string | null;
}) {
  if (!tab) {
    return (
      <div className={RIGHT_PANEL_BODY_CLASS}>
        <h2 className={RIGHT_PANEL_HEADING_CLASS}>没有打开的对象</h2>
        <p className={RIGHT_PANEL_TEXT_CLASS}>
          在会话中点击文件、可视化按钮或上下文展开按钮，会在这里打开对应视图。
        </p>
      </div>
    );
  }

  if (tab.kind === "kairos") {
    return <KairosRightPanelView />;
  }

  if (tab.kind === "replyHtml") {
    return <ReplyHtmlRenderView sessionId={tab.sessionId} />;
  }

  if (tab.kind === "html") {
    return <HtmlRenderView html={tab.html} trust={tab.trust} relativePath={tab.relativePath} />;
  }

  if (tab.kind === "markdown") {
    return <MarkdownRenderView source={tab.source} relativePath={tab.relativePath} />;
  }

  if (tab.kind === "image") {
    return <ImageRenderView src={tab.src} relativePath={tab.relativePath} />;
  }

  if (tab.kind === "text") {
    return <TextRenderView content={tab.content} relativePath={tab.relativePath} />;
  }

  return <ContextRenderView contextState={contextState} sessionId={sessionId} />;
}

const FILE_TOOLBAR_CLASS = "flex shrink-0 items-center gap-2 border-b border-line px-3 py-1.5";
const FILE_PATH_CLASS = "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px] text-text-faint";
const TEXT_BODY_CLASS =
  "m-0 min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[12px] leading-[1.55] text-text-main";

function ImageRenderView({ src, relativePath }: { src: string; relativePath?: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={FILE_TOOLBAR_CLASS}>
        <span className={FILE_PATH_CLASS} title={relativePath}>
          {relativePath ?? "图片预览"}
        </span>
      </div>
      <div className="grid min-h-0 flex-1 place-items-center overflow-auto bg-surface-subtle p-4">
        <img src={src} alt={relativePath ?? "预览图片"} className="max-h-full max-w-full object-contain" />
      </div>
    </div>
  );
}

function TextRenderView({ content, relativePath }: { content: string; relativePath?: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={FILE_TOOLBAR_CLASS}>
        <span className={FILE_PATH_CLASS} title={relativePath}>
          {relativePath ?? "文本预览"}
        </span>
      </div>
      <pre className={TEXT_BODY_CLASS}>
        <code>{content}</code>
      </pre>
    </div>
  );
}
