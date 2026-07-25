import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_MODEL_ID, createMessageBlocks, getLatestContextSnapshot } from "@actspace/shared";
import type {
  AbortTurnInput,
  AgentTurnResult,
  AppSettings,
  BashBackgroundStatus,
  BashStatus,
  BootstrapState,
  CompactContextInput,
  GenerateEvalCandidateInput,
  ContextState,
  ContextUsageSnapshot,
  MessageBlock,
  ModelSelectionId,
  ModelId,
  ModelKey,
  UsableModelView,
  ReviewGetWorkspaceChangesResult,
  RunTurnInput,
  RuntimeStreamEvent,
  SessionEvent,
  SessionListItem,
  SessionRecord,
  ToolUiPreview,
  WorkspaceEntry,
  WorkspaceListResult,
} from "@actspace/shared";
import { WorkbenchLayout } from "./components/WorkbenchLayout";
import { RightPanelProvider } from "./components/right-panel/RightPanelContext";
import { ShutdownOverlay } from "./components/ShutdownOverlay";
import { resolvePreferredChatModel } from "./model-selection";
import type { ComposerReviewSummary, ComposerSendOptions, ComposerWorkspaceOption } from "./components/Composer";
import type { NewSessionInput, SessionUiStatusKind } from "./components/Sidebar";

const MIN_TOOL_RUNNING_MS = 300;
const DEFAULT_WORKSPACE_LABEL = "Default workspace";

function hasActspaceBridge(): boolean {
  return typeof window !== "undefined" && Boolean(window.actspace);
}

function getSessionTitle(sessionRecord: SessionRecord | null, sessions: SessionListItem[]): string {
  const rawTitle = sessionRecord?.meta.title ?? sessions[0]?.title ?? "New chat";
  const normalized = rawTitle.replace(/^Session\s+/i, "").replace(/^session-/i, "");
  if (normalized === rawTitle) {
    return rawTitle;
  }

  return normalized
    .split("-")
    .filter(Boolean)
    .map((part, index) => (index === 0 ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : part))
    .join(" ");
}

function normalizeWorkspaceRoot(root: string | undefined | null): string | null {
  const trimmed = root?.trim();
  return trimmed ? trimmed : null;
}

function workspaceLabelFromRoot(root: string): string {
  const normalized = root.replace(/\/+$/, "");
  const segments = normalized.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? root;
}

function createWorkspaceOptionsFromRoots(
  roots: Array<string | undefined | null>,
  defaultWorkspaceRoot?: string | null,
): ComposerWorkspaceOption[] {
  const options = new Map<string, ComposerWorkspaceOption>();
  const normalizedDefaultWorkspaceRoot = normalizeWorkspaceRoot(defaultWorkspaceRoot);
  for (const root of roots) {
    const normalized = normalizeWorkspaceRoot(root) ?? normalizedDefaultWorkspaceRoot;
    if (!normalized) continue;
    const label = normalizeWorkspaceRoot(root) ? workspaceLabelFromRoot(normalized) : DEFAULT_WORKSPACE_LABEL;
    const existing = options.get(normalized);
    if (existing) {
      if (label === DEFAULT_WORKSPACE_LABEL) {
        existing.label = DEFAULT_WORKSPACE_LABEL;
      }
      continue;
    }
    options.set(normalized, {
      value: normalized,
      label,
    });
  }
  return [...options.values()];
}

function createWorkspaceOptionsFromRegistry(items: WorkspaceEntry[]): ComposerWorkspaceOption[] {
  return items.map((workspace) => ({
    value: workspace.path,
    label: workspace.label,
    workspaceId: workspace.id,
  }));
}

function reviewResultToSummary(result: ReviewGetWorkspaceChangesResult): ComposerReviewSummary {
  return {
    status: result.status,
    additions: result.changeSet?.totalAdditions,
    deletions: result.changeSet?.totalDeletions,
    reason: result.reason,
  };
}

type ToolEntry = {
  toolName: string;
  preview?: ToolUiPreview;
  isError?: boolean;
  finished?: boolean;
  startedAt: number;
  approvalPending?: boolean;
  approvalRequestId?: string;
  approvalReason?: string;
  approvalSummary?: string;
  approvalScope?: "browser_session";
  transcriptEvents?: SessionEvent[];
};

type StreamingSegment =
  | { type: "thinking"; text: string }
  | { type: "text"; text: string }
  | { type: "tool"; toolCallId: string }
  | { type: "compaction"; turnId: string };

type StreamingState = {
  segments: StreamingSegment[];
  activeTools: Map<string, ToolEntry>;
  activeCompactions: Map<string, Extract<MessageBlock, { kind: "context_compaction" }>>;
  /** LLM 可重试错误退避中：显示重试提示；新 delta 到达（重试成功）时清除 */
  retryNotice?: { attempt: number; maxAttempts: number };
};

function createEmptyStreamingState(): StreamingState {
  return { segments: [], activeTools: new Map(), activeCompactions: new Map() };
}

function updateStringSet(current: Set<string>, value: string, included: boolean): Set<string> {
  if (current.has(value) === included) {
    return current;
  }

  const next = new Set(current);
  if (included) {
    next.add(value);
  } else {
    next.delete(value);
  }
  return next;
}

function appendOrMergeSegment(
  segments: StreamingSegment[],
  segType: "thinking" | "text",
  delta: string,
): void {
  const last = segments[segments.length - 1];
  if (last && last.type === segType) {
    last.text += delta;
  } else {
    segments.push({ type: segType, text: delta });
  }
}

/** LLM 重试前清掉失败尝试留下的半截 thinking/text 段（已完成的工具块保留） */
function dropTrailingStreamSegments(segments: StreamingSegment[]): void {
  while (segments.length > 0) {
    const last = segments[segments.length - 1];
    if (last.type === "thinking" || last.type === "text") {
      segments.pop();
    } else {
      break;
    }
  }
}

function createLocalEmptySession(input: NewSessionInput = {}): SessionRecord {
  const now = new Date().toISOString();
  const id = `local-session-${Date.now()}`;
  return {
    meta: {
      id,
      title: "New chat",
      createdAt: now,
      updatedAt: now,
      turnCount: 0,
      workspaceRoot: input.workspaceRoot,
    },
    events: [],
    messageBlocks: [],
    contextSnapshot: null,
  };
}

function getStreamingBashStatus(tool: {
  isError?: boolean;
  finished?: boolean;
  approvalPending?: boolean;
}): BashStatus {
  if (tool.approvalPending) {
    return "pending";
  }
  if (!tool.finished) {
    return "running";
  }

  return tool.isError ? "failed" : "success";
}

function getStreamingReadText(preview: Extract<ToolUiPreview, { kind: "read" }>): string {
  return `Read ${preview.filePath}${preview.range ? ` ${preview.range}` : ""}`;
}

function getStreamingSearchText(preview: Extract<ToolUiPreview, { kind: "search" }>): string {
  const scope = preview.scope ? `${preview.scope} ` : "";
  return `Searched files ${scope}for ${preview.query}`;
}

function getStreamingGrepText(preview: Extract<ToolUiPreview, { kind: "grep" }>): string {
  return `Grep ${preview.pattern}${preview.scope ? ` in ${preview.scope}` : ""}`;
}

function getStreamingGlobText(preview: Extract<ToolUiPreview, { kind: "glob" }>): string {
  return `Glob ${preview.pattern}${preview.scope ? ` in ${preview.scope}` : ""}`;
}

function getStreamingWebSearchText(preview: Extract<ToolUiPreview, { kind: "web_search" }>): string {
  return preview.displayText;
}

