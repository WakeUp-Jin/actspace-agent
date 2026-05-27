import type { ContextUsageSnapshot, MessageBlock, SessionListItem, UsageStatisticsSnapshot } from "@actspace/shared";
import { useCallback, useEffect, useState } from "react";
import { ConversationView } from "./ConversationView";
import { LabPage } from "./LabPage";
import { RightPanel } from "./RightPanel";
import { Sidebar, type SidebarMode, type SidebarView } from "./Sidebar";
import { SplitView } from "./SplitView";
import { UsageStatisticsPage } from "./UsageStatisticsPage";
import { WindowChromeBar } from "./WindowChromeBar";
import type { ComposerSendOptions } from "./Composer";
import { KairosPage } from "../pages/KairosPage";

type StoredWorkbenchLayout = {
  leftMode?: SidebarMode | "rail";
  leftWidth?: number;
  rightWidth?: number;
};

const WORKBENCH_LAYOUT_STORAGE_KEY = "actspace.workbench.layout.v1";
const LEFT_DEFAULT_WIDTH = 260;
const LEFT_MIN_WIDTH = 200;
const LEFT_MAX_WIDTH = 360;
/** 拖拽左侧分隔条到该阈值以下时，sidebar 自动 snap 到 hidden 态（rail 模式已退役）。 */
const LEFT_HIDE_SNAP_WIDTH = 148;
const MAIN_MIN_WIDTH = 560;
const RIGHT_DEFAULT_WIDTH = 390;
const RIGHT_MIN_WIDTH = 320;
const RIGHT_MAX_WIDTH = 640;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

type ResolvedLayout = {
  leftMode: SidebarMode;
  leftWidth: number;
  rightWidth: number;
};

function loadStoredLayout(): ResolvedLayout {
  if (typeof window === "undefined") {
    return {
      leftMode: "expanded",
      leftWidth: LEFT_DEFAULT_WIDTH,
      rightWidth: RIGHT_DEFAULT_WIDTH
    };
  }

  try {
    const stored = JSON.parse(window.localStorage.getItem(WORKBENCH_LAYOUT_STORAGE_KEY) ?? "{}") as StoredWorkbenchLayout;
    // 老版本可能落了 leftMode: "rail"，rail 已退役，统一映射成 hidden。
    const resolvedMode: SidebarMode =
      stored.leftMode === "hidden" || stored.leftMode === "rail" ? "hidden" : "expanded";
    return {
      leftMode: resolvedMode,
      leftWidth: clamp(stored.leftWidth ?? LEFT_DEFAULT_WIDTH, LEFT_MIN_WIDTH, LEFT_MAX_WIDTH),
      rightWidth: clamp(stored.rightWidth ?? RIGHT_DEFAULT_WIDTH, RIGHT_MIN_WIDTH, RIGHT_MAX_WIDTH)
    };
  } catch {
    return {
      leftMode: "expanded",
      leftWidth: LEFT_DEFAULT_WIDTH,
      rightWidth: RIGHT_DEFAULT_WIDTH
    };
  }
}

