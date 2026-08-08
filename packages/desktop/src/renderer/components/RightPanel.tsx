import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Eye,
  FolderTree,
  GitBranch,
  Loader2,
  MessageSquare,
  SquareTerminal,
  TriangleAlert,
  X,
} from "lucide-react";
import { WORKSPACE_TEXT_PREVIEW_LIMIT_BYTES } from "@actspace/shared";
import type { ContextState, TerminalSessionSnapshot } from "@actspace/shared";
import { CodeRenderView } from "./right-panel/CodeRenderView";
import { ContextRenderView } from "./right-panel/ContextRenderView";
import { CsvRenderView } from "./right-panel/CsvRenderView";
import { HtmlRenderView } from "./right-panel/HtmlRenderView";
import { KairosRightPanelView } from "./right-panel/KairosRightPanelView";
import { MarkdownRenderView } from "./right-panel/MarkdownRenderView";
import { OpenInAppMenu } from "./right-panel/OpenInAppMenu";
import { PreviewSourceButton } from "./right-panel/PreviewSourceToggle";
import { ReplyHtmlRenderView } from "./right-panel/ReplyHtmlRenderView";
import { ReviewRenderView } from "./right-panel/ReviewRenderView";
import { WorkspaceFileTree } from "./right-panel/WorkspaceFileTree";
import {
  isWorkspaceFileTab,
  useRightPanel,
  type RightPanelTab,
  type WorkspaceFileMeta,
} from "./right-panel/RightPanelContext";
import { useFileFreshness, useReloadFileTab } from "./right-panel/useFileFreshness";
import { cancelTerminalStart, useOpenTerminal } from "./right-panel/useOpenTerminal";
import { LazyTerminalRenderView, preloadTerminalRenderView } from "./right-panel/terminal-render-loader";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/Tooltip";

const RIGHT_PANEL_CLASS = "flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-l border-line bg-surface";
// 右面板纵向三段（对齐 Cursor 右侧）：① tab 条（全宽）→ ② 工作区操作栏（全宽，仅浏览态出现）→ ③ 两栏 [内容 | 文件树]。
// 文件树在**右**栏：内容区紧邻聊天区，视线从消息移到代码不用跨过一条树栏。
const RIGHT_PANEL_SPLIT_CLASS = "flex min-h-0 min-w-0 flex-1 flex-row overflow-hidden";
const RIGHT_PANEL_CONTENT_CLASS = "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden";
// ② 工作区操作栏：左=面包屑路径，右=树栏开关 + 外部打开。只放这两个动作，多了就变成第二条工具栏。
const WORKSPACE_BAR_CLASS = "flex shrink-0 items-center gap-1 border-b border-line px-2.5 py-1.5";
const WORKSPACE_BAR_TOGGLE_CLASS =
  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-act-sm border-0 bg-transparent text-text-faint hover:bg-line hover:text-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring [cursor:pointer]";
const WORKSPACE_BAR_TOGGLE_ACTIVE_CLASS = "bg-selected text-text-main";
// 面包屑：根名弱化、文件名主色，中间用 chevron 分隔（与 Cursor 的 `root › file` 同形）。
const WORKSPACE_BAR_CRUMBS_CLASS = "flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden text-[12px]";
const WORKSPACE_BAR_ROOT_CLASS = "shrink-0 text-text-faint";
const WORKSPACE_BAR_PATH_CLASS = "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-text-main";
const WORKSPACE_BAR_HINT_CLASS =
  "min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[12px] text-text-faint";
// 过期提示用 warning 语义：内容不可信但不是错误，需要用户注意并显式重载。
const WORKSPACE_STALE_BAR_CLASS =
  "flex shrink-0 items-center gap-2 border-b border-line bg-warning-soft px-2.5 py-1.5 text-[11px] text-on-warning";
const WORKSPACE_STALE_ACTION_CLASS =
  "shrink-0 rounded-act-sm border-0 bg-transparent px-1.5 py-0.5 text-[11px] font-semibold text-on-warning underline decoration-dotted hover:bg-hover-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring [cursor:pointer]";
const WORKSPACE_TRUNCATED_BAR_CLASS =
  "shrink-0 border-b border-line bg-surface-subtle px-2.5 py-1.5 text-[11px] text-text-faint";
// 右侧预留两个 chrome 控件（+ 新建对象 / 折叠面板）的宽度，tab 永远不会滑到按钮下方造成重叠。
const RIGHT_TABS_CLASS =
  "relative z-[61] flex min-h-[var(--window-chrome-strip-height)] shrink-0 items-center border-b border-line py-0 pl-2.5 pr-[calc(2*var(--window-chrome-control-size)+28px)] [pointer-events:none] max-[600px]:pl-[var(--window-chrome-collapsed-left-width)]";
