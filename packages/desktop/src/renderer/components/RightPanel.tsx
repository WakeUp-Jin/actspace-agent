import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Bot, ChevronDown, Eye, FolderTree, GitBranch, MessageSquare, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import hljs from "highlight.js";
import type { ContextState } from "@actspace/shared";
import { ContextRenderView } from "./right-panel/ContextRenderView";
import { HtmlRenderView } from "./right-panel/HtmlRenderView";
import { KairosRightPanelView } from "./right-panel/KairosRightPanelView";
import { MarkdownRenderView } from "./right-panel/MarkdownRenderView";
import { ReplyHtmlRenderView } from "./right-panel/ReplyHtmlRenderView";
import { ReviewRenderView } from "./right-panel/ReviewRenderView";
import { WorkspaceFileTree } from "./right-panel/WorkspaceFileTree";
import { isWorkspaceFileTab, useRightPanel, type RightPanelTab } from "./right-panel/RightPanelContext";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/Tooltip";

const RIGHT_PANEL_CLASS = "flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-l border-line bg-surface";
// 右面板纵向三段（对齐 Cursor 右侧）：① tab 条（全宽）→ ② 工作区操作栏（全宽，仅浏览态出现）→ ③ 两栏 [文件树 | 内容]。
const RIGHT_PANEL_SPLIT_CLASS = "flex min-h-0 min-w-0 flex-1 flex-row overflow-hidden";
const RIGHT_PANEL_CONTENT_CLASS = "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden";
// ② 工作区操作栏：左=树栏折叠/展开按钮，其后=当前文件的相对路径（相对 workspace）。
const WORKSPACE_BAR_CLASS = "flex shrink-0 items-center gap-2 border-b border-line px-2.5 py-1.5";
const WORKSPACE_BAR_TOGGLE_CLASS =
  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-act-sm border-0 bg-transparent text-text-faint hover:bg-line hover:text-text-main [cursor:pointer]";
const WORKSPACE_BAR_PATH_CLASS =
  "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px] text-text-faint";
const WORKSPACE_BAR_HINT_CLASS = "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-text-faint";
// 右侧预留两个 chrome 控件（+ 新建对象 / 折叠面板）的宽度，tab 永远不会滑到按钮下方造成重叠。
const RIGHT_TABS_CLASS =
  "relative z-[61] flex min-h-[var(--window-chrome-strip-height)] shrink-0 items-center border-b border-line py-0 pl-2.5 pr-[calc(2*var(--window-chrome-control-size)+28px)] [pointer-events:none]";
// 横向滚动条隐藏（scrollbar-none 见 electron.css）；溢出靠下拉而非可见滚动条。
const RIGHT_TAB_SCROLL_CLASS =
  "scrollbar-none flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [pointer-events:auto]";
const RIGHT_TAB_GROUP_BASE =
  "group inline-flex shrink-0 items-center gap-1 rounded-act-sm pl-2 pr-1 text-[12px] leading-none transition-colors duration-[120ms] ease-in-out [pointer-events:auto] [-webkit-app-region:no-drag]";
const RIGHT_TAB_INACTIVE_CLASS = "bg-transparent text-text-muted hover:bg-hover-overlay hover:text-text-main";
const RIGHT_TAB_ACTIVE_CLASS = "bg-selected font-semibold text-text-main";
const RIGHT_TAB_LABEL_CLASS =
  "max-w-[160px] overflow-hidden text-ellipsis whitespace-nowrap border-0 bg-transparent py-1 text-[inherit] text-[color:inherit] [cursor:pointer] [-webkit-app-region:no-drag]";
const RIGHT_TAB_CLOSE_CLASS =
  "inline-flex h-4 w-4 items-center justify-center rounded-act-sm border-0 bg-transparent text-text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-text-main hover:bg-line [cursor:pointer] [-webkit-app-region:no-drag]";
const RIGHT_TAB_OVERFLOW_CLASS =
  "ml-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-act-sm border-0 bg-transparent text-text-faint hover:bg-line hover:text-text-main [pointer-events:auto] [-webkit-app-region:no-drag] [cursor:pointer]";