export function WorkbenchLayout({
  sessions,
  activeSessionId,
  title,
  messages,
  contextSnapshot,
  rightPanelOpen = false,
  isStreaming = false,
  isAborting = false,
  sendScrollRequestId = 0,
  busySessionIds,
  onSend,
  onAbort,
  onNewSession,
  onSelectSession,
  onTogglePin,
  showDemoAttachments = false,
}: {
  sessions: SessionListItem[];
  activeSessionId: string | null;
  title: string;
  messages: MessageBlock[];
  contextSnapshot: ContextUsageSnapshot | null;
  rightPanelOpen?: boolean;
  isStreaming?: boolean;
  isAborting?: boolean;
  sendScrollRequestId?: number;
  busySessionIds?: Set<string>;
  onSend?: (text: string, options: ComposerSendOptions) => void;
  onAbort?: () => void;
  onNewSession?: () => void;
  onSelectSession?: (sessionId: string) => void;
  onTogglePin?: (sessionId: string, nextPinned: boolean) => void;
  showDemoAttachments?: boolean;
}) {
  const [storedLayout] = useState(loadStoredLayout);
  const [containerWidth, setContainerWidth] = useState(0);
  const [leftMode, setLeftMode] = useState<SidebarMode>(storedLayout.leftMode);
  const [leftWidth, setLeftWidth] = useState(storedLayout.leftWidth);
  const [rightWidth, setRightWidth] = useState(storedLayout.rightWidth);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(rightPanelOpen);
  const [view, setView] = useState<SidebarView>("chat");
  const [usageSnapshot, setUsageSnapshot] = useState<UsageStatisticsSnapshot | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);
  const isSidebarHidden = leftMode === "hidden";
  const displayedLeftWidth = isSidebarHidden ? 0 : leftWidth;
  const rightMaxWidth = containerWidth > 0 ? Math.max(RIGHT_MIN_WIDTH, Math.min(RIGHT_MAX_WIDTH, containerWidth / 2)) : RIGHT_MAX_WIDTH;

  const handleContainerWidthChange = useCallback((width: number) => {
    setContainerWidth(width);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      WORKBENCH_LAYOUT_STORAGE_KEY,
      JSON.stringify({
        leftMode,
        leftWidth,
        rightWidth
      })
    );
  }, [leftMode, leftWidth, rightWidth]);

  useEffect(() => {
    if (containerWidth === 0) {
      return;
    }

    if (leftMode === "expanded" && containerWidth - leftWidth < MAIN_MIN_WIDTH) {
      setLeftMode("hidden");
      return;
    }

    if (!isRightPanelOpen) {
      return;
    }

    const currentLeftWidth = isSidebarHidden ? 0 : leftWidth;
    if (containerWidth - currentLeftWidth - RIGHT_MIN_WIDTH < MAIN_MIN_WIDTH) {
      if (leftMode === "expanded") {
        setLeftMode("hidden");
        return;
      }

      setIsRightPanelOpen(false);
      return;
    }

    const allowedRightWidth = Math.min(rightMaxWidth, containerWidth - currentLeftWidth - MAIN_MIN_WIDTH);
    if (rightWidth > allowedRightWidth) {
      setRightWidth(clamp(allowedRightWidth, RIGHT_MIN_WIDTH, rightMaxWidth));
    }
  }, [containerWidth, isRightPanelOpen, isSidebarHidden, leftMode, leftWidth, rightMaxWidth, rightWidth]);

  function toggleSidebarMode() {
    if (leftMode === "expanded") {
      setLeftMode("hidden");
      return;
    }

    setLeftMode("expanded");
    if (isRightPanelOpen && containerWidth - leftWidth - rightWidth < MAIN_MIN_WIDTH) {
      setIsRightPanelOpen(false);
    }
  }

  function resizeLeftPanel(width: number) {
    if (width <= LEFT_HIDE_SNAP_WIDTH) {
      setLeftMode("hidden");
      return;
    }

    setLeftMode("expanded");
    setLeftWidth(clamp(width, LEFT_MIN_WIDTH, LEFT_MAX_WIDTH));
  }

  function toggleRightPanel() {
    if (isRightPanelOpen) {
      setIsRightPanelOpen(false);
      return;
    }

    if (containerWidth > 0 && containerWidth - displayedLeftWidth - RIGHT_MIN_WIDTH < MAIN_MIN_WIDTH) {
      setLeftMode("hidden");
    }

    setIsRightPanelOpen(true);
  }

  const handleSelectView = useCallback((next: SidebarView) => {
    setView(next);
  }, []);

  const loadUsageStatistics = useCallback(async (range: UsageStatisticsSnapshot["range"] = "month") => {
    const sessionId = activeSessionId ?? sessions[0]?.id ?? null;
    if (!sessionId) {
      setUsageSnapshot(null);
      setUsageError("No session selected.");
      return;
    }

    if (typeof window === "undefined" || !window.actspace?.getUsageStatistics) {
      setUsageSnapshot(null);
      setUsageError(null);
      return;
    }

    setUsageLoading(true);
    setUsageError(null);
    try {
      const snapshot = await window.actspace.getUsageStatistics({ sessionId, range });
      setUsageSnapshot(snapshot);
    } catch (error) {
      console.error("Failed to load usage statistics", error);
      setUsageSnapshot(null);
      setUsageError(error instanceof Error ? error.message : "Failed to load usage statistics.");
    } finally {
      setUsageLoading(false);
    }
  }, [activeSessionId, sessions]);

  useEffect(() => {
    if (view !== "usage") return;
    loadUsageStatistics().catch((error: unknown) => {
      console.error("Failed to bootstrap usage statistics", error);
    });
  }, [view, loadUsageStatistics]);

  let mainContent;
  if (view === "lab") {
    mainContent = <LabPage />;
  } else if (view === "usage") {
    mainContent = (
      <UsageStatisticsPage
        snapshot={usageSnapshot}
        isLoading={usageLoading}
        error={usageError}
        onRefresh={loadUsageStatistics}
        onBackToChat={() => setView("chat")}
      />
    );
  } else if (view === "kairos") {
    mainContent = <KairosPage />;
  } else {
    mainContent = (
      <ConversationView
        messages={messages}
        contextSnapshot={contextSnapshot}
        isStreaming={isStreaming}
        isAborting={isAborting}
        sendScrollRequestId={sendScrollRequestId}
        onSend={onSend}
        onAbort={onAbort}
        showDemoAttachments={showDemoAttachments}
      />
    );
  }

  const chromeTitle =
    view === "lab" ? "Lab"
    : view === "usage" ? "Usage"
    : view === "kairos" ? "Kairos"
    : title;

  return (
    <>
      <WindowChromeBar
        leftMode={leftMode}
        rightOpen={isRightPanelOpen}
        title={chromeTitle}
        onToggleLeft={toggleSidebarMode}
        onToggleRight={toggleRightPanel}
      />
      <SplitView
        left={
          <Sidebar
            sessions={sessions}
            activeSessionId={activeSessionId}
            mode={leftMode}
            view={view}
            busySessionIds={busySessionIds}
            onToggleMode={toggleSidebarMode}
            onNewSession={onNewSession}
            onSelectSession={onSelectSession}
            onTogglePin={onTogglePin}
            onSelectView={handleSelectView}
          />
        }
        leftWidth={displayedLeftWidth}
        leftHidden={isSidebarHidden}
        leftBounds={{ minWidth: LEFT_MIN_WIDTH, maxWidth: LEFT_MAX_WIDTH }}
        leftSeparatorLabel="Resize session sidebar"
        main={mainContent}
        minMainWidth={MAIN_MIN_WIDTH}
        onContainerWidthChange={handleContainerWidthChange}
        onLeftKeyResize={(width) => {
          if (isSidebarHidden && width > LEFT_HIDE_SNAP_WIDTH) {
            setLeftMode("expanded");
            setLeftWidth(LEFT_MIN_WIDTH);
            return;
          }

          resizeLeftPanel(width);
        }}
        onLeftResize={resizeLeftPanel}
        onLeftSeparatorDoubleClick={toggleSidebarMode}
        onRightResize={(width) => setRightWidth(clamp(width, RIGHT_MIN_WIDTH, rightMaxWidth))}
        onRightSeparatorDoubleClick={() => setRightWidth(RIGHT_DEFAULT_WIDTH)}
        right={view === "chat" && isRightPanelOpen ? <RightPanel /> : undefined}
        rightBounds={{ minWidth: RIGHT_MIN_WIDTH, maxWidth: rightMaxWidth }}
        rightSeparatorLabel="Resize preview panel"
        rightWidth={rightWidth}
      />
    </>
  );
}