// 横向滚动条隐藏（scrollbar-none 见 electron.css）；溢出靠下拉而非可见滚动条。
const RIGHT_TAB_SCROLL_CLASS =
  "scrollbar-none flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [pointer-events:auto]";
const RIGHT_PANEL_EMPTY_TITLE_CLASS =
  "px-2 text-[13px] font-medium leading-none text-text-muted";
const RIGHT_TAB_GROUP_BASE =
  "group inline-flex shrink-0 items-center gap-1 rounded-act-sm pl-2 pr-1 text-[12px] leading-none transition-colors duration-[120ms] ease-in-out [pointer-events:auto] [-webkit-app-region:no-drag]";
const RIGHT_TAB_INACTIVE_CLASS = "bg-transparent text-text-muted hover:bg-hover-overlay hover:text-text-main";
const RIGHT_TAB_ACTIVE_CLASS = "bg-surface-subtle font-semibold text-text-main";
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
const RIGHT_PANEL_LAUNCHER_ICON_CLASS =
  "text-text-faint transition-colors duration-150 group-hover:text-text-muted group-focus-visible:text-text-main";

export function RightPanel({
  contextState,
  sessionId,
  workspaceRoot,
  fileRevalidateKey,
  onOpenReview,
  onReviewChanged,
  onSendToAgent,
  kairosFeatureEnabled = false,
}: {
  contextState?: ContextState | null;
  sessionId?: string | null;
  workspaceRoot?: string;
  /** 递增即触发已打开文件 Tab 的新鲜度重校验（当前会话 turn 结束时由 App 递增）。 */
  fileRevalidateKey?: number;
  onOpenReview?: () => void;
  onReviewChanged?: () => void;
  onSendToAgent?: (text: string) => void;
  kairosFeatureEnabled?: boolean;
}) {
  const { activeTab, closeTab, isFileTreeOpen, isFileTreeCollapsed, syncTerminalTabs } = useRightPanel();
  useFileFreshness({ workspaceRoot, revalidateKey: fileRevalidateKey });

  useEffect(() => {
    if (!kairosFeatureEnabled) closeTab("kairos");
  }, [closeTab, kairosFeatureEnabled]);

  useEffect(() => {
    const listTerminals = window.actspace?.listTerminals;
    if (!sessionId || !listTerminals) {
      if (!sessionId) syncTerminalTabs("", []);
      return;
    }
    let cancelled = false;
    void listTerminals({ sessionId }).then((result) => {
      if (!cancelled) syncTerminalTabs(sessionId, result.terminals);
    });
    return () => { cancelled = true; };
  }, [sessionId, syncTerminalTabs]);

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
      {showShell ? <WorkspaceOperationBar activeTab={activeTab} workspaceRoot={workspaceRoot} /> : null}
      <div className={RIGHT_PANEL_SPLIT_CLASS}>
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
              kairosFeatureEnabled={kairosFeatureEnabled}
            />
          )}
        </div>
        {showTree ? <WorkspaceFileTree workspaceRoot={workspaceRoot} /> : null}
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
        在右侧文件树中点击文件，将在这里打开预览。Kairos、Context、Reply 等对象请关闭「工作区文件」后查看完整视图。
      </p>
    </div>
  );
}

/** workspace 绝对路径的末段目录名，用作面包屑的根标签。 */
function workspaceLabelOf(workspaceRoot: string | undefined): string | undefined {
  if (!workspaceRoot) return undefined;
  return workspaceRoot.replace(/[/\\]+$/, "").split(/[/\\]/).filter(Boolean).at(-1);
}

/**
 * ② 工作区操作栏：全宽、夹在 tab 条与两栏之间。
 *
 * 只承载「我在看哪个文件」+ 两个动作（开关树栏、外部打开），刻意不再放刷新：
 * 需要重新读取的唯一真实场景是文件已变更，而那时下方的 stale 提示条本身就带「重新加载」，
 * 常驻一个几乎不会被点的刷新图标只是让这一层看起来更满。
 */
