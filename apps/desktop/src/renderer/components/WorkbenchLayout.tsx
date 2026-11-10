import { localExecutionRoot } from "../target/run-target";
import { PerformancePanel } from "./PerformancePanel";
import { DEFAULT_MODEL_ID } from "@actspace/shared";
import type { AppSettings, SessionListItem, UsageActivitySnapshot, WorkspaceEntry } from "@actspace/shared";
import { USAGE_REQUEST_PAGE_SIZE, type UsageQuery } from "./usage/usage-query";
import { Suspense, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useActiveSession } from "../session/active-session-context";
import { sameStringList, useTranscriptSelect } from "../session/transcript-context";
import { useSessionActions } from "../session/session-actions-context";
import { useComposerContext } from "./composer/composer-context";
import { ConversationView } from "./ConversationView";
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
import { useOptionalProjectionTarget, useProjectionSelect } from "../session";
import { sameSessionView, selectSessionView, type SessionProjectionView } from "./workbench/projection-view";
import type { SettingsSectionId } from "./settings/SettingsNav";
import { usageApi } from "../api/usage";
import { collectEditedFilePaths } from "./workbench/edited-files";
import { PermissionModeControl } from "./workbench/PermissionModeControl";
import { LEFT_MAX_WIDTH, LEFT_MIN_WIDTH, MAIN_MIN_WIDTH, RIGHT_MIN_WIDTH, usePanelLayout } from "./workbench/use-panel-layout";
import { useSessionHistory } from "./workbench/use-session-history";
import { SPACE_DEMO_ENABLED } from "./space/space-demo-enabled";
import { ExtensionsPage, NewSpaceDialog, SettingsPage, SpaceDemoHelpButton, SpaceObjectMenu, SpaceRightPanel, SpaceTabBar, SpaceWorkbench } from "./lazy-pages";
import { useSpacePanelBinding } from "./space/use-space-panel-binding";
import { TrajectoryNavigationProvider } from "./trajectory/TrajectoryNavigation";
import { devStartSettingsSection, devStartView } from "./harness-stats/dev-start";
import { OpenFileFallbackProvider } from "./files/open-file-fallback-context";
import { ChatMarkdownHostProvider } from "./conversation/ChatMarkdownHostProvider";

/** 「MD 文档」标签的右栏默认宽度；窗口放不下时由 rightMaxWidth 截断。 */
const DOCS_RIGHT_DEFAULT_WIDTH = 720;

