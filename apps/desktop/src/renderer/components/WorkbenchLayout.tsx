import { PerformancePanel } from "./PerformancePanel";
import { DEFAULT_MODEL_ID } from "@actspace/shared";
import type { AppSettings, SessionListItem, SettingsV4Snapshot, UsageActivitySnapshot, UsageStatisticsSnapshot, WorkspaceEntry } from "@actspace/shared";
import { FlaskConical } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useActiveSession } from "../session/active-session-context";
import { useSessionActions } from "../session/session-actions-context";
import { useComposerContext } from "./composer/composer-context";
import { ConversationView } from "./ConversationView";
import { PlaceholderView } from "./PlaceholderView";
import { RightPanel } from "./RightPanel";
import { useRightPanel } from "./right-panel/RightPanelContext";
import { useAgentEditSignals } from "./right-panel/useFileFreshness";
import { RightPanelObjectMenu } from "./right-panel/RightPanelObjectMenu";
import { Sidebar, type SessionUiStatusKind, type SidebarView } from "./Sidebar";
import { SplitView } from "./SplitView";
import { WindowChromeBar } from "./WindowChromeBar";
import type { SessionMainView } from "./SessionViewToggle";
import { WorkspaceChromeControls } from "./workspace/WorkspaceChromeControls";
import type { ComposerReviewSummary } from "./Composer";
import { useRunTargetContext } from "../target/run-target-context";
import type { SessionPreviewResolver } from "./SessionHoverPreview";
import { selectComposer, selectRequestContextEstimate, selectSurfaceMessages } from "@actspace/client/sessions";
import { contextEstimateToSnapshot, useOptionalSessionProjection } from "../session";
import { ExtensionsPage } from "./extensions/ExtensionsPage";
import { SettingsPage } from "./settings/SettingsPage";
import type { SettingsSectionId } from "./settings/SettingsNav";
import { usageApi } from "../api/usage";
import { collectEditedFilePaths } from "./workbench/edited-files";
import { PermissionModeControl } from "./workbench/PermissionModeControl";
import { LEFT_MAX_WIDTH, LEFT_MIN_WIDTH, MAIN_MIN_WIDTH, RIGHT_MIN_WIDTH, usePanelLayout } from "./workbench/use-panel-layout";
import { useSessionHistory } from "./workbench/use-session-history";