function WorkspaceOperationBar({
  activeTab,
  workspaceRoot,
}: {
  activeTab: RightPanelTab | null;
  workspaceRoot?: string;
}) {
  const { isFileTreeCollapsed, toggleFileTreeCollapsed, isSourceShown, setSourceShown } = useRightPanel();
  const reloadFile = useReloadFileTab(workspaceRoot);
  const path = relativePathOf(activeTab);
  const rootLabel = workspaceLabelOf(workspaceRoot);
  const meta = activeTab as WorkspaceFileMeta | null;
  const isStale = Boolean(meta?.isStale);
  const isTruncated = Boolean(meta?.truncated);
  // 只有「渲染态之外还有源码可看」的文件类型才给切换按钮：markdown 与 html。
  // 必须同时要求 path：浏览态下激活的可能是聊天生成的 markdown（内容区是占位页），
  // 那时按钮点了没有任何视图会响应。
  const dualViewTab =
    path && activeTab && (activeTab.kind === "markdown" || activeTab.kind === "html") ? activeTab : null;

  const reload = () => {
    if (!path || !activeTab) return;
    void reloadFile(path, activeTab.kind === "context" ? path : (activeTab as { title: string }).title);
  };

  return (
    <>
      <div className={WORKSPACE_BAR_CLASS}>
        {path ? (
          <span className={WORKSPACE_BAR_CRUMBS_CLASS}>
            {rootLabel ? (
              <>
                <span className={WORKSPACE_BAR_ROOT_CLASS} title={workspaceRoot}>
                  {rootLabel}
                </span>
                <ChevronRight size={12} strokeWidth={1.8} className="shrink-0 text-text-faint" aria-hidden="true" />
              </>
            ) : null}
            <span className={WORKSPACE_BAR_PATH_CLASS} title={path}>
              {path}
            </span>
          </span>
        ) : (
          <span className={WORKSPACE_BAR_HINT_CLASS}>工作区文件</span>
        )}
        {dualViewTab ? (
          <PreviewSourceButton
            mode={isSourceShown(dualViewTab.id) ? "source" : "preview"}
            onChange={(next) => setSourceShown(dualViewTab.id, next === "source")}
          />
        ) : null}
        {path ? <OpenInAppMenu workspaceRoot={workspaceRoot} relativePath={path} /> : null}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={`${WORKSPACE_BAR_TOGGLE_CLASS} ${isFileTreeCollapsed ? "" : WORKSPACE_BAR_TOGGLE_ACTIVE_CLASS}`}
              aria-label={isFileTreeCollapsed ? "展开文件树" : "收起文件树"}
              aria-expanded={!isFileTreeCollapsed}
              onClick={toggleFileTreeCollapsed}
            >
              <FolderTree size={14} strokeWidth={1.8} aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{isFileTreeCollapsed ? "展开文件树" : "收起文件树"}</TooltipContent>
        </Tooltip>
      </div>
      {isStale ? (
        <div className={WORKSPACE_STALE_BAR_CLASS} role="status">
          <TriangleAlert size={13} strokeWidth={2} className="shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">文件已在磁盘上变更，当前显示的是旧内容。</span>
          <button type="button" className={WORKSPACE_STALE_ACTION_CLASS} onClick={reload}>
            重新加载
          </button>
        </div>
      ) : null}
      {isTruncated ? (
        <div className={WORKSPACE_TRUNCATED_BAR_CLASS} role="status">
          {`文件过大，仅显示前 ${formatBytes(WORKSPACE_TEXT_PREVIEW_LIMIT_BYTES)} 内的完整行（共 ${formatBytes(meta?.size ?? 0)}）。`}
        </div>
      ) : null}
    </>
  );
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
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
  const { tabs, activeTabId, setActiveTab, closeTab, isFileTreeOpen } = useRightPanel();
  const scrollRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [closeErrors, setCloseErrors] = useState<Record<string, string>>({});
  const [closingTabIds, setClosingTabIds] = useState<Set<string>>(() => new Set());

  const closeRightTab = async (tab: RightPanelTab) => {
    if (closingTabIds.has(tab.id)) return;
    if (tab.kind === "terminalStarting") {
      cancelTerminalStart(tab.requestId);
    }
    if (tab.kind === "terminal") {
      setClosingTabIds((current) => new Set(current).add(tab.id));
      try {
        const result = await window.actspace.closeTerminal?.({ terminalId: tab.terminalId });
        if (result?.ok === false) {
          setCloseErrors((current) => ({ ...current, [tab.id]: result.error.message }));
          setClosingTabIds((current) => {
            const next = new Set(current);
            next.delete(tab.id);
            return next;
          });
          return;
        }
      } catch (error) {
        setCloseErrors((current) => ({
          ...current,
          [tab.id]: error instanceof Error ? error.message : String(error),
        }));
        setClosingTabIds((current) => {
          const next = new Set(current);
          next.delete(tab.id);
          return next;
        });
        return;
      }
    }
    setCloseErrors((current) => {
      const next = { ...current };
      delete next[tab.id];
      return next;
    });
    setClosingTabIds((current) => {
      if (!current.has(tab.id)) return current;
      const next = new Set(current);
      next.delete(tab.id);
      return next;
    });
    closeTab(tab.id);
  };

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
        {tabs.length === 0 ? (
          <span className={RIGHT_PANEL_EMPTY_TITLE_CLASS}>{isFileTreeOpen ? "Files" : "Objects"}</span>
        ) : null}
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const isClosing = closingTabIds.has(tab.id);
          const tabLabel = isClosing ? "Closing…" : tab.kind === "terminalStarting" ? "Starting…" : tab.title;
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
                title={tabLabel}
                onClick={() => setActiveTab(tab.id)}
              >
                {tabLabel}
              </button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className={`${RIGHT_TAB_CLOSE_CLASS} ${isClosing ? "opacity-100" : ""}`}
                    type="button"
                    aria-label={isClosing ? `正在关闭 ${tab.title}` : `关闭 ${tab.title}`}
                    disabled={isClosing}
                    onClick={() => void closeRightTab(tab)}
                  >
                    {isClosing ? <Loader2 size={12} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <X size={12} strokeWidth={2.2} aria-hidden="true" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent>{closeErrors[tab.id] ?? (isClosing ? "正在关闭…" : `关闭 ${tab.title}`)}</TooltipContent>
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
                const isClosing = closingTabIds.has(tab.id);
                const tabLabel = isClosing ? "Closing…" : tab.kind === "terminalStarting" ? "Starting…" : tab.title;
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
                    <span className={RIGHT_TAB_MENU_LABEL_CLASS} title={tabLabel}>
                      {tabLabel}
                    </span>
                    <button
                      type="button"
                      className={RIGHT_TAB_MENU_CLOSE_CLASS}
                      aria-label={isClosing ? `正在关闭 ${tab.title}` : `关闭 ${tab.title}`}
                      disabled={isClosing}
                      onClick={(event) => {
                        event.stopPropagation();
                        void closeRightTab(tab);
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

function RightPanelBody({
  tab,
  contextState,
  sessionId,
  workspaceRoot,
  onOpenReview,
  onReviewChanged,
  onSendToAgent,
  kairosFeatureEnabled,
}: {
  tab: RightPanelTab | null;
  contextState?: ContextState | null;
  sessionId?: string | null;
  workspaceRoot?: string;
  onOpenReview?: () => void;
  onReviewChanged?: () => void;
  onSendToAgent?: (text: string) => void;
  kairosFeatureEnabled: boolean;
}) {
  const { openTab } = useRightPanel();
  if (!tab) {
    return (
      <RightPanelLauncher
        sessionId={sessionId ?? null}
        onOpenReview={onOpenReview}
        kairosFeatureEnabled={kairosFeatureEnabled}
      />
    );
  }

  if (tab.kind === "kairos") {
    return kairosFeatureEnabled ? (
      <KairosRightPanelView />
    ) : (
      <RightPanelLauncher
        sessionId={sessionId ?? null}
        onOpenReview={onOpenReview}
        kairosFeatureEnabled={false}
      />
    );
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

  if (tab.kind === "terminal") {
    return (
      <Suspense fallback={<div className={RIGHT_PANEL_BODY_CLASS}>正在加载终端…</div>}>
        <LazyTerminalRenderView
          terminalId={tab.terminalId}
          sessionId={tab.sessionId}
          shellName={tab.shellName}
          onRestart={(terminal: TerminalSessionSnapshot) => openTab({
            ...tab,
            title: terminal.title,
            terminalId: terminal.id,
            shellName: terminal.shellName,
          })}
        />
      </Suspense>
    );
  }

  if (tab.kind === "terminalStarting") {
    return <TerminalStartingView />;
  }

  if (tab.kind === "terminalError") {
    return <TerminalErrorView message={tab.message} />;
  }

  if (tab.kind === "html") {
    return <HtmlTab tab={tab} />;
  }

  if (tab.kind === "markdown") {
    return <MarkdownTab tab={tab} />;
  }

  if (tab.kind === "image") {
    return <ImageRenderView src={tab.src} relativePath={tab.relativePath} />;
  }

  if (tab.kind === "csv") {
    return <CsvRenderView content={tab.content} relativePath={tab.relativePath} />;
  }

  if (tab.kind === "text") {
    return <CodeRenderView content={tab.content} language={tab.language} />;
  }

  return <ContextRenderView contextState={contextState} sessionId={sessionId} />;
}

/**
 * 工作区文件 Tab 的预览 / 源码由操作栏按钮控制（受控）；
 * 聊天生成的 markdown/html 没有操作栏，交给视图自己带切换控件（不受控）。
 */
function MarkdownTab({ tab }: { tab: Extract<RightPanelTab, { kind: "markdown" }> }) {
  const { isSourceShown, setSourceShown } = useRightPanel();
  if (!isWorkspaceFileTab(tab)) {
    return <MarkdownRenderView source={tab.source} />;
  }
  return (
    <MarkdownRenderView
      source={tab.source}
      mode={isSourceShown(tab.id) ? "source" : "preview"}
      onModeChange={(next) => setSourceShown(tab.id, next === "source")}
    />
  );
}

function HtmlTab({ tab }: { tab: Extract<RightPanelTab, { kind: "html" }> }) {
  const { isSourceShown, setSourceShown } = useRightPanel();
  if (!isWorkspaceFileTab(tab)) {
    return <HtmlRenderView html={tab.html} trust={tab.trust} relativePath={tab.relativePath} />;
  }
  return (
    <HtmlRenderView
      html={tab.html}
      trust={tab.trust}
      relativePath={tab.relativePath}
      mode={isSourceShown(tab.id) ? "source" : "preview"}
      onModeChange={(next) => setSourceShown(tab.id, next === "source")}
    />
  );
}

function RightPanelLauncher({
  sessionId,
  onOpenReview,
  kairosFeatureEnabled,
}: {
  sessionId: string | null;
  onOpenReview?: () => void;
  kairosFeatureEnabled: boolean;
}) {
  const { openFileTree, openTab } = useRightPanel();
  const { openTerminal, creatingTerminal } = useOpenTerminal(sessionId);

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
        {kairosFeatureEnabled ? (
          <LauncherButton
            label="Kairos"
            icon={<Bot size={19} strokeWidth={1.7} />}
            onClick={() => openTab({ id: "kairos", kind: "kairos", title: "Kairos" })}
          />
        ) : null}
        <LauncherButton
          label={creatingTerminal ? "Starting…" : "Terminal"}
          icon={<SquareTerminal size={19} strokeWidth={1.7} />}
          onClick={() => void openTerminal()}
          onPointerEnter={() => void preloadTerminalRenderView()}
          onFocus={() => void preloadTerminalRenderView()}
          disabled={!sessionId || creatingTerminal}
        />
        <LauncherButton
          label="Reply"
          icon={<MessageSquare size={19} strokeWidth={1.7} />}
          onClick={() => openTab({ id: "reply", kind: "replyHtml", title: "Reply", sessionId })}
        />
      </div>
    </nav>
  );
}

function LauncherButton({
  label,
  icon,
  onClick,
  onPointerEnter,
  onFocus,
  disabled = false,
}: {
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  onPointerEnter?: () => void;
  onFocus?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={RIGHT_PANEL_LAUNCHER_BUTTON_CLASS}
      disabled={disabled}
      onClick={onClick}
      onPointerEnter={onPointerEnter}
      onFocus={onFocus}
    >
      <span className={RIGHT_PANEL_LAUNCHER_ICON_CLASS} aria-hidden="true">
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}

function TerminalStartingView() {
  return (
    <section className="grid min-h-0 flex-1 place-items-center bg-surface px-6" aria-label="Terminal 正在启动">
      <div className="flex max-w-[260px] flex-col items-center text-center">
        <span className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-act-md border border-line bg-surface-subtle text-text-muted">
          <Loader2 size={17} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
        </span>
        <h2 className="m-0 text-[13px] font-semibold text-text-main">正在启动 Terminal</h2>
        <p className="mb-0 mt-1.5 text-[11px] leading-relaxed text-text-faint">正在读取本机 Shell 环境并连接当前工作区。</p>
      </div>
    </section>
  );
}

function TerminalErrorView({ message }: { message: string }) {
  return (
    <section className="grid min-h-0 flex-1 place-items-center bg-surface px-6" aria-label="Terminal 启动失败">
      <div className="max-w-[280px] rounded-act-md border border-line bg-surface-subtle px-4 py-3">
        <h2 className="m-0 text-[13px] font-semibold text-text-main">Terminal 启动失败</h2>
        <p className="mb-0 mt-1.5 text-[11px] leading-relaxed text-text-muted" role="alert">{message}</p>
      </div>
    </section>
  );
}
// 路径已统一移到工作区操作栏（②），各文件视图不再自带 path 工具条，避免相邻两行重复同一路径。
function ImageRenderView({ src, relativePath }: { src: string; relativePath?: string }) {
  return (
    <div className="grid min-h-0 flex-1 place-items-center overflow-auto bg-surface-subtle p-4">
      <img src={src} alt={relativePath ?? "预览图片"} className="max-h-full max-w-full object-contain" />
    </div>
  );
}
