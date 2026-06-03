import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { PanelLeft, PanelRight, Search } from "lucide-react";
import type { SessionListItem } from "@actspace/shared";
import type { SidebarMode } from "./Sidebar";
import { SessionHoverPreviewCard } from "./SessionHoverPreview";
import type { SessionHoverPreview, SessionPreviewResolver } from "./SessionHoverPreview";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/Tooltip";

const CHROME_TITLE_HOVER_CONTENT_CLASS = "!max-w-[420px] !p-0 !font-normal !leading-normal";

/**
 * 窗口顶部 chrome 浮层，参考 Cursor Agent Window 的 `.part.titlebar` 实现。
 *
 * 设计要点（一次性解决过去四轮 sidebar 折叠 bug 的共同根因）：
 *
 *  - 整层 `position: fixed top:0 left:0 right:0`，覆盖在所有 split panes 上方。
 *  - 浮层容器自身 `pointer-events: none` → 不会偷下方三栏 / 内容区的任何点击；
 *    内部三段（chrome-left / chrome-center / chrome-right）再恢复 `pointer-events: auto`。
 *  - Window drag region 唯一保留在 `.chrome-center`，所有按钮显式 `no-drag`，
 *    避免 Electron 在 macOS 上「父级 drag + 浮层 no-drag」的 hit-test bug 抢点击。
 *  - 三段沿 X 轴拼接，互不重叠：左侧固定按钮宽 + 右侧固定按钮宽 + 中间 flex 1。
 *  - chrome bar 自身透明，没有 background / border-bottom；下方三栏的背景自然贯顶。
 *
 * 三栏（Sidebar / ConversationView / RightPanel）需要各自顶部留出
 * `var(--window-chrome-strip-height)` 的 `padding-top`，让浮层覆盖到自己顶部时
 * 不挡住实际内容。
 */
export type WindowChromeBarProps = {
  leftMode: SidebarMode;
  rightOpen: boolean;
  title: string;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  onOpenSearch?: () => void;
  showRightToggle?: boolean;
  currentSession?: SessionListItem | null;
  getSessionPreview?: SessionPreviewResolver;
  /** 渲染在右侧折叠按钮左侧的额外控件（如「+ 新建对象」菜单）。 */
  rightLeading?: ReactNode;
};

export function WindowChromeBar({
  leftMode,
  rightOpen,
  title,
  onToggleLeft,
  onToggleRight,
  onOpenSearch,
  showRightToggle = true,
  currentSession,
  getSessionPreview,
  rightLeading,
}: WindowChromeBarProps) {
  const isLeftHidden = leftMode === "hidden";

  return (
    <div className="window-chrome-bar" role="presentation">
      <div className="chrome-left">
        <button
          className="chrome-button chrome-toggle-left"
          type="button"
          aria-label={isLeftHidden ? "Expand session sidebar" : "Collapse session sidebar"}
          title={isLeftHidden ? "Expand sidebar" : "Collapse sidebar"}
          aria-pressed={!isLeftHidden}
          onClick={onToggleLeft}
        >
          <PanelLeft size={15} strokeWidth={1.8} />
        </button>
        <button
          className="chrome-button"
          type="button"
          aria-label="Search sessions"
          title="Search"
          onClick={onOpenSearch}
        >
          <Search size={14} strokeWidth={1.8} />
        </button>
      </div>
      <div className="chrome-center">
        <ChromeTitle
          title={title}
          currentSession={currentSession ?? null}
          getSessionPreview={getSessionPreview}
        />
      </div>
      <div className="chrome-right">
        {rightLeading}
        {showRightToggle ? (
          <button
            className="chrome-button chrome-toggle-right"
            type="button"
            aria-label={rightOpen ? "Close panel" : "Open panel"}
            aria-pressed={rightOpen}
            title={rightOpen ? "Close right panel" : "Open right panel"}
            onClick={onToggleRight}
          >
            <PanelRight size={15} strokeWidth={1.8} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ChromeTitle({
  title,
  currentSession,
  getSessionPreview,
}: {
  title: string;
  currentSession: SessionListItem | null;
  getSessionPreview?: SessionPreviewResolver;
}) {
  const [preview, setPreview] = useState<SessionHoverPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const loadedSessionIdRef = useRef<string | null>(null);
  const loadingSessionIdRef = useRef<string | null>(null);
  const canShowPreview = Boolean(currentSession && getSessionPreview);

  useEffect(() => {
    setOpen(false);
    setPreview(null);
    setLoading(false);
    loadedSessionIdRef.current = null;
    loadingSessionIdRef.current = null;
  }, [currentSession?.id]);

  const loadPreview = async () => {
    if (!currentSession || !getSessionPreview) return;
    if (loadedSessionIdRef.current === currentSession.id || loadingSessionIdRef.current === currentSession.id) return;

    loadingSessionIdRef.current = currentSession.id;
    setLoading(true);
    try {
      setPreview(await getSessionPreview(currentSession));
      loadedSessionIdRef.current = currentSession.id;
    } catch (error) {
      console.error("Failed to load current session preview", error);
      setPreview(null);
      loadedSessionIdRef.current = currentSession.id;
    } finally {
      loadingSessionIdRef.current = null;
      setLoading(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    const resolvedOpen = nextOpen && canShowPreview;
    setOpen(resolvedOpen);
    if (resolvedOpen) {
      void loadPreview();
    }
  };

  if (!canShowPreview || !currentSession) {
    return <h1 className="chrome-title" title={title}>{title}</h1>;
  }

  return (
    <Tooltip delayDuration={250} open={open} onOpenChange={handleOpenChange}>
      <TooltipTrigger asChild>
        <button className="chrome-title chrome-title-trigger" type="button" aria-label={`Show session details for ${title}`}>
          {title}
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        align="center"
        sideOffset={10}
        className={CHROME_TITLE_HOVER_CONTENT_CLASS}
        onPointerDown={(event) => event.preventDefault()}
      >
        <SessionHoverPreviewCard
          session={currentSession}
          title={title}
          preview={preview}
          loading={loading}
        />
      </TooltipContent>
    </Tooltip>
  );
}