const RIGHT_TAB_MENU_CLASS =
  "absolute right-0 top-[calc(100%+4px)] z-[70] max-h-[60vh] w-[220px] overflow-auto rounded-act-md border border-line bg-surface-raised/98 p-1 shadow-act-popover [pointer-events:auto] [-webkit-app-region:no-drag]";
const RIGHT_TAB_MENU_ITEM_CLASS =
  "flex w-full items-center gap-2 rounded-act-sm px-2 py-1.5 text-left text-[12px] text-text-main [cursor:pointer] hover:bg-hover-overlay";
const RIGHT_TAB_MENU_ITEM_ACTIVE_CLASS = "bg-selected font-semibold text-text-main";
const RIGHT_TAB_MENU_LABEL_CLASS = "min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap";
const RIGHT_TAB_MENU_CLOSE_CLASS =
  "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-act-sm border-0 bg-transparent text-text-faint hover:bg-line hover:text-text-main [cursor:pointer]";
const RIGHT_PANEL_BODY_CLASS = "min-h-0 flex-1 overflow-auto p-[18px] leading-[1.6] text-text-main";
const RIGHT_PANEL_HEADING_CLASS = "m-0 mb-2 text-[15px] font-semibold";
const RIGHT_PANEL_TEXT_CLASS = "m-0 text-[13px] text-text-muted";
const RIGHT_PANEL_LAUNCHER_CLASS =
  "grid min-h-0 flex-1 place-items-center overflow-auto bg-app-bg px-5 py-8";
const RIGHT_PANEL_LAUNCHER_GRID_CLASS = "grid w-full max-w-[300px] grid-cols-2 gap-3";
const RIGHT_PANEL_LAUNCHER_BUTTON_CLASS =
  "group flex h-[108px] min-w-0 flex-col items-center justify-center gap-3 rounded-act-lg border border-line bg-surface px-3 text-[13px] font-medium text-text-muted transition-[background-color,border-color,color,transform] duration-150 hover:border-line-strong hover:bg-surface-subtle hover:text-text-main active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-app-bg disabled:opacity-45 disabled:hover:border-line disabled:hover:bg-surface disabled:hover:text-text-muted [cursor:pointer] disabled:[cursor:not-allowed]";
const RIGHT_PANEL_LAUNCHER_LAST_BUTTON_CLASS =
  "col-span-2 w-[calc(50%_-_6px)] justify-self-center";
const RIGHT_PANEL_LAUNCHER_ICON_CLASS =
  "text-text-faint transition-colors duration-150 group-hover:text-text-muted group-focus-visible:text-text-main";

export function RightPanel({
  contextState,
  sessionId,
  workspaceRoot,
  onOpenReview,
  onReviewChanged,
  onSendToAgent,
}: {
  contextState?: ContextState | null;
  sessionId?: string | null;
  workspaceRoot?: string;
  onOpenReview?: () => void;
  onReviewChanged?: () => void;
  onSendToAgent?: (text: string) => void;
}) {
  const { activeTab, isFileTreeOpen, isFileTreeCollapsed } = useRightPanel();

  // 呈现由「当前 Tab」决定：
  // - 工作区文件 Tab → 进入 shell（树 + 文件预览区），多个文件 Tab 间切换只换 shell 内的内容；
  // - 浏览态显式打开（isFileTreeOpen，例如刚点 + 菜单还没选文件）→ 也进入 shell，但内容区显示占位；
  // - 否则（对象 Tab）→ 走整面板，展示它自己的视图。
  const isFileTab = isWorkspaceFileTab(activeTab);
  const showShell = isFileTab || isFileTreeOpen;
  const showTree = showShell && !isFileTreeCollapsed;

  return (
    <aside className={RIGHT_PANEL_CLASS}>
      <RightPanelTabs />
      {showShell ? <WorkspaceOperationBar activeTab={activeTab} /> : null}
      <div className={RIGHT_PANEL_SPLIT_CLASS}>
        {showTree ? <WorkspaceFileTree key={workspaceRoot ?? "default-workspace"} workspaceRoot={workspaceRoot} /> : null}
        <div className={RIGHT_PANEL_CONTENT_CLASS}>
          {showShell && !isFileTab ? (
            <WorkspaceFileEmpty />
          ) : (
            <RightPanelBody
              tab={activeTab}
              contextState={contextState}
              sessionId={sessionId}
              workspaceRoot={workspaceRoot}
              onOpenReview={onOpenReview}
              onReviewChanged={onReviewChanged}
              onSendToAgent={onSendToAgent}
            />
          )}
        </div>
      </div>
    </aside>
  );
}

