import { DEFAULT_MODEL_ID } from "@actspace/shared";
import type { AppSettings, ComposerMode, ContextState, ContextUsageSnapshot, MessageBlock, ModelSelectionId, SessionListItem, UsageStatisticsSnapshot, UsableModelView, WorkspaceEntry } from "@actspace/shared";
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
import { UsageStatisticsPage } from "./UsageStatisticsPage";
import { WindowChromeBar } from "./WindowChromeBar";
import { WorkspaceChromeControls } from "./workspace/WorkspaceChromeControls";
import type { ComposerDraftReader, ComposerDraftRestore, ComposerDraftWriter, ComposerExecutionContext, ComposerReviewSummary, ComposerSendOptions, ComposerWorkspaceOption } from "./Composer";
import type { SessionPreviewResolver } from "./SessionHoverPreview";
import { KairosPage } from "../pages/KairosPage";
import { SettingsPage } from "./settings/SettingsPage";
import type { SettingsSectionId } from "./settings/SettingsNav";
import { AgentAnalysisWorkspace } from "./analysis/AgentAnalysisWorkspace";
import { createAgentAnalysisSessionIndexViewState } from "./analysis/AgentAnalysisSessionIndex";

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
  kairosFeatureEnabled = false,
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
  kairosFeatureEnabled?: boolean;
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
  const [view, setView] = useState<SidebarView>("chat");
  const [settingsSection, setSettingsSection] = useState<SettingsSectionId>("general");
  const [analysisSessionId, setAnalysisSessionId] = useState<string | null>(null);
  const [analysisIndexState, setAnalysisIndexState] = useState(createAgentAnalysisSessionIndexViewState);
  const [usageSnapshot, setUsageSnapshot] = useState<UsageStatisticsSnapshot | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);
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
    if (kairosFeatureEnabled) return;
    setView((current) => current === "kairos" ? "chat" : current);
  }, [kairosFeatureEnabled]);

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

  useEffect(() => {
    if (view !== "usage") return;
    loadUsageStatistics().catch((error: unknown) => {
      console.error("Failed to bootstrap usage statistics", error);
    });
  }, [view, loadUsageStatistics]);

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
        composerFocusRequestId={composerFocusRequestId}
        onSend={onSend}
        onAbort={onAbort}
        isSessionReady={isSessionReady}
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
        onSectionChange={setSettingsSection}
        onSettingsChange={onSettingsChange}
        onArchivedSessionsChange={onArchivedSessionsChange}
        activeSessionId={activeSessionId}
        analysisIndexState={analysisIndexState}
        onAnalysisIndexStateChange={setAnalysisIndexState}
        onOpenAnalysisSession={(sessionId) => {
          setAnalysisSessionId(sessionId);
          setView("analysis");
        }}
      />
    );
  }

  if (view === "analysis" && analysisSessionId) {
    return (
      <AgentAnalysisWorkspace
        sessionId={analysisSessionId}
        onBack={() => {
          setAnalysisSessionId(null);
          setSettingsSection("analysis");
          setView("settings");
        }}
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
      showKairos={kairosFeatureEnabled}
    />
  );
  const rightPanel = (
    <RightPanel
      contextState={contextState}
      sessionId={activeSessionId}
      workspaceRoot={selectedWorkspaceRoot ?? undefined}
      fileRevalidateKey={fileRevalidateKey}
      onOpenReview={openReviewTab}
      onReviewChanged={onReviewChanged}
      kairosFeatureEnabled={kairosFeatureEnabled}
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
        rightOpen={isRightPanelOpen}
        title={chromeTitle}
        leftPaneWidth={displayedLeftWidth}
        rightPaneWidth={rightWidth}
        compactLayout={isCompactLayout}
        onToggleLeft={toggleSidebarMode}
        onToggleRight={toggleRightPanel}
        showRightToggle={view !== "kairos"}
        currentSession={currentSession}
        getSessionPreview={view === "chat" ? getSessionPreview : undefined}
        centerTrailing={
          view === "chat" && selectedWorkspaceRoot ? (
            <WorkspaceChromeControls
              workspaceRoot={selectedWorkspaceRoot}
              title={title}
              messages={messages}
              reviewSummary={reviewSummary}
              onOpenReview={openReviewTab}
              onWorkspaceChanged={onReviewChanged}
            />
          ) : undefined
        }
        rightLeading={
          view === "chat" ? (
            <>
              {isRightPanelOpen ? (
                <RightPanelObjectMenu
                  sessionId={activeSessionId}
                  onOpenReview={openReviewTab}
                  kairosFeatureEnabled={kairosFeatureEnabled}
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
        right={view === "chat" && isRightPanelOpen && !isCompactLayout ? rightPanel : undefined}
        rightBounds={{ minWidth: RIGHT_MIN_WIDTH, maxWidth: rightMaxWidth }}
        rightSeparatorLabel="Resize preview panel"
        rightWidth={rightWidth}
      />
      {isCompactLayout && compactSidebarOpen ? (
        <div className="fixed inset-0 z-[50]" data-testid="compact-sidebar-overlay">
          <button
            type="button"
            className="absolute inset-0 border-0 bg-overlay"
            aria-label="Close session sidebar overlay"
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
            aria-label="Close right panel overlay"
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