export const WorkbenchLayout = memo(function WorkbenchLayout({
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
  const { sessionId: activeSessionId, title, contextSnapshot, contextState, isStreaming, isSessionReady, composerFocusRequestId, onSend } = useActiveSession();
  const { composerMode, selectedModelId, defaultModelId, selectedSkills } = useComposerContext();
  const { onSelectSession } = useSessionActions();
  const { target, capabilities, selectedWorkspaceRoot } = useRunTargetContext();
  const executionRoot = localExecutionRoot(target, selectedWorkspaceRoot);
  const reviewEnabled = capabilities.review.enabled;
  const workspacePanelsEnabled = capabilities.workspacePanels.enabled;
  const {
    isOpen: isRightPanelOpen,
    openPanel: openRightPanel,
    closePanel: closeRightPanel,
    openTab,
    activeTab: activeRightTab,
    docsExpanded,
  } = useRightPanel();
  // 「MD 文档」标签自己记一个宽度：正文 + 260px 文件树放不进默认的 390px 右栏，拖宽它不该改掉其他标签的宽度。
  const [docsRightWidth, setDocsRightWidth] = useState(DOCS_RIGHT_DEFAULT_WIDTH);
  const [view, setView] = useState<SidebarView>(() => devStartView() ?? "chat");
  const [returnFocusRequest, setReturnFocusRequest] = useState(0);
  // 所有 Space 分支都挂在 SPACE_DEMO_ENABLED 上：生产构建里它是常量 false，演示代码整块删掉。
  const isSpace = SPACE_DEMO_ENABLED && view === "space";
  // Space 演示的右栏开关记在它自己的 store 里（按上下文分别记标签，名册页没有右栏）。
  const {
    available: spacePanelAvailable,
    isOpen: spacePanelOpen,
    setOpen: setSpacePanelOpen,
    openPanel: openSpacePanel,
    closePanel: closeSpacePanel,
  } = useSpacePanelBinding();
  const [newSpaceOpen, setNewSpaceOpen] = useState(false);
  const {
    isCompactLayout, leftMode, isSidebarHidden, displayedLeftWidth, rightWidth, rightMaxWidth, compactSidebarOpen, setCompactSidebarOpen, chromeLeftMode,
    handleContainerWidthChange, toggleSidebarMode, toggleRightPanel, resizeLeftPanel, keyResizeLeftPanel, resizeRightPanel, resetRightWidth,
  } = usePanelLayout(isSpace
    ? { isOpen: spacePanelOpen, openPanel: openSpacePanel, closePanel: closeSpacePanel }
    : { isOpen: isRightPanelOpen, openPanel: openRightPanel, closePanel: closeRightPanel });
  // 投影只订阅这一小块派生值：流式时 cell 每帧换一次，但它们几乎不变，外壳不随帧重渲染（见 workbench/projection-view.ts）。
  const projectionBridge = useOptionalProjectionTarget()?.bridge ?? null;
  const projectionView = useProjectionSelect<SessionProjectionView | null>(selectSessionView, sameSessionView);
  const projectedContextSnapshot = projectionView?.contextSnapshot ?? null;
  // 上下文估算只有一个来源：会话投影 `contextEstimate`（圆环、弹窗、面板同一个数）。
  const effectiveContextState = projectionView?.contextState ?? contextState;
  const effectiveContextSnapshot = projectedContextSnapshot ?? contextSnapshot;
  const projectionSessionReady = projectionView !== null && projectionView.status !== "error";
  const permissionMode = projectionView?.permissionMode ?? "default";
  const effectiveIsSessionReady = (projectionView?.composerPhase != null && projectionView.composerPhase !== "blank") || isSessionReady || projectionSessionReady;
  const sessionViewByIdRef = useRef(new Map<string, SessionMainView>());
  const [sessionMainView, setSessionMainView] = useState<SessionMainView>("chat");
  const [settingsSection, setSettingsSection] = useState<SettingsSectionId>(() => devStartSettingsSection() ?? "general");
  const [focusSpeech, setFocusSpeech] = useState(false);
  const [usageActivitySnapshot, setUsageActivitySnapshot] = useState<UsageActivitySnapshot | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);
  const { canGoBack, canGoForward, navigateSessionHistory } = useSessionHistory(activeSessionId, onSelectSession);
  const reviewTabRefreshCounterRef = useRef(0);

  useEffect(() => {
    setSessionMainView(activeSessionId ? sessionViewByIdRef.current.get(activeSessionId) ?? "chat" : "chat");
  }, [activeSessionId]);

  const handledQuickOpenRequest = useRef(composerFocusRequestId);
  useEffect(() => {
    if (handledQuickOpenRequest.current === composerFocusRequestId) return;
    handledQuickOpenRequest.current = composerFocusRequestId;
    // Quick Open must mount the composer even when Settings or the trajectory currently owns the page.
    setView("chat");
    setSessionMainView("chat");
    if (activeSessionId) sessionViewByIdRef.current.set(activeSessionId, "chat");
    setCompactSidebarOpen(false);
    if (isCompactLayout) closeRightPanel();
  }, [composerFocusRequestId, activeSessionId, isCompactLayout, closeRightPanel, setCompactSidebarOpen]);

  const toggleSessionMainView = useCallback(() => {
    setSessionMainView((current) => {
      const next: SessionMainView = current === "chat" ? "trajectory" : "chat";
      if (activeSessionId) {
        sessionViewByIdRef.current.set(activeSessionId, next);
      }
      return next;
    });
  }, [activeSessionId]);

  // Context 面板「跳到轨迹」：切到轨迹视图，和标题栏按钮共用按会话记忆的状态。
  const showSessionTrajectory = useCallback(() => {
    setSessionMainView("trajectory");
    if (activeSessionId) sessionViewByIdRef.current.set(activeSessionId, "trajectory");
  }, [activeSessionId]);

  const openReviewTab = useCallback(() => {
    if (!reviewEnabled) return;
    const refreshKey = ++reviewTabRefreshCounterRef.current;
    openTab({
      id: `review:${executionRoot ?? ""}`,
      kind: "review",
      title: "改动",
      workspaceRoot: executionRoot,
      scope: "uncommitted",
      refreshKey,
    });
    onReviewChanged?.();
  }, [reviewEnabled, onReviewChanged, openTab, executionRoot]);

  const openHostSettings = useCallback(() => {
    setSettingsSection("hosts");
    setView("settings");
  }, []);

  const handleSelectView = useCallback((next: SidebarView) => {
    setView(next);
    setCompactSidebarOpen(false);
    // 窄窗口里右栏是浮层，进 Space 时先收起，免得一进来就盖住对话。
    if (next === "space" && isCompactLayout) setSpacePanelOpen(false);
  }, [isCompactLayout, setSpacePanelOpen, setCompactSidebarOpen]);

  const usageLoadSequence = useRef(0);
  const usageRequest = useRef<string>();
  const usageCursors = useRef(new Map<string, string>());
  const [usageProgress, setUsageProgress] = useState<import("@actspace/shared").UsageQueryProgress | null>(null);
  const cancelUsage = useCallback(() => {
    const requestId = usageRequest.current;
    if (!requestId) return;
    usageRequest.current = undefined;
    usageLoadSequence.current++;
    setUsageLoading(false);
    setUsageProgress(null);
    setUsageError("查询已取消，可刷新重试。");
    void usageApi.cancel({ requestId }).catch(error => setUsageError(error instanceof Error ? error.message : "取消查询失败。"));
  }, []);
  useEffect(() => {
    if (view !== "settings" || settingsSection !== "usage") cancelUsage();
    return () => {
      const requestId = usageRequest.current;
      if (requestId) void usageApi.cancel({ requestId }).catch(error => console.warn("Usage cancellation during page cleanup failed", error));
    };
  }, [view, settingsSection, cancelUsage]);
  const loadUsageStatistics = useCallback(async (query: UsageQuery) => {
    if (usageRequest.current) void usageApi.cancel({ requestId: usageRequest.current }).catch(error => console.warn("Superseded Usage cancellation failed", error));
    const requestId = crypto.randomUUID();
    usageRequest.current = requestId;
    const sequence = ++usageLoadSequence.current;
    const { page, ...filters } = query;
    const cursorKey = JSON.stringify([filters, page]);
    let polling = false;
    const poll = setInterval(() => {
      if (polling) return;
      polling = true;
      void usageApi.getStatus({ requestId }).then(progress => { if (sequence === usageLoadSequence.current) setUsageProgress(progress); })
        .catch(error => { if (sequence === usageLoadSequence.current) setUsageError(error instanceof Error ? error.message : "读取查询进度失败。"); })
        .finally(() => { polling = false; });
    }, 300);
    setUsageLoading(true);
    setUsageError(null);
    try {
      // 不传 sessionId 即走 main 的 global 路径，聚合所有 Session 历史。
      const input = {
        requestId,
        scope: "global",
        ...filters,
        utcOffsetMinutes: -new Date().getTimezoneOffset(),
        requestRowsPage: { page, limit: USAGE_REQUEST_PAGE_SIZE, cursor: usageCursors.current.get(cursorKey) },
      } as const;
      const activitySnapshot = await usageApi.getActivity(input);
      if (sequence !== usageLoadSequence.current) return;
      setUsageActivitySnapshot(activitySnapshot);
      if (activitySnapshot?.rowsPage.nextCursor) {
        if (usageCursors.current.size >= 64) usageCursors.current.clear();
        usageCursors.current.set(JSON.stringify([filters, page + 1]), activitySnapshot.rowsPage.nextCursor);
      }
    } catch (error) {
      if (sequence !== usageLoadSequence.current) return;
      console.error("Failed to load usage statistics", error);
      setUsageError(error instanceof Error ? error.message : "使用统计加载失败，请重试。");
    } finally {
      clearInterval(poll);
      if (sequence === usageLoadSequence.current) { setUsageLoading(false); setUsageProgress(null); usageRequest.current = undefined; }
    }
  }, []);

  // UsageStatisticsPage requests its persisted range after mounting.

  // 元素引用保持稳定：它作为 prop 传给输入框外壳，每次渲染都新建会让外壳白白重渲染。
  const permissionControl = useMemo(() => activeSessionId && composerMode !== "chat" ? (
    <PermissionModeControl
      sessionId={activeSessionId}
      mode={permissionMode}
      disabled={false}
      onChanged={async () => { await projectionBridge?.open(activeSessionId); }}
    />
  ) : null, [activeSessionId, composerMode, permissionMode, projectionBridge]);

  let mainContent;
  if (isSpace) {
    mainContent = <Suspense fallback={null}><SpaceWorkbench /></Suspense>;
  } else if (view === "extensions") {
    mainContent = (
      <div className="h-full min-h-0 pt-[var(--window-chrome-strip-height)]">
        <Suspense fallback={null}>
          <ExtensionsPage onSettingsChange={onSettingsChange} onConfigureSpeech={() => { setSettingsSection("general"); setFocusSpeech(true); setView("settings"); }} />
        </Suspense>
      </div>
    );
  } else {
    mainContent = (
      <ConversationView
        contextSnapshot={effectiveContextSnapshot}
        contextState={effectiveContextState}
        durableSurfaceMessageCount={projectionView && projectionView.surfaceMessageCount > 0 ? projectionView.surfaceMessageCount : undefined}
        composerPhase={projectionView?.composerPhase}
        isSessionReady={effectiveIsSessionReady}
        reviewSummary={composerMode === "chat" || !reviewEnabled ? null : reviewSummary}
        onOpenReview={composerMode === "chat" || !reviewEnabled ? undefined : openReviewTab}
        activeView={sessionMainView}
        permissionControl={permissionControl}
        onConnectHost={openHostSettings}
        focusRequest={returnFocusRequest}
      />
    );
  }

  const chromeTitle = view === "extensions" ? "扩展" : isSpace ? "Space" : title;
  const currentSession = view === "chat"
    ? sessions.find((session) => session.id === activeSessionId) ?? null
    : null;
  // 右侧文件 Tab 的新鲜度信号（见 `right-panel/useFileFreshness.ts`）：
  // ① Agent 本轮编辑过的文件路径 → 精确打过期标记；
  // ② turn 从「进行中」变为「结束」时递增一个 key → 触发一次 mtime 兜底重校验，
  //    覆盖 bash 脚本写文件这类不产生 diff 块的间接改动。
  const agentEditedPaths = useTranscriptSelect(collectEditedFilePaths, sameStringList);
  useAgentEditSignals(agentEditedPaths, executionRoot);
  // usePanelLayout 的 toggle 每次渲染都是新函数；侧栏经 ref 取最新的，自己的 props 保持稳定。
  const toggleSidebarModeRef = useRef(toggleSidebarMode);
  toggleSidebarModeRef.current = toggleSidebarMode;
  const stableToggleSidebarMode = useCallback(() => toggleSidebarModeRef.current(), []);
  const openNewSpace = useCallback(() => setNewSpaceOpen(true), []);
  // 右栏的「发送给 Agent」：回调保持稳定，右栏外壳不因这里的重渲染而重渲染。
  const sendToAgent = useMemo(() => onSend ? (text: string) => onSend(text, {
    model: selectedModelId ?? defaultModelId ?? DEFAULT_MODEL_ID,
    mode: composerMode ?? "agent",
    selectedSkills: selectedSkills ?? [],
    thinkingEnabled: false,
  }) : undefined, [onSend, selectedModelId, defaultModelId, composerMode, selectedSkills]);
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
      <Suspense fallback={<div className="h-full bg-surface" aria-busy="true" />}>
      <SettingsPage
        onBack={() => { setView("chat"); setReturnFocusRequest((value) => value + 1); }}
        initialSection={settingsSection}
        focusSpeech={focusSpeech}
        onSpeechFocused={() => setFocusSpeech(false)}
        onSectionChange={setSettingsSection}
        onSettingsChange={onSettingsChange}
        onArchivedSessionsChange={onArchivedSessionsChange}
        usageActivitySnapshot={usageActivitySnapshot}
        usageProgress={usageProgress}
        onUsageCancel={cancelUsage}
        usageLoading={usageLoading}
        usageError={usageError}
        onUsageQuery={(query) => { void loadUsageStatistics(query); }}
        workspaces={workspaces}
      />
      </Suspense>
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
      onToggleMode={stableToggleSidebarMode}
      onSelectView={handleSelectView}
      onNewSpace={SPACE_DEMO_ENABLED ? openNewSpace : undefined}
    />
  );
  const rightPanel = isSpace ? <Suspense fallback={null}><SpaceRightPanel /></Suspense> : (
    <RightPanel
      developmentEnabled={composerMode !== "chat" && workspacePanelsEnabled}
      contextState={effectiveContextState}
      contextRevision={projectionView?.contextRevision}
      sessionId={activeSessionId}
      workspaceRoot={executionRoot}
      fileRevalidateKey={fileRevalidateKey}
      agentEditedPaths={agentEditedPaths}
      onOpenReview={openReviewTab}
      onSendToAgent={sendToAgent}
    />
  );

  // 有右栏的视图：普通会话，以及 Space 演示里除名册以外的页面。
  const hasRightPanel = view === "chat" || (isSpace && spacePanelAvailable);
  const rightPanelShown = view === "chat" ? isRightPanelOpen : hasRightPanel && spacePanelOpen;
  const docsTabActive = view === "chat" && activeRightTab?.kind === "docs";
  const effectiveRightWidth = docsTabActive ? Math.min(Math.max(docsRightWidth, RIGHT_MIN_WIDTH), rightMaxWidth) : rightWidth;

  /** 「MD 文档」面板展开到中间栏：SplitView 隐藏中间栏，chrome 的中间标题也要退场。 */
  const rightExpanded = docsExpanded && activeRightTab?.kind === "docs" && rightPanelShown && !isCompactLayout;

  return (
    <TrajectoryNavigationProvider onShowTrajectory={showSessionTrajectory}>
      <OpenFileFallbackProvider>
      {/* 聊天区 Markdown 的宿主（打开路径带行号、读本地图片），对话区和右栏子 Agent 面板共用。 */}
      <ChatMarkdownHostProvider>
      <WindowChromeBar
        leftMode={chromeLeftMode}
        rightOpen={rightPanelShown}
        title={chromeTitle}
        leftPaneWidth={displayedLeftWidth}
        rightPaneWidth={effectiveRightWidth}
        compactLayout={isCompactLayout}
        rightExpanded={rightExpanded}
        onToggleLeft={toggleSidebarMode}
        onToggleRight={toggleRightPanel}
        canGoBack={view === "chat" && canGoBack}
        canGoForward={view === "chat" && canGoForward}
        onGoBack={() => navigateSessionHistory(-1)}
        onGoForward={() => navigateSessionHistory(1)}
        showRightToggle={hasRightPanel}
        currentSession={currentSession}
        getSessionPreview={view === "chat" ? getSessionPreview : undefined}
        sessionView={view === "chat" ? sessionMainView : undefined}
        onToggleSessionView={view === "chat" ? toggleSessionMainView : undefined}
        center={isSpace ? <Suspense fallback={null}><SpaceTabBar /></Suspense> : undefined}
        centerTrailing={isSpace ? <Suspense fallback={null}><SpaceDemoHelpButton /></Suspense> : view === "chat" ? <>
          {reviewEnabled && composerMode !== "chat" && executionRoot ? <WorkspaceChromeControls workspaceRoot={executionRoot} title={title} reviewSummary={reviewSummary} onOpenReview={openReviewTab} onWorkspaceChanged={onReviewChanged} /> : null}
        </> : undefined}
        rightLeading={
          view === "chat" ? (
            <>
              {isRightPanelOpen ? (
                <RightPanelObjectMenu
                  developmentEnabled={composerMode !== "chat" && workspacePanelsEnabled}
                  sessionId={activeSessionId}
                  onOpenReview={openReviewTab}
                />
              ) : null}
            </>
          ) : isSpace && rightPanelShown ? <Suspense fallback={null}><SpaceObjectMenu /></Suspense> : undefined
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
        onRightResize={docsTabActive ? setDocsRightWidth : resizeRightPanel}
        onRightSeparatorDoubleClick={docsTabActive ? () => setDocsRightWidth(DOCS_RIGHT_DEFAULT_WIDTH) : resetRightWidth}
        right={rightPanelShown && !isCompactLayout ? rightPanel : undefined}
        rightBounds={{ minWidth: RIGHT_MIN_WIDTH, maxWidth: rightMaxWidth }}
        rightSeparatorLabel="调整预览面板宽度"
        rightWidth={effectiveRightWidth}
        rightExpanded={rightExpanded}
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
      {isCompactLayout && rightPanelShown ? (
        <div className="fixed inset-0 z-(--act-z-drawer)" data-testid="compact-right-panel-overlay">
          <button
            type="button"
            className="absolute inset-0 border-0 bg-overlay"
            aria-label="关闭右侧面板浮层"
            onClick={isSpace ? closeSpacePanel : closeRightPanel}
          />
          <div className="absolute inset-y-0 right-0 w-[min(100%,640px)] overflow-hidden bg-surface shadow-act-float">
            {rightPanel}
          </div>
        </div>
      ) : null}
      {SPACE_DEMO_ENABLED ? <Suspense fallback={null}><NewSpaceDialog open={newSpaceOpen} onOpenChange={setNewSpaceOpen} onCreated={() => handleSelectView("space")} /></Suspense> : null}
      </ChatMarkdownHostProvider>
      </OpenFileFallbackProvider>
    </TrajectoryNavigationProvider>
  );
});
