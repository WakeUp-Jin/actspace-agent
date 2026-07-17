import type { AppSettings, ContextState, ContextUsageSnapshot, DeepSeekBalanceSnapshot, KimiBalanceSnapshot, MessageBlock, ModelId, SessionListItem, UsageStatisticsSnapshot, WorkspaceEntry } from "@actspace/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { FlaskConical } from "lucide-react";
import { ConversationView } from "./ConversationView";
import { PlaceholderView } from "./PlaceholderView";
import { RightPanel } from "./RightPanel";
import { useRightPanel } from "./right-panel/RightPanelContext";
import { RightPanelObjectMenu } from "./right-panel/RightPanelObjectMenu";
import { Sidebar, type NewSessionInput, type SessionUiStatusKind, type SidebarMode, type SidebarView } from "./Sidebar";
import { SplitView } from "./SplitView";
import { UsageStatisticsPage } from "./UsageStatisticsPage";
import { WindowChromeBar } from "./WindowChromeBar";
import type { ComposerReviewSummary, ComposerSendOptions, ComposerWorkspaceOption } from "./Composer";
import type { SessionPreviewResolver } from "./SessionHoverPreview";
import { KairosPage } from "../pages/KairosPage";
import { SettingsPage } from "./settings/SettingsPage";

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
const DEEPSEEK_BALANCE_REFRESH_MS = 5 * 60 * 1000;

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
  contextState,
  isStreaming = false,
  isAborting = false,
  sendScrollRequestId = 0,
  busySessionIds,
  sessionStatuses,
  onSend,
  onAbort,
  onNewSession,
  onAddWorkspace,
  onSelectSession,
  onTogglePin,
  onRenameSession,
  onArchiveSession,
  isSessionReady = true,
  defaultModelId,
  selectedModelId,
  onSelectedModelChange,
  onSettingsChange,
  onArchivedSessionsChange,
  workspaces,
  workspaceOptions,
  selectedWorkspaceRoot,
  onSelectWorkspace,
  getSessionPreview,
  reviewSummary,
  onReviewChanged,
}: {
  sessions: SessionListItem[];
  activeSessionId: string | null;
  title: string;
  messages: MessageBlock[];
  contextSnapshot: ContextUsageSnapshot | null;
  contextState?: ContextState | null;
  isStreaming?: boolean;
  isAborting?: boolean;
  sendScrollRequestId?: number;
  busySessionIds?: Set<string>;
  sessionStatuses?: Record<string, SessionUiStatusKind>;
  onSend?: (text: string, options: ComposerSendOptions) => void;
  onAbort?: () => void;
  onNewSession?: (input?: NewSessionInput) => void;
  onAddWorkspace?: () => void;
  onSelectSession?: (sessionId: string) => void;
  onTogglePin?: (sessionId: string, nextPinned: boolean) => void;
  onRenameSession?: (sessionId: string, title: string) => void;
  onArchiveSession?: (sessionId: string) => void;
  isSessionReady?: boolean;
  defaultModelId?: ModelId;
  selectedModelId?: ModelId;
  onSelectedModelChange?: (modelId: ModelId) => void;
  onSettingsChange?: (settings: AppSettings) => void;
  onArchivedSessionsChange?: () => void;
  workspaces?: WorkspaceEntry[];
  workspaceOptions?: ComposerWorkspaceOption[];
  selectedWorkspaceRoot?: string | null;
  onSelectWorkspace?: (workspaceRoot: string) => void;
  getSessionPreview?: SessionPreviewResolver;
  reviewSummary?: ComposerReviewSummary | null;
  onReviewChanged?: () => void;
}) {
  const [storedLayout] = useState(loadStoredLayout);
  const [containerWidth, setContainerWidth] = useState(0);
  const [leftMode, setLeftMode] = useState<SidebarMode>(storedLayout.leftMode);
  const [leftWidth, setLeftWidth] = useState(storedLayout.leftWidth);
  const [rightWidth, setRightWidth] = useState(storedLayout.rightWidth);
  const {
    isOpen: isRightPanelOpen,
    openPanel: openRightPanel,
    closePanel: closeRightPanel,
    openTab,
  } = useRightPanel();
  const [view, setView] = useState<SidebarView>("chat");
  const [usageSnapshot, setUsageSnapshot] = useState<UsageStatisticsSnapshot | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [deepSeekBalance, setDeepSeekBalance] = useState<DeepSeekBalanceSnapshot | null>(null);
  const [deepSeekBalanceLoading, setDeepSeekBalanceLoading] = useState(false);
  const [deepSeekBalanceError, setDeepSeekBalanceError] = useState<string | null>(null);
  const [kimiBalance, setKimiBalance] = useState<KimiBalanceSnapshot | null>(null);
  const [kimiBalanceLoading, setKimiBalanceLoading] = useState(false);
  const [kimiBalanceError, setKimiBalanceError] = useState<string | null>(null);
  const reviewTabRefreshCounterRef = useRef(0);
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

      closeRightPanel();
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
      closeRightPanel();
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
      closeRightPanel();
      return;
    }

    if (containerWidth > 0 && containerWidth - displayedLeftWidth - RIGHT_MIN_WIDTH < MAIN_MIN_WIDTH) {
      setLeftMode("hidden");
    }

    openRightPanel();
  }

  const openReviewTab = useCallback(() => {
    const workspaceKey = selectedWorkspaceRoot ?? "default";
    const refreshKey = ++reviewTabRefreshCounterRef.current;
    openTab({
      id: `review:${workspaceKey}:git:uncommitted`,
      kind: "review",
      title: "Review",
      workspaceRoot: selectedWorkspaceRoot ?? undefined,
      scope: "uncommitted",
      refreshKey,
    });
    onReviewChanged?.();
  }, [onReviewChanged, openTab, selectedWorkspaceRoot]);

  const handleSelectView = useCallback((next: SidebarView) => {
    setView(next);
  }, []);

  const loadUsageStatistics = useCallback(async (
    range: UsageStatisticsSnapshot["range"] = "month",
    requestRowsPage = 1,
  ) => {
    if (typeof window === "undefined" || !window.actspace?.getUsageStatistics) {
      setUsageSnapshot(null);
      setUsageError(null);
      return;
    }

    setUsageLoading(true);
    setUsageError(null);
    try {
      // 不传 sessionId 即走 main 的 global 路径：聚合所有 session + Kairos 的全部历史。
      const snapshot = await window.actspace.getUsageStatistics({
        range,
        scope: "global",
        requestRowsPage: { page: requestRowsPage },
      });
      setUsageSnapshot(snapshot);
    } catch (error) {
      console.error("Failed to load usage statistics", error);
      setUsageSnapshot(null);
      setUsageError(error instanceof Error ? error.message : "Failed to load usage statistics.");
    } finally {
      setUsageLoading(false);
    }
  }, []);

  const loadDeepSeekBalance = useCallback(async () => {
    if (typeof window === "undefined" || !window.actspace?.getDeepSeekBalance) {
      setDeepSeekBalance(null);
      setDeepSeekBalanceError(null);
      return;
    }

    setDeepSeekBalanceLoading(true);
    setDeepSeekBalanceError(null);
    try {
      const balance = await window.actspace.getDeepSeekBalance();
      setDeepSeekBalance(balance);
    } catch (error) {
      console.error("Failed to load DeepSeek balance", error);
      setDeepSeekBalanceError(error instanceof Error ? error.message : "Failed to load DeepSeek balance.");
    } finally {
      setDeepSeekBalanceLoading(false);
    }
  }, []);

  const loadKimiBalance = useCallback(async () => {
    if (typeof window === "undefined" || !window.actspace?.getKimiBalance) {
      setKimiBalance(null);
      setKimiBalanceError(null);
      return;
    }

    setKimiBalanceLoading(true);
    setKimiBalanceError(null);
    try {
      const balance = await window.actspace.getKimiBalance();
      setKimiBalance(balance);
    } catch (error) {
      console.error("Failed to load Kimi balance", error);
      setKimiBalanceError(error instanceof Error ? error.message : "Failed to load Kimi balance.");
    } finally {
      setKimiBalanceLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view !== "usage") return;
    loadUsageStatistics().catch((error: unknown) => {
      console.error("Failed to bootstrap usage statistics", error);
    });
  }, [view, loadUsageStatistics]);

  useEffect(() => {
    if (view !== "usage") return;
    const refreshAll = () => {
      loadDeepSeekBalance().catch((error: unknown) => {
        console.error("Failed to refresh DeepSeek balance", error);
      });
      loadKimiBalance().catch((error: unknown) => {
        console.error("Failed to refresh Kimi balance", error);
      });
    };
    refreshAll();

    const timer = window.setInterval(refreshAll, DEEPSEEK_BALANCE_REFRESH_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [view, loadDeepSeekBalance, loadKimiBalance]);

  // 设置走「整页接管」：不渲染聊天侧栏与右栏，由 SettingsPage 自带导航 + 内容两栏。
  if (view === "settings") {
    return (
      <SettingsPage
        onBack={() => setView("chat")}
        onSettingsChange={onSettingsChange}
        onArchivedSessionsChange={onArchivedSessionsChange}
      />
    );
  }

  let mainContent;
  if (view === "lab") {
    // Lab 仍在产品设计阶段：原型实现保留在 LabPage.tsx，功能定型后换回 <LabPage />。
    mainContent = (
      <PlaceholderView
        eyebrow="Lab"
        title="Lab 功能正在开发中"
        description="实验台用于沉淀 Agent 的假说、验证证据与能力产物。当前功能还在设计与开发中，暂未开放使用。"
        bullets={[
          "假说构建 → 实证验证 → 能力锻造 → 晋升评审的四阶段实验流",
          "实验证据与产物的统一归档",
          "已完成实验的回溯与复盘",
        ]}
        icon={<FlaskConical size={22} strokeWidth={1.9} />}
      />
    );
  } else if (view === "usage") {
    mainContent = (
      <UsageStatisticsPage
        snapshot={usageSnapshot}
        isLoading={usageLoading}
        error={usageError}
        onRefresh={loadUsageStatistics}
        onRequestPageChange={(page, nextRange) => loadUsageStatistics(nextRange, page)}
        deepSeekBalance={deepSeekBalance}
        isDeepSeekBalanceLoading={deepSeekBalanceLoading}
        deepSeekBalanceError={deepSeekBalanceError}
        onRefreshDeepSeekBalance={loadDeepSeekBalance}
        kimiBalance={kimiBalance}
        isKimiBalanceLoading={kimiBalanceLoading}
        kimiBalanceError={kimiBalanceError}
        onRefreshKimiBalance={loadKimiBalance}
        onBackToChat={() => setView("chat")}
        workspaces={workspaces}
      />
    );
  } else if (view === "kairos") {
    mainContent = <KairosPage />;
  } else {
    mainContent = (
      <ConversationView
        messages={messages}
        contextSnapshot={contextSnapshot}
        sessionId={activeSessionId}
        isStreaming={isStreaming}
        isAborting={isAborting}
        sendScrollRequestId={sendScrollRequestId}
        onSend={onSend}
        onAbort={onAbort}
        isSessionReady={isSessionReady}
        defaultModelId={defaultModelId}
        selectedModelId={selectedModelId}
        onSelectedModelChange={onSelectedModelChange}
        workspaceOptions={workspaceOptions}
        selectedWorkspaceRoot={selectedWorkspaceRoot}
        onSelectWorkspace={onSelectWorkspace}
        reviewSummary={reviewSummary}
        onOpenReview={openReviewTab}
      />
    );
  }

  const chromeTitle =
    view === "lab" ? "Lab"
    : view === "usage" ? "Usage"
    : view === "kairos" ? "Kairos"
    : title;
  const currentSession = view === "chat"
    ? sessions.find((session) => session.id === activeSessionId) ?? null
    : null;

  return (
    <>
      <WindowChromeBar
        leftMode={leftMode}
        rightOpen={isRightPanelOpen}
        title={chromeTitle}
        onToggleLeft={toggleSidebarMode}
        onToggleRight={toggleRightPanel}
        showRightToggle={view !== "kairos"}
        currentSession={currentSession}
        getSessionPreview={view === "chat" ? getSessionPreview : undefined}
        rightLeading={
          view === "chat" && isRightPanelOpen ? (
            <RightPanelObjectMenu sessionId={activeSessionId} onOpenReview={openReviewTab} />
          ) : undefined
        }
      />
      <SplitView
        left={
          <Sidebar
            sessions={sessions}
            workspaces={workspaces}
            activeSessionId={activeSessionId}
            mode={leftMode}
            view={view}
            busySessionIds={busySessionIds}
            sessionStatuses={sessionStatuses}
            onToggleMode={toggleSidebarMode}
            onNewSession={onNewSession}
            onAddWorkspace={onAddWorkspace}
            onSelectSession={onSelectSession}
            onTogglePin={onTogglePin}
            onRename={onRenameSession}
            onArchive={onArchiveSession}
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
        right={
          view === "chat" && isRightPanelOpen ? (
            <RightPanel
              contextState={contextState}
              sessionId={activeSessionId}
              workspaceRoot={selectedWorkspaceRoot ?? undefined}
              onOpenReview={openReviewTab}
              onReviewChanged={onReviewChanged}
            />
          ) : undefined
        }
        rightBounds={{ minWidth: RIGHT_MIN_WIDTH, maxWidth: rightMaxWidth }}
        rightSeparatorLabel="Resize preview panel"
        rightWidth={rightWidth}
      />
    </>
  );
}