export function WorkbenchLayout({
  sessions,
  busySessionIds,
  sessionStatuses,
  onSettingsChange,
  onArchivedSessionsChange,
  workspaces,
  getSessionPreview,
  reviewSummary,
  onReviewChanged,
}: {
  sessions: SessionListItem[];
  busySessionIds?: Set<string>;
  sessionStatuses?: Record<string, SessionUiStatusKind>;
  onSettingsChange?: (settings: AppSettings) => void;
  onArchivedSessionsChange?: () => void;
  workspaces?: WorkspaceEntry[];
  getSessionPreview?: SessionPreviewResolver;
  reviewSummary?: ComposerReviewSummary | null;
  onReviewChanged?: () => void;
}) {
  const { sessionId: activeSessionId, title, messages, contextSnapshot, contextState, isStreaming, isSessionReady, onSend } = useActiveSession();
  const { composerMode, selectedModelId, defaultModelId, selectedSkills } = useComposerContext();
  const { onSelectSession } = useSessionActions();
  const { capabilities, selectedWorkspaceRoot } = useRunTargetContext();
  const reviewEnabled = capabilities.review.enabled;
  const terminalEnabled = capabilities.terminal.enabled;
  const {
    isOpen: isRightPanelOpen,
    openPanel: openRightPanel,
    closePanel: closeRightPanel,
    openTab,
  } = useRightPanel();
  const {
    isCompactLayout, leftMode, isSidebarHidden, displayedLeftWidth, rightWidth, rightMaxWidth, compactSidebarOpen, setCompactSidebarOpen, chromeLeftMode,
    handleContainerWidthChange, toggleSidebarMode, toggleRightPanel, resizeLeftPanel, keyResizeLeftPanel, resizeRightPanel, resetRightWidth,
  } = usePanelLayout({ isOpen: isRightPanelOpen, openPanel: openRightPanel, closePanel: closeRightPanel });
  const sessionProjection = useOptionalSessionProjection();
  const projectionCell = sessionProjection?.cell ?? null;
  const projectedSurfaceMessages = projectionCell ? selectSurfaceMessages(projectionCell) : [];
  const projectedContextEstimate = projectionCell ? selectRequestContextEstimate(projectionCell) : null;
  const projectedComposer = projectionCell ? selectComposer(projectionCell) : null;
  const projectedContextSnapshot = projectedContextEstimate
    ? contextEstimateToSnapshot(projectedContextEstimate)
    : null;
  // The fixed request-context projection shares the popup's complete bucket estimate.
  const liveContextState = projectedContextEstimate?.contextState;
  const useLiveContext = liveContextState && (!contextState || (liveContextState.throughJournalSeq ?? -1) > (contextState.throughJournalSeq ?? -1));
  const effectiveContextState = useLiveContext ? liveContextState : contextState;
  const effectiveContextSnapshot = useLiveContext ? projectedContextSnapshot : contextSnapshot ?? projectedContextSnapshot;
  const projectionSessionReady = projectionCell !== null && projectionCell.status !== "error";
  const permissionMode = projectionCell?.snapshot?.permissionMode ?? "default";
  const effectiveIsSessionReady = projectedComposer?.phase !== "blank" || isSessionReady || projectionSessionReady;
  const [view, setView] = useState<SidebarView>("chat");
  const sessionViewByIdRef = useRef(new Map<string, SessionMainView>());
  const [sessionMainView, setSessionMainView] = useState<SessionMainView>("chat");
  const [settingsSection, setSettingsSection] = useState<SettingsSectionId>("general");
  const [focusSpeech, setFocusSpeech] = useState(false);
  const [usageSnapshot, setUsageSnapshot] = useState<UsageStatisticsSnapshot | null>(null);
  const [usageActivitySnapshot, setUsageActivitySnapshot] = useState<UsageActivitySnapshot | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);
  const { canGoBack, canGoForward, navigateSessionHistory } = useSessionHistory(activeSessionId, onSelectSession);
  const reviewTabRefreshCounterRef = useRef(0);

  useEffect(() => {
    setSessionMainView(activeSessionId ? sessionViewByIdRef.current.get(activeSessionId) ?? "chat" : "chat");
  }, [activeSessionId]);

  const toggleSessionMainView = useCallback(() => {
    setSessionMainView((current) => {
      const next: SessionMainView = current === "chat" ? "trajectory" : "chat";
      if (activeSessionId) {
        sessionViewByIdRef.current.set(activeSessionId, next);
      }
      return next;
    });
  }, [activeSessionId]);

  const openReviewTab = useCallback(() => {
    if (!reviewEnabled) return;
    const refreshKey = ++reviewTabRefreshCounterRef.current;
    openTab({
      id: "review",
      kind: "review",
      title: "Review",
      workspaceRoot: selectedWorkspaceRoot ?? undefined,
      scope: "uncommitted",
      refreshKey,
    });
    onReviewChanged?.();
  }, [reviewEnabled, onReviewChanged, openTab, selectedWorkspaceRoot]);

  const openHostSettings = useCallback(() => {
    setSettingsSection("hosts");
    setView("settings");
  }, []);

  const handleSelectView = useCallback((next: SidebarView) => {
    setView(next);
    setCompactSidebarOpen(false);
  }, []);

  const usageLoadSequence = useRef(0);
  const loadUsageStatistics = useCallback(async (
    range: UsageStatisticsSnapshot["range"] = "month",
    requestRowsPage = 1,
    status: SettingsV4Snapshot["settings"]["activity"]["usage"]["status"] = "all",
    search = "",
    kind?: import("@actspace/shared").UsageActivityKind,
  ) => {
    const sequence = ++usageLoadSequence.current;
    setUsageLoading(true);
    setUsageError(null);
    try {
      // 不传 sessionId 即走 main 的 global 路径，聚合所有 Session 历史。
      const input = {
        range,
        search,
        kind,
        scope: "global",
        ...(status === "all" ? {} : { status }),
        requestRowsPage: { page: requestRowsPage },
      } as const;
      const activitySnapshot = await usageApi.getActivity(input);
      if (sequence !== usageLoadSequence.current) return;
      setUsageActivitySnapshot(activitySnapshot);
    } catch (error) {
      if (sequence !== usageLoadSequence.current) return;
      console.error("Failed to load usage statistics", error);
      setUsageError(error instanceof Error ? error.message : "使用统计加载失败，请重试。");
    } finally {
      if (sequence === usageLoadSequence.current) setUsageLoading(false);
    }
  }, []);

  // UsageStatisticsPage requests its persisted range after mounting.

  const permissionControl = activeSessionId && composerMode !== "chat" ? (
    <PermissionModeControl
      sessionId={activeSessionId}
      mode={permissionMode}
      disabled={false}
      onChanged={async () => { await sessionProjection?.bridge?.open(activeSessionId); }}
    />
  ) : null;

  let mainContent;
  if (view === "extensions") {
    mainContent = (
      <div className="h-full min-h-0 pt-[var(--window-chrome-strip-height)]">
        <ExtensionsPage onSettingsChange={onSettingsChange} onConfigureSpeech={() => { setSettingsSection("general"); setFocusSpeech(true); setView("settings"); }} />
      </div>
    );
  } else if (view === "lab") {
    // Lab 仍在产品设计阶段，入口先显示占位页；功能定型后再实现。
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
  } else {
    mainContent = (
      <ConversationView
        contextSnapshot={effectiveContextSnapshot}
        contextState={effectiveContextState}
        durableSurfaceMessageCount={projectedSurfaceMessages.length > 0 ? projectedSurfaceMessages.length : undefined}
        composerPhase={projectedComposer?.phase}
        isSessionReady={effectiveIsSessionReady}
        reviewSummary={composerMode === "chat" || !reviewEnabled ? null : reviewSummary}
        onOpenReview={composerMode === "chat" || !reviewEnabled ? undefined : openReviewTab}
        activeView={sessionMainView}
        permissionControl={permissionControl}
        onConnectHost={openHostSettings}
      />
    );
  }

  const chromeTitle = view === "extensions" ? "扩展" : view === "lab" ? "Lab" : title;
  const currentSession = view === "chat"
    ? sessions.find((session) => session.id === activeSessionId) ?? null
    : null;
  // 右侧文件 Tab 的新鲜度信号（见 `right-panel/useFileFreshness.ts`）：
  // ① Agent 本轮编辑过的文件路径 → 精确打过期标记；
  // ② turn 从「进行中」变为「结束」时递增一个 key → 触发一次 mtime 兜底重校验，
  //    覆盖 bash 脚本写文件这类不产生 diff 块的间接改动。
  const agentEditedPaths = useMemo(() => collectEditedFilePaths(messages), [messages]);
  useAgentEditSignals(agentEditedPaths);
  const [fileRevalidateKey, setFileRevalidateKey] = useState(0);
  const wasStreamingRef = useRef(isStreaming);
  useEffect(() => {
    if (wasStreamingRef.current && !isStreaming) {
      setFileRevalidateKey((key) => key + 1);
    }
    wasStreamingRef.current = isStreaming;
  }, [isStreaming]);

  // 设置走「整页接管」：不渲染聊天侧栏与右栏，由 SettingsPage 自带导航 + 内容两栏。
  // 该返回必须位于本组件的 Hooks 之后，确保切换页面时 Hook 调用顺序稳定。
  if (view === "settings") {
    return (
      <SettingsPage
        onBack={() => setView("chat")}
        initialSection={settingsSection}
        focusSpeech={focusSpeech}
        onSpeechFocused={() => setFocusSpeech(false)}
        onSectionChange={setSettingsSection}
        onSettingsChange={onSettingsChange}
        onArchivedSessionsChange={onArchivedSessionsChange}
        usageSnapshot={usageSnapshot}
        usageActivitySnapshot={usageActivitySnapshot}
        usageLoading={usageLoading}
        usageError={usageError}
        onUsageRefresh={(nextRange, requestRowsPage, status, search, kind) => {
          void loadUsageStatistics(nextRange, requestRowsPage, status, search, kind);
        }}
        onUsageRequestPageChange={(page, nextRange, status, search, kind) => {
          void loadUsageStatistics(nextRange, page, status, search, kind);
        }}
        workspaces={workspaces}
      />
    );
  }

  const sidebar = (
    <Sidebar
      sessions={sessions}
      workspaces={workspaces}
      activeSessionId={activeSessionId}
      mode={isCompactLayout ? "expanded" : leftMode}
      view={view}
      busySessionIds={busySessionIds}
      sessionStatuses={sessionStatuses}
      onToggleMode={toggleSidebarMode}
      onSelectView={handleSelectView}
    />
  );
  const rightPanel = (
    <RightPanel
      developmentEnabled={composerMode !== "chat" && terminalEnabled}
      contextState={effectiveContextState}
      contextSnapshot={effectiveContextSnapshot}
      contextRevision={projectionCell?.snapshot?.throughJournalSeq}
      sessionId={activeSessionId}
      workspaceRoot={selectedWorkspaceRoot ?? undefined}
      fileRevalidateKey={fileRevalidateKey}
      onOpenReview={openReviewTab}
      onReviewChanged={onReviewChanged}
      onSendToAgent={onSend ? (text) => onSend(text, {
        model: selectedModelId ?? defaultModelId ?? DEFAULT_MODEL_ID,
        mode: composerMode ?? "agent",
        selectedSkills: selectedSkills ?? [],
        thinkingEnabled: false,
      }) : undefined}
    />
  );

  return (
    <>
      <WindowChromeBar
        leftMode={chromeLeftMode}
        rightOpen={view === "chat" && isRightPanelOpen}
        title={chromeTitle}
        leftPaneWidth={displayedLeftWidth}
        rightPaneWidth={rightWidth}
        compactLayout={isCompactLayout}
        onToggleLeft={toggleSidebarMode}
        onToggleRight={toggleRightPanel}
        canGoBack={view === "chat" && canGoBack}
        canGoForward={view === "chat" && canGoForward}
        onGoBack={() => navigateSessionHistory(-1)}
        onGoForward={() => navigateSessionHistory(1)}
        showRightToggle={view === "chat"}
        currentSession={currentSession}
        getSessionPreview={view === "chat" ? getSessionPreview : undefined}
        sessionView={view === "chat" ? sessionMainView : undefined}
        onToggleSessionView={view === "chat" ? toggleSessionMainView : undefined}
        centerTrailing={view === "chat" ? <>
          {reviewEnabled && composerMode !== "chat" && selectedWorkspaceRoot ? <WorkspaceChromeControls workspaceRoot={selectedWorkspaceRoot} title={title} messages={messages} reviewSummary={reviewSummary} onOpenReview={openReviewTab} onWorkspaceChanged={onReviewChanged} /> : null}
        </> : undefined}
        rightLeading={
          view === "chat" ? (
            <>
              {isRightPanelOpen ? (
                <RightPanelObjectMenu
                  developmentEnabled={composerMode !== "chat" && terminalEnabled}
                  sessionId={activeSessionId}
                  onOpenReview={openReviewTab}
                />
              ) : null}
            </>
          ) : undefined
        }
      />
      <SplitView
        left={sidebar}
        leftWidth={isCompactLayout ? 0 : displayedLeftWidth}
        leftHidden={isCompactLayout || isSidebarHidden}
        leftBounds={{ minWidth: LEFT_MIN_WIDTH, maxWidth: LEFT_MAX_WIDTH }}
        leftSeparatorLabel="调整会话侧栏宽度"
        main={mainContent}
        minMainWidth={MAIN_MIN_WIDTH}
        onContainerWidthChange={handleContainerWidthChange}
        onLeftKeyResize={keyResizeLeftPanel}
        onLeftResize={resizeLeftPanel}
        onLeftSeparatorDoubleClick={toggleSidebarMode}
        onRightResize={resizeRightPanel}
        onRightSeparatorDoubleClick={resetRightWidth}
        right={view === "chat" && isRightPanelOpen && !isCompactLayout ? rightPanel : undefined}
        rightBounds={{ minWidth: RIGHT_MIN_WIDTH, maxWidth: rightMaxWidth }}
        rightSeparatorLabel="调整预览面板宽度"
        rightWidth={rightWidth}
      />
      {(isCompactLayout ? !compactSidebarOpen : isSidebarHidden) ? <PerformancePanel compact /> : null}
      {isCompactLayout && compactSidebarOpen ? (
        <div className="fixed inset-0 z-(--act-z-drawer)" data-testid="compact-sidebar-overlay">
          <button
            type="button"
            className="absolute inset-0 border-0 bg-overlay"
            aria-label="关闭会话侧栏浮层"
            onClick={() => setCompactSidebarOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-[min(360px,calc(100vw-48px))] min-w-[280px] overflow-hidden border-r border-line bg-sidebar shadow-act-float">
            {sidebar}
          </div>
        </div>
      ) : null}
      {isCompactLayout && view === "chat" && isRightPanelOpen ? (
        <div className="fixed inset-0 z-(--act-z-drawer)" data-testid="compact-right-panel-overlay">
          <button
            type="button"
            className="absolute inset-0 border-0 bg-overlay"
            aria-label="关闭右侧面板浮层"
            onClick={closeRightPanel}
          />
          <div className="absolute inset-y-0 right-0 w-[min(100%,640px)] overflow-hidden bg-surface shadow-act-float">
            {rightPanel}
          </div>
        </div>
      ) : null}
    </>
  );
}