/** 当前 Tab 的工作区相对路径（仅工作区文件 Tab 有）；其余返回空。 */
function relativePathOf(tab: RightPanelTab | null): string | undefined {
  if (tab && "relativePath" in tab && typeof tab.relativePath === "string") {
    return tab.relativePath;
  }
  return undefined;
}

/** 工作区态下激活的是对象 Tab 时的文件预览区占位。 */
function WorkspaceFileEmpty() {
  return (
    <div className={RIGHT_PANEL_BODY_CLASS}>
      <h2 className={RIGHT_PANEL_HEADING_CLASS}>选择文件查看</h2>
      <p className={RIGHT_PANEL_TEXT_CLASS}>
        在左侧文件树中点击文件，将在这里打开预览。Kairos、Context、Reply 等对象请关闭「工作区文件」后查看完整视图。
      </p>
    </div>
  );
}

/**
 * ② 工作区操作栏：全宽、夹在 tab 条与两栏之间。
 * 折叠按钮只收起/展开左侧树栏（操作栏与内容保持），路径展示当前文件的工作区相对路径。
 */
function WorkspaceOperationBar({ activeTab }: { activeTab: RightPanelTab | null }) {
  const { isFileTreeCollapsed, toggleFileTreeCollapsed } = useRightPanel();
  const path = relativePathOf(activeTab);
  return (
    <div className={WORKSPACE_BAR_CLASS}>
      <button
        type="button"
        className={WORKSPACE_BAR_TOGGLE_CLASS}
        aria-label={isFileTreeCollapsed ? "展开文件树" : "收起文件树"}
        aria-expanded={!isFileTreeCollapsed}
        title={isFileTreeCollapsed ? "展开文件树" : "收起文件树"}
        onClick={toggleFileTreeCollapsed}
      >
        {isFileTreeCollapsed ? (
          <PanelLeftOpen size={15} strokeWidth={1.8} />
        ) : (
          <PanelLeftClose size={15} strokeWidth={1.8} />
        )}
      </button>
      {path ? (
        <span className={WORKSPACE_BAR_PATH_CLASS} title={path}>
          {path}
        </span>
      ) : (
        <span className={WORKSPACE_BAR_HINT_CLASS}>工作区文件</span>
      )}
    </div>
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
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className={RIGHT_TAB_CLOSE_CLASS}
                    type="button"
                    aria-label={`关闭 ${tab.title}`}
                    onClick={() => closeTab(tab.id)}
                  >
                    <X size={12} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>关闭 {tab.title}</TooltipContent>
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
  workspaceRoot,
  onOpenReview,
  onReviewChanged,
  onSendToAgent,
}: {
  tab: RightPanelTab | null;
  contextState?: ContextState | null;
  sessionId?: string | null;
  workspaceRoot?: string;
  onOpenReview?: () => void;
  onReviewChanged?: () => void;
  onSendToAgent?: (text: string) => void;
}) {
  if (!tab) {
    return <RightPanelLauncher sessionId={sessionId ?? null} onOpenReview={onOpenReview} />;
  }

  if (tab.kind === "kairos") {
    return <KairosRightPanelView />;
  }

  if (tab.kind === "replyHtml") {
    return <ReplyHtmlRenderView sessionId={tab.sessionId} />;
  }

  if (tab.kind === "review") {
    return (
      <ReviewRenderView
        workspaceRoot={workspaceRoot}
        sessionId={sessionId}
        refreshKey={tab.refreshKey}
        onReviewChanged={onReviewChanged}
      />
    );
  }

  if (tab.kind === "html") {
    return <HtmlRenderView html={tab.html} trust={tab.trust} relativePath={tab.relativePath} />;
  }

  if (tab.kind === "markdown") {
    return <MarkdownRenderView source={tab.source} />;
  }

  if (tab.kind === "image") {
    return <ImageRenderView src={tab.src} relativePath={tab.relativePath} />;
  }

  if (tab.kind === "text") {
    return <TextRenderView content={tab.content} language={tab.language} />;
  }

  return <ContextRenderView contextState={contextState} sessionId={sessionId} />;
}