function getStreamingMediaAnalysisText(preview: Extract<ToolUiPreview, { kind: "media_analysis" }>): string {
  return preview.displayText;
}

function getStreamingDirectoryText(
  preview: Extract<ToolUiPreview, { kind: "directory_list" }>,
  finished?: boolean,
): string {
  if (finished && preview.entryCount !== undefined) {
    return `Listed ${preview.path} (${preview.entryCount} entries)`;
  }

  return `Listed ${preview.path}`;
}

function displayFileName(path: string): string {
  const normalized = path.replace(/[\\/]+$/, "");
  return normalized.split(/[\\/]+/).filter(Boolean).pop() ?? normalized ?? path;
}

function getStreamingDeleteText(
  preview: Extract<ToolUiPreview, { kind: "delete" }>,
  status: Extract<MessageBlock, { kind: "delete" }>["status"],
): string {
  const fileLabel = displayFileName(preview.filePath || "file...");
  if (status === "completed") return `Deleted ${fileLabel}`;
  if (status === "failed") return `Delete ${fileLabel} failed`;
  if (status === "denied") return `Denied delete ${fileLabel}`;
  if (status === "pending") return "Delete file requires approval";
  return `Delete ${fileLabel}`;
}

function toolEntryToBlock(toolCallId: string, tool: ToolEntry, now: string, turnId?: string): MessageBlock {
  const blockId = turnId ? `turn:${turnId}:tool:${toolCallId}` : `streaming-tool-${toolCallId}`;

  if (tool.preview?.kind === "bash") {
    return {
      kind: "bash",
      id: blockId,
      status: getStreamingBashStatus(tool),
      title: tool.approvalPending
        ? (tool.approvalSummary ?? "Bash command needs approval")
        : tool.preview.title,
      command: tool.preview.command || "Waiting for Bash result...",
      commandPreview: tool.preview.commandPreview || "bash",
      cwd: tool.preview.cwd,
      stdout: tool.finished ? tool.preview.stdout : undefined,
      stderr: tool.isError && !tool.preview.stdout ? (tool.preview.stderr ?? "Tool execution failed") : undefined,
      reason: tool.approvalReason ?? tool.preview.reason,
      approvalRequestId: tool.approvalRequestId,
      intent: tool.preview.intent,
      backgroundTaskId: tool.preview.backgroundTaskId,
      backgroundStatus: tool.preview.backgroundStatus,
      outputFilePath: tool.preview.outputFilePath,
      createdAt: now,
    };
  }

  if (tool.preview?.kind === "read") {
    return {
      kind: "read",
      id: blockId,
      filePath: tool.preview.filePath,
      range: tool.preview.range,
      displayText: getStreamingReadText(tool.preview),
      createdAt: now,
      status: tool.finished ? "completed" : "running",
    };
  }

  if (tool.preview?.kind === "search") {
    return {
      kind: "search",
      id: blockId,
      query: tool.preview.query,
      scope: tool.preview.scope,
      resultCount: tool.finished ? tool.preview.resultCount : undefined,
      displayText: getStreamingSearchText(tool.preview),
      createdAt: now,
      status: tool.finished ? "completed" : "running",
    };
  }

  if (tool.preview?.kind === "grep") {
    return {
      kind: "grep",
      id: blockId,
      pattern: tool.preview.pattern,
      scope: tool.preview.scope,
      resultCount: tool.finished ? tool.preview.resultCount : undefined,
      displayText: getStreamingGrepText(tool.preview),
      createdAt: now,
      status: tool.finished ? "completed" : "running",
    };
  }

  if (tool.preview?.kind === "glob") {
    return {
      kind: "glob",
      id: blockId,
      pattern: tool.preview.pattern,
      scope: tool.preview.scope,
      resultCount: tool.finished ? tool.preview.resultCount : undefined,
      displayText: getStreamingGlobText(tool.preview),
      createdAt: now,
      status: tool.finished ? "completed" : "running",
    };
  }

  if (tool.preview?.kind === "web_search") {
    return {
      kind: "web_search",
      id: blockId,
      mode: tool.preview.mode,
      query: tool.preview.query,
      url: tool.preview.url,
      displayText: getStreamingWebSearchText(tool.preview),
      createdAt: now,
      status: tool.finished ? "completed" : "running",
      resultUrls: tool.finished ? tool.preview.resultUrls : undefined,
      contentPreview: tool.finished ? tool.preview.contentPreview : undefined,
    };
  }

  if (tool.preview?.kind === "media_analysis") {
    return {
      kind: "media_analysis",
      id: blockId,
      mediaName: tool.preview.mediaName,
      mediaKind: tool.preview.mediaKind,
      displayText: getStreamingMediaAnalysisText(tool.preview),
      createdAt: now,
      status: tool.finished ? "completed" : "running",
      isError: tool.isError,
    };
  }

  if (tool.preview?.kind === "directory_list") {
    return {
      kind: "directory_list",
      id: blockId,
      path: tool.preview.path,
      entryCount: tool.finished ? tool.preview.entryCount : undefined,
      displayText: getStreamingDirectoryText(tool.preview, tool.finished),
      createdAt: now,
      status: tool.finished ? "completed" : "running",
    };
  }

  if (tool.preview?.kind === "delete") {
    const status = tool.approvalPending
      ? "pending"
      : tool.finished
        ? tool.isError
          ? tool.preview.status === "denied" ? "denied" : "failed"
          : "completed"
        : "running";
    return {
      kind: "delete",
      id: blockId,
      filePath: displayFileName(tool.preview.filePath || "file..."),
      displayText: getStreamingDeleteText(tool.preview, status),
      createdAt: now,
      status,
      isError: status === "failed" || status === "denied",
      approvalRequestId: tool.approvalRequestId,
      reason: tool.approvalReason,
    };
  }

  if (tool.preview?.kind === "edit_diff") {
    const status = tool.approvalPending
      ? "pending"
      : tool.finished
        ? tool.preview.status ?? (tool.isError ? "failed" : "completed")
        : "running";
    return {
      kind: "edit_diff",
      id: blockId,
      filePath: tool.preview.filePath,
      additions: tool.preview.additions,
      deletions: tool.preview.deletions,
      diff: tool.preview.diff,
      collapsedLines: tool.preview.collapsedLines,
      createdAt: now,
      status,
      approvalRequestId: tool.approvalRequestId,
      reason: tool.approvalReason,
      errorMessage: tool.preview.errorMessage,
    };
  }

  if (tool.preview?.kind === "write") {
    const status = tool.approvalPending
      ? "pending"
      : tool.finished
        ? tool.preview.status ?? (tool.isError ? "failed" : "completed")
        : "running";
    return {
      kind: "write_diff",
      id: blockId,
      filePath: tool.preview.filePath,
      additions: tool.preview.additions,
      deletions: tool.preview.deletions,
      diff: tool.preview.diff,
      collapsedLines: tool.preview.collapsedLines,
      streamingContent: tool.finished ? undefined : tool.preview.streamingContent,
      createdAt: now,
      status,
      approvalRequestId: tool.approvalRequestId,
      reason: tool.approvalReason,
      errorMessage: tool.preview.errorMessage,
    };
  }

  if (tool.preview?.kind === "agent") {
    return {
      kind: "agent",
      id: blockId,
      description: tool.preview.description,
      status: tool.finished ? tool.preview.status : "running",
      subagentType: tool.preview.subagentType,
      displayText: tool.preview.displayText,
      summary: tool.preview.summary,
      recentEvents: tool.preview.recentEvents,
      transcriptRef: tool.preview.transcriptRef,
      stats: tool.preview.stats,
      error: tool.preview.error,
      // explore 内置子代理首帧（tool_call_streaming）preview 尚未带 display，
      // 仅靠 toolName 兜底为 inline，避免执行前一瞬被渲染成 agent 工具的 panel 框。
      display: tool.preview.display ?? (tool.toolName === "explore" ? "inline" : undefined),
      transcriptEvents: tool.transcriptEvents,
      createdAt: now,
    };
  }

  return {
    kind: "tool",
    id: blockId,
    toolName: tool.toolName,
    title: tool.preview?.kind === "generic"
      ? tool.preview.title
      : tool.finished ? `${tool.toolName}` : `Running ${tool.toolName}...`,
    content: tool.approvalPending && tool.approvalScope === "browser_session"
      ? "等待浏览器授权"
      : tool.preview?.kind === "generic"
        ? tool.preview.content
      : tool.finished
        ? tool.isError ? "Tool execution failed" : "Completed"
        : "Executing...",
    createdAt: now,
    isError: tool.isError,
    status: tool.approvalPending
      ? "pending"
      : tool.finished
        ? tool.isError ? "failed" : "completed"
        : "running",
    approvalRequestId: tool.approvalRequestId,
    approvalReason: tool.approvalReason,
    approvalScope: tool.approvalScope,
  };
}

