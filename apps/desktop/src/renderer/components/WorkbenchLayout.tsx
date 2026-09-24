import { DEFAULT_MODEL_ID } from "@actspace/shared";
import type { AppSettings, ComposerMode, ContextState, ContextUsageSnapshot, MessageBlock, ModelSelectionId, SessionListItem, SettingsV4Snapshot, UsageActivitySnapshot, UsageStatisticsSnapshot, UsableModelView, WorkspaceEntry } from "@actspace/shared";
import type { PermissionMode, SessionGrant } from "@actspace/shared/runtime-v2";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlaskConical } from "lucide-react";
import { ConversationView } from "./ConversationView";
import { PlaceholderView } from "./PlaceholderView";
import { RightPanel } from "./RightPanel";
import { useRightPanel } from "./right-panel/RightPanelContext";
import { useAgentEditSignals } from "./right-panel/useFileFreshness";
import { RightPanelObjectMenu } from "./right-panel/RightPanelObjectMenu";
import { Sidebar, type NewSessionInput, type SessionUiStatusKind, type SidebarMode, type SidebarView } from "./Sidebar";
import { SplitView } from "./SplitView";
import { WindowChromeBar } from "./WindowChromeBar";
import type { SessionMainView } from "./SessionViewToggle";
import { WorkspaceChromeControls } from "./workspace/WorkspaceChromeControls";
import type { ComposerDraftReader, ComposerDraftRestore, ComposerDraftWriter, ComposerExecutionContext, ComposerReviewSummary, ComposerSendOptions, ComposerWorkspaceOption } from "./Composer";
import type { SessionPreviewResolver } from "./SessionHoverPreview";
import { selectComposer, selectRequestContextEstimate, selectSurfaceMessages, selectTrajectory } from "@actspace/client/sessions";
import { contextEstimateToSnapshot, useOptionalSessionProjection } from "../session";
import { ExtensionsPage } from "./extensions/ExtensionsPage";
import { SettingsPage } from "./settings/SettingsPage";
import type { SettingsSectionId } from "./settings/SettingsNav";

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
/** 低于该宽度时，左右面板改为覆盖层，避免继续挤压主聊天区。 */
const COMPACT_LAYOUT_MAX_WIDTH = 820;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getRightMaxWidth(containerWidth: number, displayedLeftWidth: number): number {
  if (containerWidth <= 0) {
    return RIGHT_DEFAULT_WIDTH;
  }

  return Math.max(RIGHT_MIN_WIDTH, containerWidth - displayedLeftWidth - MAIN_MIN_WIDTH);
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
    const resolvedLeftWidth = clamp(stored.leftWidth ?? LEFT_DEFAULT_WIDTH, LEFT_MIN_WIDTH, LEFT_MAX_WIDTH);
    const initialRightMaxWidth = getRightMaxWidth(
      window.innerWidth,
      resolvedMode === "hidden" ? 0 : resolvedLeftWidth,
    );
    return {
      leftMode: resolvedMode,
      leftWidth: resolvedLeftWidth,
      rightWidth: clamp(stored.rightWidth ?? RIGHT_DEFAULT_WIDTH, RIGHT_MIN_WIDTH, initialRightMaxWidth)
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
  composerFocusRequestId = 0,
  busySessionIds,
  sessionStatuses,
  onSend,
  onAbort,
  onNewSession,
  onAddWorkspace,
  onSelectSession,
  onTogglePin,
  onRenameSession,
  onCopySessionId,
  onCopyTranscript,
  onForkSession,
  onArchiveSession,
  onOpenWorkspace,
  onArchiveWorkspace,
  onRemoveWorkspace,
  isSessionReady = true,
  defaultModelId,
  selectedModelId,
  onSelectedModelChange,
  composerMode,
  onComposerModeChange,
  selectedSkills,
  onSelectedSkillsChange,
  onSettingsChange,
  onArchivedSessionsChange,
  workspaces,
  workspaceOptions,
  selectedWorkspaceRoot,
  onSelectWorkspace,
  executionContext,
  draftRestore,
  getSessionPreview,
  reviewSummary,
  onReviewChanged,
  models,
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
  composerFocusRequestId?: number;
  busySessionIds?: Set<string>;
  sessionStatuses?: Record<string, SessionUiStatusKind>;
  onSend?: (text: string, options: ComposerSendOptions) => void;
  onAbort?: () => void;
  onNewSession?: (input?: NewSessionInput) => void;
  onAddWorkspace?: () => void;
  onSelectSession?: (sessionId: string) => void;
  onTogglePin?: (sessionId: string, nextPinned: boolean) => void;
  onRenameSession?: (sessionId: string, title: string) => void;
  onCopySessionId?: (sessionId: string) => void;
  onCopyTranscript?: (sessionId: string) => void;
  onForkSession?: (sessionId: string) => void;
  onArchiveSession?: (sessionId: string) => void;
  onOpenWorkspace?: (workspaceId: string) => void;
  onArchiveWorkspace?: (workspaceId: string, workspaceRoot?: string) => void;
  onRemoveWorkspace?: (workspaceId: string, workspaceRoot?: string) => void;
  isSessionReady?: boolean;
  defaultModelId?: ModelSelectionId;
  selectedModelId?: ModelSelectionId;
  onSelectedModelChange?: (modelId: ModelSelectionId) => void;
  composerMode?: ComposerMode;
  onComposerModeChange?: (mode: ComposerMode) => void;
  selectedSkills?: string[];
  onSelectedSkillsChange?: (skills: string[]) => void;
  models?: UsableModelView[];
  onSettingsChange?: (settings: AppSettings) => void;
  onArchivedSessionsChange?: () => void;
  workspaces?: WorkspaceEntry[];
  workspaceOptions?: ComposerWorkspaceOption[];
  selectedWorkspaceRoot?: string | null;
  onSelectWorkspace?: (workspaceRoot: string) => void;
  executionContext?: ComposerExecutionContext;
  draftRestore?: ComposerDraftRestore | null;
  getSessionPreview?: SessionPreviewResolver;
  reviewSummary?: ComposerReviewSummary | null;
  onReviewChanged?: () => void;
}) {
  const [storedLayout] = useState(loadStoredLayout);
  const [containerWidth, setContainerWidth] = useState(() =>
    typeof window === "undefined" ? 0 : window.innerWidth,
  );
  const [leftMode, setLeftMode] = useState<SidebarMode>(storedLayout.leftMode);
  const [leftWidth, setLeftWidth] = useState(storedLayout.leftWidth);
  const [rightWidth, setRightWidth] = useState(storedLayout.rightWidth);
  const [compactSidebarOpen, setCompactSidebarOpen] = useState(false);
  const {
    isOpen: isRightPanelOpen,
    openPanel: openRightPanel,
    closePanel: closeRightPanel,
    openTab,
  } = useRightPanel();
  const sessionProjection = useOptionalSessionProjection();
  const projectionCell = sessionProjection?.cell ?? null;
  const projectedSurfaceMessages = projectionCell ? selectSurfaceMessages(projectionCell) : [];
  const projectedContextEstimate = projectionCell ? selectRequestContextEstimate(projectionCell) : null;
  const projectedComposer = projectionCell ? selectComposer(projectionCell) : null;
  const projectedTrajectory = projectionCell ? selectTrajectory(projectionCell) : null;
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
  const sessionHistoryRef = useRef<string[]>([]);
  const sessionHistoryIndexRef = useRef(-1);
  const suppressSessionHistoryRef = useRef(false);
  const pendingSessionNavigationRef = useRef<string | null>(null);
  const [sessionNavigationPending, setSessionNavigationPending] = useState(false);
  const [, setSessionHistoryVersion] = useState(0);
  const reviewTabRefreshCounterRef = useRef(0);
  const composerDraftsRef = useRef(new Map<string, string>());
  const draftKey = activeSessionId ?? "__draft__";
  const readDraft = useCallback<ComposerDraftReader>((key) => composerDraftsRef.current.get(key) ?? "", []);
  const writeDraft = useCallback<ComposerDraftWriter>((key, text) => {
    if (text.length === 0) {
      composerDraftsRef.current.delete(key);
      return;
    }
    composerDraftsRef.current.set(key, text);
  }, []);

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
  const isCompactLayout = containerWidth > 0 && containerWidth <= COMPACT_LAYOUT_MAX_WIDTH;
  const isSidebarHidden = leftMode === "hidden";
  const displayedLeftWidth = isSidebarHidden ? 0 : leftWidth;
  const rightMaxWidth = getRightMaxWidth(containerWidth, displayedLeftWidth);

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
    if (!activeSessionId) return;

    const history = sessionHistoryRef.current;
    const currentIndex = sessionHistoryIndexRef.current;

    if (currentIndex < 0 || history.length === 0) {
      sessionHistoryRef.current = [activeSessionId];
      sessionHistoryIndexRef.current = 0;
      setSessionHistoryVersion((version) => version + 1);
      return;
    }

    if (suppressSessionHistoryRef.current) {
      suppressSessionHistoryRef.current = false;
      if (pendingSessionNavigationRef.current === activeSessionId) {
        pendingSessionNavigationRef.current = null;
        setSessionNavigationPending(false);
        return;
      }
    }

    if (history[currentIndex] === activeSessionId) return;

    sessionHistoryRef.current = [...history.slice(0, currentIndex + 1), activeSessionId];
    sessionHistoryIndexRef.current = currentIndex + 1;
    setSessionHistoryVersion((version) => version + 1);
  }, [activeSessionId]);

  const canGoBack = sessionHistoryIndexRef.current > 0 && !sessionNavigationPending;
  const canGoForward =
    sessionHistoryIndexRef.current >= 0 &&
    sessionHistoryIndexRef.current < sessionHistoryRef.current.length - 1 &&
    !sessionNavigationPending;

  const navigateSessionHistory = useCallback(
    (direction: -1 | 1) => {
      if (sessionNavigationPending || !onSelectSession) return;

      const nextIndex = sessionHistoryIndexRef.current + direction;
      const targetSessionId = sessionHistoryRef.current[nextIndex];
      if (!targetSessionId) return;

      sessionHistoryIndexRef.current = nextIndex;
      pendingSessionNavigationRef.current = targetSessionId;
      suppressSessionHistoryRef.current = true;
      setSessionNavigationPending(true);
      void Promise.resolve()
        .then(() => onSelectSession(targetSessionId))
        .catch(() => {
          if (pendingSessionNavigationRef.current === targetSessionId) {
            pendingSessionNavigationRef.current = null;
            suppressSessionHistoryRef.current = false;
            sessionHistoryIndexRef.current -= direction;
            setSessionNavigationPending(false);
          }
        });
    },
    [onSelectSession, sessionNavigationPending],
  );

  useEffect(() => {
    if (containerWidth === 0) {
      return;
    }

    if (isCompactLayout) {
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
  }, [containerWidth, isCompactLayout, isRightPanelOpen, isSidebarHidden, leftMode, leftWidth, rightMaxWidth, rightWidth]);

  useEffect(() => {
    if (!isCompactLayout) {
      setCompactSidebarOpen(false);
    }
  }, [isCompactLayout]);

  useEffect(() => {
    if (!isCompactLayout || (!compactSidebarOpen && !isRightPanelOpen)) {
      return;
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }
      setCompactSidebarOpen(false);
      closeRightPanel();
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [closeRightPanel, compactSidebarOpen, isCompactLayout, isRightPanelOpen]);

  function toggleSidebarMode() {
    if (isCompactLayout) {
      setCompactSidebarOpen((open) => {
        if (!open && isRightPanelOpen) {
          closeRightPanel();
        }
        return !open;
      });
      return;
    }

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

    if (isCompactLayout) {
      setCompactSidebarOpen(false);
      openRightPanel();
      return;
    }

    if (containerWidth > 0 && containerWidth - displayedLeftWidth - RIGHT_MIN_WIDTH < MAIN_MIN_WIDTH) {
      setLeftMode("hidden");
    }

    openRightPanel();
  }

  const openReviewTab = useCallback(() => {
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
  }, [onReviewChanged, openTab, selectedWorkspaceRoot]);

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
    if (typeof window === "undefined" || !window.actspace?.getUsageActivity) {
      setUsageSnapshot(null);
      setUsageError(null);
      return;
    }

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
      if (!window.actspace.getUsageActivity) throw new Error("使用统计接口不可用，请重新启动应用。");
      const activitySnapshot = await window.actspace.getUsageActivity(input);
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

  useEffect(() => {
    if (!(view === "settings" && settingsSection === "usage")) return;
    loadUsageStatistics().catch((error: unknown) => {
      console.error("Failed to bootstrap usage statistics", error);
    });
  }, [view, settingsSection, loadUsageStatistics]);

  let mainContent;
  if (view === "extensions") {
    mainContent = (
      <div className="h-full min-h-0 pt-[var(--window-chrome-strip-height)]">
        <ExtensionsPage onSettingsChange={onSettingsChange} onConfigureSpeech={() => { setSettingsSection("general"); setFocusSpeech(true); setView("settings"); }} />
      </div>
    );
  } else if (view === "lab") {
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
  } else {
    mainContent = (
      <ConversationView
        messages={messages}
        contextSnapshot={effectiveContextSnapshot}
        contextState={effectiveContextState}
        durableSurfaceMessageCount={projectedSurfaceMessages.length > 0 ? projectedSurfaceMessages.length : undefined}
        composerPhase={projectedComposer?.phase}
        sessionId={activeSessionId}
        isStreaming={isStreaming}
        isAborting={isAborting}
        sendScrollRequestId={sendScrollRequestId}
        composerFocusRequestId={composerFocusRequestId}
        onSend={onSend}
        onAbort={onAbort}
        isSessionReady={effectiveIsSessionReady}
        defaultModelId={defaultModelId}
        selectedModelId={selectedModelId}
        onSelectedModelChange={onSelectedModelChange}
        composerMode={composerMode}
        onComposerModeChange={onComposerModeChange}
        selectedSkills={selectedSkills}
        onSelectedSkillsChange={onSelectedSkillsChange}
        workspaceOptions={workspaceOptions}
        selectedWorkspaceRoot={selectedWorkspaceRoot}
        onSelectWorkspace={onSelectWorkspace}
        executionContext={executionContext}
        draftRestore={draftRestore}
        draftKey={draftKey}
        readDraft={readDraft}
        writeDraft={writeDraft}
        reviewSummary={reviewSummary}
        onOpenReview={openReviewTab}
        models={models}
        activeView={sessionMainView}
        trajectory={projectedTrajectory}
      />
    );
  }

  const chromeTitle = view === "extensions" ? "扩展" : view === "lab" ? "Lab" : title;
  const currentSession = view === "chat"
    ? sessions.find((session) => session.id === activeSessionId) ?? null
    : null;
  const chromeLeftMode: SidebarMode = isCompactLayout
    ? compactSidebarOpen ? "expanded" : "hidden"
    : leftMode;
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
      onNewSession={onNewSession}
      onAddWorkspace={onAddWorkspace}
      onSelectSession={onSelectSession}
      onTogglePin={onTogglePin}
      onRename={onRenameSession}
      onCopySessionId={onCopySessionId}
      onCopyTranscript={onCopyTranscript}
      onFork={onForkSession}
      onArchive={onArchiveSession}
      onOpenWorkspace={onOpenWorkspace}
      onArchiveWorkspace={onArchiveWorkspace}
      onRemoveWorkspace={onRemoveWorkspace}
      onSelectView={handleSelectView}
    />
  );
  const rightPanel = (
    <RightPanel
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
          {activeSessionId ? <PermissionModeControl sessionId={activeSessionId} mode={permissionMode} grants={projectionCell?.snapshot?.sessionGrants ?? []} disabled={false} onChanged={async () => { await sessionProjection?.bridge?.open(activeSessionId); }} /> : null}
          {selectedWorkspaceRoot ? <WorkspaceChromeControls workspaceRoot={selectedWorkspaceRoot} title={title} messages={messages} reviewSummary={reviewSummary} onOpenReview={openReviewTab} onWorkspaceChanged={onReviewChanged} /> : null}
        </> : undefined}
        rightLeading={
          view === "chat" ? (
            <>
              {isRightPanelOpen ? (
                <RightPanelObjectMenu
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
        right={view === "chat" && isRightPanelOpen && !isCompactLayout ? rightPanel : undefined}
        rightBounds={{ minWidth: RIGHT_MIN_WIDTH, maxWidth: rightMaxWidth }}
        rightSeparatorLabel="调整预览面板宽度"
        rightWidth={rightWidth}
      />
      {isCompactLayout && compactSidebarOpen ? (
        <div className="fixed inset-0 z-[50]" data-testid="compact-sidebar-overlay">
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
        <div className="fixed inset-0 z-[50]" data-testid="compact-right-panel-overlay">
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

export function PermissionModeControl({ sessionId, mode, grants = [], disabled, onChanged }: { sessionId: string; mode: PermissionMode; grants?: readonly SessionGrant[]; disabled: boolean; onChanged: () => void | Promise<void> }) {
  const [submitting, setSubmitting] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const update = async (next: PermissionMode) => {
    if (next === mode || !window.actspace?.setSessionPermissionMode) return;
    setSubmitting(true);
    try {
      const result = await window.actspace.setSessionPermissionMode({ sessionId, mode: next });
      if (result.ok) await onChanged();
    } finally {
      setSubmitting(false);
    }
  };
  const revoke = async (grantId: string) => {
    if (!window.actspace?.revokeSessionGrant) return;
    setRevoking(grantId);
    try {
      const result = await window.actspace.revokeSessionGrant({ sessionId, grantId });
      if (result.ok) await onChanged();
    } finally {
      setRevoking(null);
    }
  };
  return <div className="inline-flex items-center gap-1">
    <label className="inline-flex h-7 items-center gap-1.5 rounded-act-sm border border-line bg-surface-subtle px-2 text-[11px] text-text-muted" title="完全访问仅扩大文件范围，不会自动批准 Bash、删除或敏感文件">
      <span>权限</span>
      <select className="bg-transparent text-[11px] font-medium text-text-main outline-none" aria-label="会话权限模式" value={mode} disabled={disabled || submitting} onChange={(event) => void update(event.target.value as PermissionMode)}>
        <option value="default">默认</option>
        <option value="full-access">完全访问</option>
      </select>
    </label>
    <details className="relative">
      <summary className="flex h-7 cursor-pointer list-none items-center rounded-act-sm border border-line bg-surface-subtle px-2 text-[11px] text-text-muted" aria-label="管理会话授权">授权 {grants.length}</summary>
      <div className="absolute top-8 right-0 z-50 w-[min(420px,calc(100vw-24px))] border border-line bg-surface p-2 shadow-act-float">
        <div className="px-1 pb-2 text-xs font-semibold text-text-main">当前会话授权</div>
        {grants.length === 0 ? <div className="px-1 py-2 text-xs text-text-faint">暂无可复用的文件授权</div> : grants.map((grant) => {
          const scope = grant.selector.kind === "exact" ? grant.selector.canonicalPath : grant.selector.canonicalRoot;
          return <div className="flex items-start gap-2 border-t border-line py-2 first:border-t-0" key={grant.grantId}>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-text-main">{grant.action === "file.read" ? "读取" : "写入"} · {grant.selector.kind === "exact" ? "仅此文件" : "此目录树"}</div>
              <div className="mt-0.5 break-all font-mono text-[11px] leading-4 text-text-muted" title={scope}>{scope}</div>
              <div className="mt-1 text-[10px] text-text-faint">{grant.sourceToolName} · {new Date(grant.issuedAt).toLocaleString()}</div>
            </div>
            <button className="h-7 shrink-0 rounded-act-sm px-2 text-xs text-text-muted hover:bg-surface-subtle hover:text-text-main" type="button" disabled={revoking === grant.grantId} onClick={() => void revoke(grant.grantId)}>{revoking === grant.grantId ? "撤销中" : "撤销"}</button>
          </div>;
        })}
      </div>
    </details>
  </div>;
}

/**
 * 从消息流里收集 Agent 改过的文件路径。
 *
 * 只看已完成的编辑/写入块：`pending`（等审批）和 `running`（还在写）时磁盘内容尚未定型，
 * 这时就打过期标记会让提示条来回闪。优先用工作区相对路径，缺失时退回 `filePath`。
 */
function collectEditedFilePaths(messages: MessageBlock[]): string[] {
  const paths = new Set<string>();
  for (const message of messages) {
    if (message.kind !== "edit_diff" && message.kind !== "write_diff") continue;
    if (message.status !== "completed") continue;
    const path = message.outputRelativePath || message.filePath;
    if (path) paths.add(path);
  }
  return [...paths];
}