function RightPanelLauncher({
  sessionId,
  onOpenReview,
}: {
  sessionId: string | null;
  onOpenReview?: () => void;
}) {
  const { openFileTree, openTab } = useRightPanel();

  return (
    <nav className={RIGHT_PANEL_LAUNCHER_CLASS} aria-label="右侧面板对象">
      <div className={RIGHT_PANEL_LAUNCHER_GRID_CLASS}>
        <LauncherButton label="Files" icon={<FolderTree size={19} strokeWidth={1.7} />} onClick={openFileTree} />
        <LauncherButton
          label="Review"
          icon={<GitBranch size={19} strokeWidth={1.7} />}
          onClick={onOpenReview}
          disabled={!onOpenReview}
        />
        <LauncherButton
          label="Context"
          icon={<Eye size={19} strokeWidth={1.7} />}
          onClick={() => openTab({ id: "context", kind: "context", title: "Context" })}
        />
        <LauncherButton
          label="Kairos"
          icon={<Bot size={19} strokeWidth={1.7} />}
          onClick={() => openTab({ id: "kairos", kind: "kairos", title: "Kairos" })}
        />
        <LauncherButton
          label="Reply"
          icon={<MessageSquare size={19} strokeWidth={1.7} />}
          onClick={() => openTab({ id: "reply", kind: "replyHtml", title: "Reply", sessionId })}
          centered
        />
      </div>
    </nav>
  );
}

function LauncherButton({
  label,
  icon,
  onClick,
  centered = false,
  disabled = false,
}: {
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  centered?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`${RIGHT_PANEL_LAUNCHER_BUTTON_CLASS} ${centered ? RIGHT_PANEL_LAUNCHER_LAST_BUTTON_CLASS : ""}`}
      disabled={disabled}
      onClick={onClick}
    >
      <span className={RIGHT_PANEL_LAUNCHER_ICON_CLASS} aria-hidden="true">
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}

const TEXT_BODY_CLASS =
  "m-0 min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[12px] leading-[1.55] text-text-main";

// 路径已统一移到工作区操作栏（②），各文件视图不再自带 path 工具条，避免相邻两行重复同一路径。
function ImageRenderView({ src, relativePath }: { src: string; relativePath?: string }) {
  return (
    <div className="grid min-h-0 flex-1 place-items-center overflow-auto bg-surface-subtle p-4">
      <img src={src} alt={relativePath ?? "预览图片"} className="max-h-full max-w-full object-contain" />
    </div>
  );
}

/**
 * 文本 / 代码文件视图。带 `language`（ts/js/css/yaml/json…）时用 highlight.js 语法高亮，
 * 复用 Markdown 的主题感知 hljs 配色（共享 `.act-code-hl` 作用域）；无语言或高亮失败回退纯等宽。
 */
function TextRenderView({ content, language }: { content: string; language?: string }) {
  const highlighted = useMemo(() => {
    if (!language || !hljs.getLanguage(language)) return null;
    try {
      return hljs.highlight(content, { language, ignoreIllegals: true }).value;
    } catch {
      return null;
    }
  }, [content, language]);

  if (highlighted) {
    return (
      <pre className={`${TEXT_BODY_CLASS} act-code-hl`}>
        <code className="hljs" dangerouslySetInnerHTML={{ __html: highlighted }} />
      </pre>
    );
  }
  return (
    <pre className={TEXT_BODY_CLASS}>
      <code>{content}</code>
    </pre>
  );
}