function streamingStateToBlocks(state: StreamingState, turnId?: string): MessageBlock[] {
  const now = new Date().toISOString();
  const blocks: MessageBlock[] = [];
  let thinkingIdx = 0;
  let textIdx = 0;

  for (const seg of state.segments) {
    if (seg.type === "thinking") {
      const index = thinkingIdx++;
      blocks.push({
        kind: "thinking",
        id: turnId ? `turn:${turnId}:thinking:${index}` : `streaming-thinking-${index}`,
        title: "Thinking...",
        content: seg.text,
        createdAt: now,
        collapsedByDefault: false,
      });
    } else if (seg.type === "text") {
      const index = textIdx++;
      blocks.push({
        kind: "assistant",
        id: turnId ? `turn:${turnId}:assistant:${index}` : `streaming-assistant-${index}`,
        content: seg.text,
        createdAt: now,
      });
    } else if (seg.type === "tool") {
      const tool = state.activeTools.get(seg.toolCallId);
      if (tool) {
        blocks.push(toolEntryToBlock(seg.toolCallId, tool, now, turnId));
      }
    } else if (seg.type === "compaction") {
      const block = state.activeCompactions.get(seg.turnId);
      if (block) {
        blocks.push(block);
      }
    }
  }

  if (state.retryNotice) {
    blocks.push({
      kind: "status",
      id: turnId
        ? `turn:${turnId}:retry:${state.retryNotice.attempt}`
        : `llm-retry-${state.retryNotice.attempt}`,
      content: `网关异常，正在重试 (${state.retryNotice.attempt}/${state.retryNotice.maxAttempts})`,
      createdAt: now,
      tone: "muted",
    });
  }

  return blocks;
}

function createCompactionBlock(input: {
  turnId: string;
  status: Extract<MessageBlock, { kind: "context_compaction" }>["status"];
  trigger?: "manual" | "auto";
  stage?: string;
  progress?: number;
  summaryText?: string;
}): Extract<MessageBlock, { kind: "context_compaction" }> {
  return {
    kind: "context_compaction",
    id: `turn:${input.turnId}:context-compaction:0`,
    status: input.status,
    trigger: input.trigger ?? "manual",
    stage: input.stage,
    progress: input.progress,
    summaryText: input.summaryText ?? (input.status === "pending" ? "/compact" : "Compacting context"),
    createdAt: new Date().toISOString(),
  };
}

function formatContextCompactionSummary(removedCount: number): string {
  if (removedCount <= 0) return "Context compacted";
  return `Context compacted · ${removedCount} ${removedCount === 1 ? "message" : "messages"}`;
}

function upsertCompactionSegment(state: StreamingState, turnId: string): void {
  if (!state.segments.some((segment) => segment.type === "compaction" && segment.turnId === turnId)) {
    state.segments.push({ type: "compaction", turnId });
  }
}

let turnCounter = 0;
function nextTurnId(): string {
  return `turn-${Date.now()}-${++turnCounter}`;
}

function modelSelectionPayload(model: ModelSelectionId): { model?: ModelId; modelKey?: ModelKey } {
  return model.includes(":") ? { modelKey: model as ModelKey } : { model: model as ModelId };
}

export function App() {
  const [bootstrapState, setBootstrapState] = useState<BootstrapState | null>(null);
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [sessionRecord, setSessionRecord] = useState<SessionRecord | null>(null);
  const [localSessionRecords, setLocalSessionRecords] = useState<Record<string, SessionRecord>>({});
  const [turnResult, setTurnResult] = useState<AgentTurnResult | null>(null);
  const [workspaceRegistry, setWorkspaceRegistry] = useState<WorkspaceListResult | null>(null);
  const [sessionBootstrapComplete, setSessionBootstrapComplete] = useState(!hasActspaceBridge());
  const [isStreaming, setIsStreaming] = useState(false);
  const [isAborting, setIsAborting] = useState(false);
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  const [streamingBlocks, setStreamingBlocks] = useState<MessageBlock[]>([]);
  // 后台 bash 任务状态（taskId → 最新状态）；bash_task_update 事件驱动，覆写块显示
  const [bashTaskUpdates, setBashTaskUpdates] = useState<Record<string, { status: BashBackgroundStatus; exitCode?: number | null }>>({});
  const [sendScrollRequestId, setSendScrollRequestId] = useState(0);
  const [defaultModelId, setDefaultModelId] = useState<ModelSelectionId | undefined>(undefined);
  const [selectedChatModelId, setSelectedChatModelId] = useState<ModelSelectionId>(DEFAULT_MODEL_ID);
  const [usableChatModels, setUsableChatModels] = useState<UsableModelView[] | undefined>(undefined);
  const [approvalPendingSessionIds, setApprovalPendingSessionIds] = useState<Set<string>>(() => new Set());
  const [failedSessionIds, setFailedSessionIds] = useState<Set<string>>(() => new Set());
  const [selectedWorkspaceRoot, setSelectedWorkspaceRoot] = useState<string | null>(null);
  const [reviewSummary, setReviewSummary] = useState<ComposerReviewSummary | null>(null);
  const streamStateRef = useRef<StreamingState>(createEmptyStreamingState());
  const streamingUserBlockRef = useRef<MessageBlock | null>(null);
  const toolFinishTimersRef = useRef<Map<string, number>>(new Map());
  const activeSessionIdRef = useRef<string | null>(null);
  const activeStreamTurnRef = useRef<{ sessionId: string; turnId: string } | null>(null);
  const reviewRefreshRequestIdRef = useRef(0);
  const userPickedChatModelRef = useRef(false);

  const refreshWorkspaces = useCallback(async () => {
    if (!hasActspaceBridge() || !window.actspace.listWorkspaces) return null;
    const registry = await window.actspace.listWorkspaces();
    setWorkspaceRegistry(registry);
    return registry;
  }, []);

  const findWorkspaceOption = useCallback((workspaceRoot: string | null | undefined) => {
    const normalized = normalizeWorkspaceRoot(workspaceRoot);
    if (!normalized) return undefined;
    return workspaceRegistry?.items.find((workspace) => workspace.path === normalized);
  }, [workspaceRegistry?.items]);

  const refreshStreamingBlocks = useCallback((userBlock?: MessageBlock | null) => {
    const newStreamBlocks = streamingStateToBlocks(
      streamStateRef.current,
      activeStreamTurnRef.current?.turnId,
    );
    const currentUserBlock = userBlock ?? streamingUserBlockRef.current;
    setStreamingBlocks(currentUserBlock ? [currentUserBlock, ...newStreamBlocks] : newStreamBlocks);
  }, []);

  const clearToolFinishTimers = useCallback(() => {
    for (const timerId of toolFinishTimersRef.current.values()) {
      window.clearTimeout(timerId);
    }
    toolFinishTimersRef.current.clear();
  }, []);

  const setApprovalPendingForSession = useCallback((sessionId: string | null | undefined, pending: boolean) => {
    if (!sessionId) return;
    setApprovalPendingSessionIds((current) => updateStringSet(current, sessionId, pending));
  }, []);

  const setFailedForSession = useCallback((sessionId: string | null | undefined, failed: boolean) => {
    if (!sessionId) return;
    setFailedSessionIds((current) => updateStringSet(current, sessionId, failed));
  }, []);

  const refreshReviewSummary = useCallback(async (workspaceRoot?: string | null) => {
    if (!hasActspaceBridge()) return;

    const api = window.actspace?.getWorkspaceReview;
    if (!api) {
      setReviewSummary(null);
      return;
    }

    const resolvedWorkspaceRoot = normalizeWorkspaceRoot(
      workspaceRoot ?? selectedWorkspaceRoot ?? sessionRecord?.meta.workspaceRoot ?? bootstrapState?.workspaceRoot,
    );
    const requestId = ++reviewRefreshRequestIdRef.current;
    setReviewSummary({ status: "loading" });

    try {
      const result = await api({
        workspaceRoot: resolvedWorkspaceRoot ?? undefined,
        scope: "uncommitted",
      });
      if (requestId !== reviewRefreshRequestIdRef.current) return;
      setReviewSummary(reviewResultToSummary(result));
    } catch (error) {
      console.error("Failed to refresh Review summary", error);
      if (requestId !== reviewRefreshRequestIdRef.current) return;
      setReviewSummary({
        status: "failed",
        reason: "command_failed",
      });
    }
  }, [bootstrapState?.workspaceRoot, selectedWorkspaceRoot, sessionRecord?.meta.workspaceRoot]);

  const refreshPendingApprovalStatuses = useCallback(async (sessionIds: string[]) => {
    if (!hasActspaceBridge() || !window.actspace.listPendingApprovals) return;

    const uniqueSessionIds = [...new Set(sessionIds.filter(Boolean))];
    if (uniqueSessionIds.length === 0) return;

    const results = await Promise.all(uniqueSessionIds.map(async (sessionId) => {
      try {
        const pending = await window.actspace.listPendingApprovals({ sessionId });
        return { sessionId, hasPending: pending.length > 0 };
      } catch (error) {
        console.error("Failed to load pending approvals", error);
        return { sessionId, hasPending: null };
      }
    }));

    setApprovalPendingSessionIds((current) => {
      let next = current;
      for (const result of results) {
        if (result.hasPending === null) continue;
        next = updateStringSet(next, result.sessionId, result.hasPending);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!hasActspaceBridge()) return;

    window.actspace
      .getBootstrapState()
      .then(setBootstrapState)
      .catch((error: unknown) => {
        console.error("Failed to load bootstrap state", error);
        setBootstrapState(null);
      });
  }, []);

  useEffect(() => {
    if (!hasActspaceBridge()) return;
    refreshWorkspaces().catch((error: unknown) => {
      console.error("Failed to load workspaces", error);
    });
  }, [refreshWorkspaces]);

  useEffect(() => {
    if (selectedWorkspaceRoot) return;
    setSelectedWorkspaceRoot(normalizeWorkspaceRoot(sessionRecord?.meta.workspaceRoot ?? bootstrapState?.workspaceRoot));
  }, [bootstrapState?.workspaceRoot, selectedWorkspaceRoot, sessionRecord?.meta.workspaceRoot]);

  useEffect(() => {
    if (!hasActspaceBridge()) return;
    refreshPendingApprovalStatuses(sessions.map((session) => session.id)).catch((error: unknown) => {
      console.error("Failed to refresh pending approval statuses", error);
    });
  }, [refreshPendingApprovalStatuses, sessions]);

  useEffect(() => {
    if (!hasActspaceBridge()) return;
    void refreshReviewSummary();
  }, [refreshReviewSummary]);

  useEffect(() => {
    if (!hasActspaceBridge() || !window.actspace.getSettings) return;

    if (!window.actspace.listUsableModels) {
      window.actspace.getSettings()
        .then((settings) => {
          const configured = settings.taskModels?.defaultChatModel ?? settings.defaultModelId ?? DEFAULT_MODEL_ID;
          setDefaultModelId(configured);
          if (!userPickedChatModelRef.current) setSelectedChatModelId(configured);
        })
        .catch((error: unknown) => {
          console.error("Failed to load settings", error);
        });
      return;
    }

    Promise.all([
      window.actspace.getSettings(),
      window.actspace.listUsableModels({ purpose: "chat" }),
    ])
      .then(([settings, usable]) => {
        const configured = resolvePreferredChatModel(settings, usable.models);
        setUsableChatModels(usable.models);
        setDefaultModelId(configured);
        if (!userPickedChatModelRef.current) {
          setSelectedChatModelId(configured);
        }
      })
      .catch((error: unknown) => {
        console.error("Failed to load settings", error);
      });
  }, []);

  const handleSettingsChange = useCallback((settings: AppSettings) => {
    if (!window.actspace.listUsableModels) {
      const configured = settings.taskModels?.defaultChatModel ?? settings.defaultModelId ?? DEFAULT_MODEL_ID;
      setDefaultModelId(configured);
      if (!userPickedChatModelRef.current) setSelectedChatModelId(configured);
      return;
    }
    void window.actspace.listUsableModels({ purpose: "chat" }).then((result) => {
      const configured = resolvePreferredChatModel(settings, result.models);
      setUsableChatModels(result.models);
      setDefaultModelId(configured);
      if (!userPickedChatModelRef.current) {
        setSelectedChatModelId(configured);
      }
    });
  }, []);

  const handleSelectedChatModelChange = useCallback((modelId: ModelSelectionId) => {
    userPickedChatModelRef.current = true;
    setSelectedChatModelId(modelId);
  }, []);

  useEffect(() => {
    if (!hasActspaceBridge()) return;

    async function bootstrapSession() {
      const listedSessions = await window.actspace.listSessions();
      setSessions(listedSessions);

      const existing = listedSessions[0];
      if (existing) {
        activeSessionIdRef.current = existing.id;
        const restored = await window.actspace.getSession({ sessionId: existing.id });
        setSessionRecord(restored);
        setSelectedWorkspaceRoot(
          normalizeWorkspaceRoot(restored?.meta.workspaceRoot ?? existing.workspaceRoot ?? bootstrapState?.workspaceRoot),
        );
        setSessionBootstrapComplete(true);
        return;
      }

      activeSessionIdRef.current = null;
      setSessionRecord(null);
      setTurnResult(null);
      setSelectedWorkspaceRoot(normalizeWorkspaceRoot(bootstrapState?.workspaceRoot));
      setSessionBootstrapComplete(true);
    }

    bootstrapSession().catch((error: unknown) => {
      console.error("Failed to bootstrap session", error);
      activeSessionIdRef.current = null;
      setSessions([]);
      setSessionRecord(null);
      setTurnResult(null);
      setSessionBootstrapComplete(true);
    });
  }, []);

  const handleStreamEvent = useCallback((event: RuntimeStreamEvent) => {
    const state = streamStateRef.current;

    switch (event.type) {
      case "turn_started":
        break;

      case "context_compaction_started":
        upsertCompactionSegment(state, event.turnId);
        state.activeCompactions.set(event.turnId, createCompactionBlock({
          turnId: event.turnId,
          status: "running",
          trigger: event.trigger,
          stage: event.stage,
          progress: event.progress,
          summaryText: "Compacting context",
        }));
        break;

      case "context_compaction_progress": {
        upsertCompactionSegment(state, event.turnId);
        const existing = state.activeCompactions.get(event.turnId);
        state.activeCompactions.set(event.turnId, {
          ...(existing ?? createCompactionBlock({
            turnId: event.turnId,
            status: "running",
            trigger: event.trigger,
            summaryText: "Compacting context",
          })),
          status: "running",
          stage: event.stage,
          progress: event.progress,
          summaryText: event.summary ?? existing?.summaryText ?? "Compacting context",
        });
        break;
      }

      case "context_compaction_finished": {
        upsertCompactionSegment(state, event.turnId);
        const removedCount = event.payload.removedCount ?? Math.max(event.payload.beforeCount - event.payload.afterCount, 0);
        state.activeCompactions.set(event.turnId, createCompactionBlock({
          turnId: event.turnId,
          status: event.status === "compacted" ? "completed" : "skipped",
          trigger: event.trigger,
          stage: event.stage,
          progress: event.progress,
          summaryText: event.status === "skipped"
            ? (event.summary ?? "Nothing to compact")
            : formatContextCompactionSummary(removedCount),
        }));
        break;
      }

      case "context_compaction_failed":
        upsertCompactionSegment(state, event.turnId);
        state.activeCompactions.set(event.turnId, createCompactionBlock({
          turnId: event.turnId,
          status: "failed",
          trigger: event.trigger,
          stage: event.stage,
          summaryText: event.error.message,
        }));
        break;

      case "assistant_thinking_delta":
        state.retryNotice = undefined;
        appendOrMergeSegment(state.segments, "thinking", event.delta);
        break;

      case "assistant_text_delta":
        state.retryNotice = undefined;
        appendOrMergeSegment(state.segments, "text", event.delta);
        break;

      case "llm_retry":
        dropTrailingStreamSegments(state.segments);
        state.retryNotice = { attempt: event.attempt, maxAttempts: event.maxAttempts };
        break;

      case "tool_call_streaming": {
        const existing = state.activeTools.get(event.toolCallId);
        if (existing) {
          existing.preview = event.preview;
        } else {
          state.activeTools.set(event.toolCallId, {
            toolName: event.toolName,
            preview: event.preview,
            startedAt: Date.now(),
          });
          state.segments.push({ type: "tool", toolCallId: event.toolCallId });
        }
        break;
      }

      case "tool_started": {
        const existing = state.activeTools.get(event.toolCallId);
        if (existing) {
          existing.preview = event.preview;
          existing.toolName = event.toolName;
        } else {
          state.activeTools.set(event.toolCallId, {
            toolName: event.toolName,
            preview: event.preview,
            startedAt: Date.now(),
          });
          state.segments.push({ type: "tool", toolCallId: event.toolCallId });
        }
        break;
      }

      case "tool_finished": {
        const tool = state.activeTools.get(event.toolCallId);
        if (tool) {
          if (event.preview) {
            tool.preview = event.preview;
          }
          const finishTool = () => {
            const latest = streamStateRef.current.activeTools.get(event.toolCallId);
            if (!latest) return;
            latest.finished = true;
            latest.isError = event.isError;
            toolFinishTimersRef.current.delete(event.toolCallId);
            refreshStreamingBlocks();
          };
          const elapsedMs = Date.now() - tool.startedAt;
          const remainingMs = Math.max(0, MIN_TOOL_RUNNING_MS - elapsedMs);
          const existingTimer = toolFinishTimersRef.current.get(event.toolCallId);
          if (existingTimer !== undefined) {
            window.clearTimeout(existingTimer);
          }
          if (remainingMs > 0) {
            const timerId = window.setTimeout(finishTool, remainingMs);
            toolFinishTimersRef.current.set(event.toolCallId, timerId);
          } else {
            finishTool();
          }
        }
        break;
      }

      case "bash_task_update": {
        setBashTaskUpdates((current) => ({
          ...current,
          [event.taskId]: { status: event.status, exitCode: event.exitCode },
        }));
        break;
      }

      case "subagent_event": {
        const existing = state.activeTools.get(event.toolCallId);
        if (existing) {
          existing.preview = event.preview;
          existing.transcriptEvents = [...(existing.transcriptEvents ?? []), event.event];
        } else {
          state.activeTools.set(event.toolCallId, {
            toolName: "agent",
            preview: event.preview,
            startedAt: Date.now(),
            transcriptEvents: [event.event],
          });
          state.segments.push({ type: "tool", toolCallId: event.toolCallId });
        }
        break;
      }

      case "tool_approval_required": {
        const tool = state.activeTools.get(event.toolCallId);
        if (tool) {
          tool.approvalPending = true;
          tool.approvalRequestId = event.requestId;
          tool.approvalReason = event.reason;
          tool.approvalSummary = event.summary;
          tool.approvalScope = event.approvalScope;
          if (tool.preview?.kind === "bash" && event.command) {
            tool.preview = { ...tool.preview, command: event.command };
          }
          if (tool.preview?.kind === "delete") {
            tool.preview = {
              ...tool.preview,
              displayText: "Delete file requires approval",
              status: "pending",
              approvalRequestId: event.requestId,
            };
          }
        }
        break;
      }

      case "tool_approval_resolved": {
        const tool = state.activeTools.get(event.toolCallId);
        if (tool) {
          tool.approvalPending = false;
          if (tool.preview?.kind === "delete" && event.decision === "deny") {
            tool.finished = true;
            tool.isError = true;
            tool.preview = {
              ...tool.preview,
              displayText: `Denied delete ${tool.preview.filePath || "file..."}`,
              status: "denied",
            };
          }
        }
        break;
      }

      case "turn_finished":
        return;

      case "turn_aborted":
        return;

      case "turn_failed":
        return;
    }

    refreshStreamingBlocks();
  }, [refreshStreamingBlocks]);

  useEffect(() => {
    if (!hasActspaceBridge()) return;

    return window.actspace.onAgentStream((event) => {
      if (event.type === "tool_approval_required") {
        setApprovalPendingForSession(event.sessionId, true);
      } else if (
        event.type === "tool_approval_resolved" ||
        event.type === "turn_aborted" ||
        event.type === "turn_finished" ||
        event.type === "turn_failed"
      ) {
        refreshPendingApprovalStatuses([event.sessionId]).catch((error: unknown) => {
          console.error("Failed to refresh stream approval status", error);
        });
      }

      if (event.type === "turn_finished" || event.type === "turn_aborted") {
        setFailedForSession(event.sessionId, false);
      } else if (event.type === "turn_failed") {
        setFailedForSession(event.sessionId, true);
      }

      if (event.type === "bash_task_update") {
        if (event.sessionId === activeSessionIdRef.current) {
          handleStreamEvent(event);
        }
        return;
      }

      const activeTurn = activeStreamTurnRef.current;
      if (
        !activeTurn ||
        event.sessionId !== activeTurn.sessionId ||
        event.turnId !== activeTurn.turnId ||
        event.sessionId !== activeSessionIdRef.current
      ) {
        return;
      }

      handleStreamEvent(event);
    });
  }, [handleStreamEvent, refreshPendingApprovalStatuses, setApprovalPendingForSession, setFailedForSession]);

  const createSessionForInput = useCallback(async (input: NewSessionInput = {}): Promise<SessionRecord | null> => {
    if (!hasActspaceBridge()) {
      const created = createLocalEmptySession(input);
      activeSessionIdRef.current = created.meta.id;
      setSessionRecord(created);
      setSelectedWorkspaceRoot(normalizeWorkspaceRoot(created.meta.workspaceRoot ?? bootstrapState?.workspaceRoot));
      setLocalSessionRecords((current) => ({ ...current, [created.meta.id]: created }));
      setSessions((current) => [
        {
          id: created.meta.id,
          title: created.meta.title,
          updatedAt: created.meta.updatedAt,
          turnCount: created.meta.turnCount,
          workspaceRoot: created.meta.workspaceRoot,
        },
        ...current,
      ]);
      return created;
    }

    try {
      const created = await window.actspace.createSession({
        title: "New chat",
        ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
        ...(input.workspaceRoot ? { workspaceRoot: input.workspaceRoot } : {}),
      });
      activeSessionIdRef.current = created.meta.id;
      setSessionRecord(created);
      setSelectedWorkspaceRoot(normalizeWorkspaceRoot(created.meta.workspaceRoot ?? bootstrapState?.workspaceRoot));
      const refreshed = await window.actspace.listSessions();
      setSessions(refreshed);
      await refreshWorkspaces();
      return created;
    } catch (error) {
      console.error("Failed to create session", error);
      return null;
    }
  }, [bootstrapState?.workspaceRoot, refreshWorkspaces]);

  const handleSend = useCallback(async (
    text: string,
    options: ComposerSendOptions,
  ) => {
    if (isStreaming || (!text.trim() && !options.attachments?.length)) return;

    const createdSession = activeSessionIdRef.current
      ? null
      : await createSessionForInput(selectedWorkspaceRoot ? { workspaceRoot: selectedWorkspaceRoot } : {});
    const sessionId = activeSessionIdRef.current ?? createdSession?.meta.id;
    if (!sessionId) return;

    const turnId = nextTurnId();
    const trimmedText = text.trim();
    const isCompactCommand = trimmedText === "/compact";
    const evalCommandMatch = /^\/eval(?:\s+([\s\S]+))?$/.exec(trimmedText);
    const isEvalCommand = evalCommandMatch !== null;
    const evalFailureReason = evalCommandMatch?.[1]?.trim();
    const nextWorkspaceRoot = selectedWorkspaceRoot;
    let nextWorkspace = findWorkspaceOption(nextWorkspaceRoot);
    const currentWorkspaceRoot = normalizeWorkspaceRoot(
      (createdSession ?? sessionRecord)?.meta.workspaceRoot ?? bootstrapState?.workspaceRoot,
    );

    if (
      hasActspaceBridge() &&
      nextWorkspaceRoot &&
      nextWorkspaceRoot !== currentWorkspaceRoot &&
      window.actspace.setSessionWorkspace
    ) {
      try {
        if (!nextWorkspace?.id) {
          const latestRegistry = await refreshWorkspaces();
          const normalizedNextRoot = normalizeWorkspaceRoot(nextWorkspaceRoot);
          nextWorkspace = latestRegistry?.items.find((workspace) => workspace.path === normalizedNextRoot) ?? nextWorkspace;
        }
        const result = await window.actspace.setSessionWorkspace({
          sessionId,
          ...(nextWorkspace?.id ? { workspaceId: nextWorkspace.id } : {}),
          workspaceRoot: nextWorkspaceRoot,
        });
        if (!result.ok) {
          console.error("Failed to set session workspace", result.error);
          setFailedForSession(sessionId, true);
          return;
        }
        setSessionRecord((current) => current
          ? {
              ...current,
              meta: {
                ...current.meta,
                ...(nextWorkspace?.id ? { workspaceId: nextWorkspace.id } : {}),
                workspaceRoot: nextWorkspaceRoot,
              },
            }
          : current);
      } catch (error) {
        console.error("Failed to set session workspace", error);
        setFailedForSession(sessionId, true);
        return;
      }
    }

    setIsStreaming(true);
    setIsAborting(false);
    setActiveTurnId(turnId);
    activeStreamTurnRef.current = { sessionId, turnId };
    setApprovalPendingForSession(sessionId, false);
    setFailedForSession(sessionId, false);
    clearToolFinishTimers();
    streamStateRef.current = createEmptyStreamingState();

    if (isCompactCommand) {
      const pendingBlock = createCompactionBlock({
        turnId,
        status: "pending",
        summaryText: "/compact",
      });
      upsertCompactionSegment(streamStateRef.current, turnId);
      streamStateRef.current.activeCompactions.set(turnId, pendingBlock);
      streamingUserBlockRef.current = null;
      setStreamingBlocks([pendingBlock]);
    } else if (isEvalCommand) {
      streamingUserBlockRef.current = null;
      setStreamingBlocks([{
        kind: "status",
        id: `turn:${turnId}:eval-candidate:0`,
        content: "Generating eval candidate...",
        createdAt: new Date().toISOString(),
        tone: "muted",
      }]);
    } else {
      const userBlock: MessageBlock = {
        kind: "user",
        id: `turn:${turnId}:user:0`,
        content: text,
        createdAt: new Date().toISOString(),
        attachments: options.attachments,
      };
      streamingUserBlockRef.current = userBlock;
      setStreamingBlocks([userBlock]);
    }
    setSendScrollRequestId((value) => value + 1);

    const isCurrentVisibleTurn = () => {
      const activeTurn = activeStreamTurnRef.current;
      return activeTurn?.sessionId === sessionId &&
        activeTurn.turnId === turnId &&
        activeSessionIdRef.current === sessionId;
    };

    const finishCurrentVisibleTurn = () => {
      if (!isCurrentVisibleTurn()) return false;

      clearToolFinishTimers();
      if (hasActspaceBridge()) {
        void refreshReviewSummary(nextWorkspaceRoot);
      }
      activeStreamTurnRef.current = null;
      setIsStreaming(false);
      setIsAborting(false);
      setActiveTurnId(null);
      setStreamingBlocks([]);
      streamStateRef.current = createEmptyStreamingState();
      streamingUserBlockRef.current = null;
      return true;
    };

    try {
      if (hasActspaceBridge()) {
        if (isCompactCommand) {
          const input: CompactContextInput = {
            sessionId,
            turnId,
            ...modelSelectionPayload(options.model),
          };
          const result = await window.actspace.compactContext(input);
          if (isCurrentVisibleTurn()) {
            setApprovalPendingForSession(sessionId, false);
            setFailedForSession(sessionId, result.status === "failed");
            const restored = await window.actspace.getSession({ sessionId });
            if (isCurrentVisibleTurn()) {
              setSessionRecord(restored ?? {
                meta: {
                  id: result.sessionId,
                  title: "New chat",
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  turnCount: sessionRecord?.meta.turnCount ?? 0,
                },
                events: result.events,
                contextSnapshot: result.contextSnapshot,
              });
              setTurnResult(null);
              finishCurrentVisibleTurn();
            }
          }
          const refreshed = await window.actspace.listSessions();
          setSessions(refreshed);
          return;
        }

        if (isEvalCommand) {
          if (!window.actspace.generateEvalCandidate) {
            throw new Error("Eval candidate generation is not available");
          }
          const input: GenerateEvalCandidateInput = {
            sessionId,
            turnId,
            reason: evalFailureReason,
            ...modelSelectionPayload(options.model),
            thinkingEnabled: options.thinkingEnabled,
          };
          const result = await window.actspace.generateEvalCandidate(input);
          if (isCurrentVisibleTurn()) {
            setApprovalPendingForSession(sessionId, false);
            setFailedForSession(sessionId, result.status === "failed");
            const restored = await window.actspace.getSession({ sessionId });
            if (isCurrentVisibleTurn()) {
              setSessionRecord(restored ?? {
                meta: {
                  id: result.sessionId,
                  title: "New chat",
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  turnCount: sessionRecord?.meta.turnCount ?? 0,
                },
                events: result.events,
              });
              setTurnResult(null);
              finishCurrentVisibleTurn();
            }
          }
          const refreshed = await window.actspace.listSessions();
          setSessions(refreshed);
          return;
        }

        const input: RunTurnInput = {
          sessionId,
          turnId,
          userInput: text,
          attachments: options.attachments,
          ...modelSelectionPayload(options.model),
          thinkingEnabled: options.thinkingEnabled,
        };
        const result = await window.actspace.runTurn(input);

        if (isCurrentVisibleTurn()) {
          setApprovalPendingForSession(sessionId, false);
          setFailedForSession(sessionId, result.status === "failed");
          const restored = await window.actspace.getSession({ sessionId });
          if (isCurrentVisibleTurn()) {
            setSessionRecord(restored ?? {
              meta: {
                id: result.sessionId,
                title: "New chat",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                turnCount: 1,
              },
              events: result.events,
              contextSnapshot: result.contextSnapshot,
            });
            setTurnResult(null);
            finishCurrentVisibleTurn();
          }
        }
        const refreshed = await window.actspace.listSessions();
        setSessions(refreshed);
      }
    } catch (error) {
      console.error("Failed to run turn", error);
      if (isCurrentVisibleTurn()) {
        setApprovalPendingForSession(sessionId, false);
        setFailedForSession(sessionId, true);
      } else {
        const activeTurn = activeStreamTurnRef.current;
        if (!activeTurn || activeTurn.sessionId !== sessionId) {
          setFailedForSession(sessionId, true);
        }
        refreshPendingApprovalStatuses([sessionId]).catch((refreshError: unknown) => {
          console.error("Failed to refresh approval status after background turn error", refreshError);
        });
      }
    } finally {
      finishCurrentVisibleTurn();
    }
  }, [
    isStreaming,
    selectedWorkspaceRoot,
    findWorkspaceOption,
    refreshWorkspaces,
    sessionRecord?.meta.workspaceRoot,
    bootstrapState?.workspaceRoot,
    clearToolFinishTimers,
    refreshReviewSummary,
    refreshPendingApprovalStatuses,
    setApprovalPendingForSession,
    setFailedForSession,
    createSessionForInput,
  ]);

  const handleAbort = useCallback(async () => {
    const sessionId = activeSessionIdRef.current;
    if (!hasActspaceBridge() || !activeTurnId || !sessionId) return;

    const input: AbortTurnInput = {
      sessionId,
      turnId: activeTurnId,
    };

    try {
      setIsAborting(true);
      const aborted = await window.actspace.abortTurn(input);
      if (!aborted) {
        setIsAborting(false);
      }
    } catch (error) {
      console.error("Failed to abort turn", error);
      setIsAborting(false);
    }
  }, [activeTurnId]);

  const handleCreateSession = useCallback(async (input: NewSessionInput = {}) => {
    activeStreamTurnRef.current = null;
    setIsStreaming(false);
    setIsAborting(false);
    setActiveTurnId(null);
    setTurnResult(null);
    setStreamingBlocks([]);
    clearToolFinishTimers();
    streamStateRef.current = createEmptyStreamingState();
    streamingUserBlockRef.current = null;

    await createSessionForInput(input);
  }, [clearToolFinishTimers, createSessionForInput]);

  const handleAddWorkspace = useCallback(async () => {
    if (!hasActspaceBridge()) {
      return;
    }

    if (!window.actspace.selectWorkspaceDirectory) {
      console.error("Workspace directory picker is not available");
      return;
    }

    try {
      const result = await window.actspace.selectWorkspaceDirectory();
      if (result.canceled || !result.workspaceRoot) return;
      await handleCreateSession({ workspaceRoot: result.workspaceRoot });
    } catch (error) {
      console.error("Failed to add workspace", error);
    }
  }, [handleCreateSession]);

  const handleSelectSession = useCallback(
    async (sessionId: string) => {
      if (!sessionId || sessionId === activeSessionIdRef.current) return;

      activeStreamTurnRef.current = null;
      setIsStreaming(false);
      setIsAborting(false);
      setActiveTurnId(null);
      setStreamingBlocks([]);
      clearToolFinishTimers();
      streamStateRef.current = createEmptyStreamingState();
      streamingUserBlockRef.current = null;
      setTurnResult(null);
      activeSessionIdRef.current = sessionId;
      refreshPendingApprovalStatuses([sessionId]).catch((error: unknown) => {
        console.error("Failed to refresh selected session approvals", error);
      });

      if (!hasActspaceBridge()) {
        const selected = localSessionRecords[sessionId];
        if (selected) {
          setSessionRecord(selected);
          setSelectedWorkspaceRoot(normalizeWorkspaceRoot(selected.meta.workspaceRoot ?? bootstrapState?.workspaceRoot));
          return;
        }
        return;
      }

      try {
        const restored = await window.actspace.getSession({ sessionId });
        setSessionRecord(restored);
        setSelectedWorkspaceRoot(normalizeWorkspaceRoot(restored?.meta.workspaceRoot ?? bootstrapState?.workspaceRoot));
      } catch (error) {
        console.error("Failed to select session", error);
      }
    },
    [bootstrapState?.workspaceRoot, localSessionRecords, clearToolFinishTimers, refreshPendingApprovalStatuses],
  );

  useEffect(() => {
    return () => {
      clearToolFinishTimers();
    };
  }, [clearToolFinishTimers]);

  const persistedEvents = sessionRecord?.events ?? turnResult?.events ?? [];
  const persistedMessages = useMemo<MessageBlock[]>(() => {
    const streamingTurnId = streamingBlocks.length > 0 ? activeTurnId : null;
    const streamingTurnEventIds = streamingTurnId
      ? new Set(
          persistedEvents
            .filter((event) => event.turnId === streamingTurnId)
            .map((event) => event.id),
        )
      : null;
    const fromRecord = sessionRecord?.messageBlocks;
    if (fromRecord && fromRecord.length > 0) {
      return streamingTurnEventIds
        ? fromRecord.filter((block) => !streamingTurnEventIds.has(block.id))
        : fromRecord;
    }

    const visibleEvents = streamingTurnId
      ? persistedEvents.filter((event) => event.turnId !== streamingTurnId)
      : persistedEvents;
    const fromEvents = createMessageBlocks(visibleEvents);
    if (fromEvents.length > 0) return fromEvents;
    return [];
  }, [activeTurnId, persistedEvents, sessionRecord?.messageBlocks, streamingBlocks.length]);

  const messages = useMemo<MessageBlock[]>(() => {
    const merged = streamingBlocks.length === 0 ? persistedMessages : [...persistedMessages, ...streamingBlocks];
    // 后台 bash 任务状态覆写：bash_task_update 事件在 turn 结束后仍会到达，
    // 持久化块里的 backgrounded 状态以内存最新事件为准
    if (Object.keys(bashTaskUpdates).length === 0) return merged;
    return merged.map((block) => {
      if (block.kind !== "bash" || !block.backgroundTaskId) return block;
      const update = bashTaskUpdates[block.backgroundTaskId];
      if (!update) return block;
      return { ...block, backgroundStatus: update.status, exitCode: update.exitCode ?? block.exitCode };
    });
  }, [persistedMessages, streamingBlocks, bashTaskUpdates]);

  const contextSnapshot: ContextUsageSnapshot | null =
    sessionRecord?.contextSnapshot ??
    turnResult?.contextSnapshot ??
    getLatestContextSnapshot(persistedEvents);

  const contextState: ContextState | null =
    sessionRecord?.contextState ?? turnResult?.contextState ?? null;

  const activeSessionId =
    sessionRecord?.meta.id ?? turnResult?.sessionId ?? sessions[0]?.id ?? null;
  const isSessionReady = Boolean(sessionRecord || turnResult || streamingBlocks.length > 0 || sessionBootstrapComplete);
  const title = getSessionTitle(sessionRecord, sessions);
  const workspaceOptions = useMemo(
    () =>
      workspaceRegistry
        ? createWorkspaceOptionsFromRegistry(workspaceRegistry.items)
        : createWorkspaceOptionsFromRoots([
            selectedWorkspaceRoot,
            sessionRecord?.meta.workspaceRoot,
            bootstrapState?.workspaceRoot,
            ...sessions.map((session) => session.workspaceRoot),
          ], bootstrapState?.workspaceRoot),
    [bootstrapState?.workspaceRoot, selectedWorkspaceRoot, sessionRecord?.meta.workspaceRoot, sessions, workspaceRegistry],
  );
  const busySessionIds = useMemo<Set<string>>(() => {
    const set = new Set<string>();
    if (isStreaming) {
      const id = activeSessionIdRef.current;
      if (id) set.add(id);
    }
    return set;
  }, [isStreaming]);
  const sessionStatuses = useMemo<Record<string, SessionUiStatusKind>>(() => {
    const statuses: Record<string, SessionUiStatusKind> = {};
    for (const sessionId of failedSessionIds) {
      statuses[sessionId] = "failed";
    }
    for (const sessionId of busySessionIds) {
      statuses[sessionId] = "running";
    }
    for (const sessionId of approvalPendingSessionIds) {
      statuses[sessionId] = "waiting_approval";
    }
    return statuses;
  }, [approvalPendingSessionIds, busySessionIds, failedSessionIds]);

  const handleTogglePin = useCallback(
    async (sessionId: string, nextPinned: boolean) => {
      if (!hasActspaceBridge()) {
        setSessions((current) =>
          current.map((session) => (session.id === sessionId ? { ...session, pinned: nextPinned } : session)),
        );
        return;
      }

      try {
        await window.actspace.pinSession({ sessionId, pinned: nextPinned });
        const refreshed = await window.actspace.listSessions();
        setSessions(refreshed);
      } catch (error) {
        console.error("Failed to toggle session pin", error);
      }
    },
    [],
  );

  const handleRenameSession = useCallback(
    async (sessionId: string, title: string) => {
      const nextTitle = title.trim();
      if (!sessionId || !nextTitle) return;

      const updateSessionTitle = () => {
        setSessions((current) =>
          current.map((session) => (session.id === sessionId ? { ...session, title: nextTitle } : session)),
        );
        setSessionRecord((current) =>
          current?.meta.id === sessionId
            ? { ...current, meta: { ...current.meta, title: nextTitle } }
            : current,
        );
      };

      if (!hasActspaceBridge()) {
        updateSessionTitle();
        setLocalSessionRecords((current) => {
          const record = current[sessionId];
          if (!record) return current;
          return {
            ...current,
            [sessionId]: {
              ...record,
              meta: {
                ...record.meta,
                title: nextTitle,
              },
            },
          };
        });
        return;
      }

      if (!window.actspace.renameSession) {
        console.error("Session rename is not available");
        return;
      }

      try {
        const result = await window.actspace.renameSession({ sessionId, title: nextTitle });
        if (!result.ok) {
          console.error("Failed to rename session", result.error);
          return;
        }

        const refreshed = await window.actspace.listSessions();
        setSessions(refreshed);
        setSessionRecord((current) =>
          current?.meta.id === sessionId
            ? { ...current, meta: { ...current.meta, title: nextTitle } }
            : current,
        );
      } catch (error) {
        console.error("Failed to rename session", error);
      }
    },
    [],
  );

  const handleArchiveSession = useCallback(
    async (sessionId: string) => {
      if (!sessionId || sessionId === activeSessionId) return;

      if (!hasActspaceBridge()) {
        setSessions((current) => current.filter((session) => session.id !== sessionId));
        setLocalSessionRecords((current) => {
          const next = { ...current };
          delete next[sessionId];
          return next;
        });
        return;
      }

      try {
        await window.actspace.archiveSession({ sessionId, archived: true });
        const refreshed = await window.actspace.listSessions();
        setSessions(refreshed);
      } catch (error) {
        console.error("Failed to archive session", error);
      }
    },
    [activeSessionId],
  );

  const handleArchivedSessionsChange = useCallback(async () => {
    if (!hasActspaceBridge()) return;

    try {
      const refreshed = await window.actspace.listSessions();
      setSessions(refreshed);
    } catch (error) {
      console.error("Failed to refresh sessions after archived chats changed", error);
    }
  }, []);

  const getSessionPreview = useCallback(async (session: SessionListItem) => {
    if (!hasActspaceBridge() || !window.actspace.getSessionPreview) return null;
    return window.actspace.getSessionPreview({ sessionId: session.id });
  }, []);

  const handleReviewChanged = useCallback(() => {
    void refreshReviewSummary();
  }, [refreshReviewSummary]);

  return (
    <RightPanelProvider>
      <WorkbenchLayout
        sessions={sessions}
        activeSessionId={activeSessionId}
        title={title}
        messages={messages}
        contextSnapshot={contextSnapshot}
        contextState={contextState}
        isStreaming={isStreaming}
        isAborting={isAborting}
        sendScrollRequestId={sendScrollRequestId}
        busySessionIds={busySessionIds}
        sessionStatuses={sessionStatuses}
        onSend={handleSend}
        onAbort={handleAbort}
        onNewSession={handleCreateSession}
        onAddWorkspace={handleAddWorkspace}
        onSelectSession={handleSelectSession}
        onTogglePin={handleTogglePin}
        onRenameSession={handleRenameSession}
        onArchiveSession={handleArchiveSession}
        isSessionReady={isSessionReady}
        defaultModelId={defaultModelId}
        selectedModelId={selectedChatModelId}
        onSelectedModelChange={handleSelectedChatModelChange}
        onSettingsChange={handleSettingsChange}
        onArchivedSessionsChange={handleArchivedSessionsChange}
        workspaces={workspaceRegistry?.items}
        workspaceOptions={workspaceOptions}
        selectedWorkspaceRoot={selectedWorkspaceRoot}
        onSelectWorkspace={setSelectedWorkspaceRoot}
        getSessionPreview={getSessionPreview}
        reviewSummary={reviewSummary}
        onReviewChanged={handleReviewChanged}
        models={usableChatModels}
      />
      <ShutdownOverlay />
    </RightPanelProvider>
  );
}
