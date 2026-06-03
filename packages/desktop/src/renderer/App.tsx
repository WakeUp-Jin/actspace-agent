import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createMessageBlocks, getLatestContextSnapshot } from "@actspace/shared";
import type {
  AbortTurnInput,
  AgentTurnResult,
  AppSettings,
  BashStatus,
  BootstrapState,
  CompactContextInput,
  ContextState,
  ContextUsageSnapshot,
  MessageBlock,
  ModelId,
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
import type { ComposerReviewSummary, ComposerSendOptions, ComposerWorkspaceOption } from "./components/Composer";
import type { NewSessionInput, SessionUiStatusKind } from "./components/Sidebar";
import {
  mockBootstrapState,
  mockContextSnapshot,
  mockMessages,
  mockSessionRecord,
  mockSessions,
  mockTurnResult,
} from "./fixtures/workbenchFixture";

const MIN_TOOL_RUNNING_MS = 300;
const MOCK_ADDED_WORKSPACE_ROOT = "/mock/workspaces/new-project";
const DEFAULT_WORKSPACE_ID = "default";
const DEFAULT_WORKSPACE_LABEL = "Default workspace";

function hasActspaceBridge(): boolean {
  return typeof window !== "undefined" && Boolean(window.actspace);
}

function getSessionTitle(sessionRecord: SessionRecord | null, sessions: SessionListItem[]): string {
  const rawTitle = sessionRecord?.meta.title ?? sessions[0]?.title ?? "Learning documentation plan";
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

function createMockWorkspaceRegistry(defaultWorkspaceRoot: string, sessions: SessionListItem[]): WorkspaceListResult {
  const now = new Date().toISOString();
  const items: WorkspaceEntry[] = [
    {
      id: DEFAULT_WORKSPACE_ID,
      kind: "default",
      label: DEFAULT_WORKSPACE_LABEL,
      path: defaultWorkspaceRoot,
      order: 0,
      createdAt: now,
      updatedAt: now,
    },
  ];
  const seen = new Set(items.map((item) => item.path));
  for (const session of sessions) {
    const root = normalizeWorkspaceRoot(session.workspaceRoot);
    if (!root || seen.has(root)) continue;
    items.push({
      id: session.workspaceId ?? `mock_workspace_${items.length}`,
      kind: "folder",
      label: workspaceLabelFromRoot(root),
      path: root,
      order: items.length,
      createdAt: now,
      updatedAt: now,
    });
    seen.add(root);
  }
  return {
    version: 1,
    defaultWorkspaceId: DEFAULT_WORKSPACE_ID,
    items,
  };
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

function createMockEmptySession(input: NewSessionInput = {}): SessionRecord {
  const now = new Date().toISOString();
  const id = `mock-session-${Date.now()}`;
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

function isDemoSession(sessionId: string | null): boolean {
  return sessionId === "session-learning-doc-plan";
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

function toolEntryToBlock(toolCallId: string, tool: ToolEntry, now: string): MessageBlock {
  const blockId = `streaming-tool-${toolCallId}`;

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
      stderr: tool.isError ? "Tool execution failed" : undefined,
      reason: tool.approvalReason ?? tool.preview.reason,
      approvalRequestId: tool.approvalRequestId,
      intent: tool.preview.intent,
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
    return {
      kind: "edit_diff",
      id: blockId,
      filePath: tool.preview.filePath,
      additions: tool.preview.additions,
      deletions: tool.preview.deletions,
      diff: tool.preview.diff,
      collapsedLines: tool.preview.collapsedLines,
      createdAt: now,
      status: tool.finished ? "completed" : "running",
    };
  }

  if (tool.preview?.kind === "write") {
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
      status: tool.finished ? "completed" : "running",
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
      transcriptEvents: tool.transcriptEvents,
      createdAt: now,
    };
  }

  return {
    kind: "tool",
    id: blockId,
    title: tool.preview?.kind === "generic"
      ? tool.preview.title
      : tool.finished ? `${tool.toolName}` : `Running ${tool.toolName}...`,
    content: tool.preview?.kind === "generic"
      ? tool.preview.content
      : tool.finished
        ? tool.isError ? "Tool execution failed" : "Completed"
        : "Executing...",
    createdAt: now,
    isError: tool.isError,
  };
}

function streamingStateToBlocks(state: StreamingState): MessageBlock[] {
  const now = new Date().toISOString();
  const blocks: MessageBlock[] = [];
  let thinkingIdx = 0;
  let textIdx = 0;

  for (const seg of state.segments) {
    if (seg.type === "thinking") {
      blocks.push({
        kind: "thinking",
        id: `streaming-thinking-${thinkingIdx++}`,
        title: "Thinking...",
        content: seg.text,
        createdAt: now,
        collapsedByDefault: false,
      });
    } else if (seg.type === "text") {
      blocks.push({
        kind: "assistant",
        id: `streaming-assistant-${textIdx++}`,
        content: seg.text,
        createdAt: now,
      });
    } else if (seg.type === "tool") {
      const tool = state.activeTools.get(seg.toolCallId);
      if (tool) {
        blocks.push(toolEntryToBlock(seg.toolCallId, tool, now));
      }
    } else if (seg.type === "compaction") {
      const block = state.activeCompactions.get(seg.turnId);
      if (block) {
        blocks.push(block);
      }
    }
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
  reductionLabel?: string;
}): Extract<MessageBlock, { kind: "context_compaction" }> {
  return {
    kind: "context_compaction",
    id: `streaming-compaction-${input.turnId}`,
    status: input.status,
    trigger: input.trigger ?? "manual",
    stage: input.stage,
    progress: input.progress,
    summaryText: input.summaryText ?? (input.status === "pending" ? "/compact" : "Compacting context"),
    reductionLabel: input.reductionLabel,
    createdAt: new Date().toISOString(),
  };
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

function createStoppedBlock(turnId: string): MessageBlock {
  return {
    kind: "status",
    id: `stopped-${turnId}`,
    content: "Stopped",
    createdAt: new Date().toISOString(),
    tone: "muted",
  };
}

export function App() {
  const [bootstrapState, setBootstrapState] = useState<BootstrapState | null>(
    hasActspaceBridge() ? null : mockBootstrapState,
  );
  const [sessions, setSessions] = useState<SessionListItem[]>(hasActspaceBridge() ? [] : mockSessions);
  const [sessionRecord, setSessionRecord] = useState<SessionRecord | null>(
    hasActspaceBridge() ? null : mockSessionRecord,
  );
  const [mockSessionRecords, setMockSessionRecords] = useState<Record<string, SessionRecord>>(
    hasActspaceBridge() ? {} : { [mockSessionRecord.meta.id]: mockSessionRecord },
  );
  const [turnResult, setTurnResult] = useState<AgentTurnResult | null>(
    hasActspaceBridge() ? null : mockTurnResult,
  );
  const [workspaceRegistry, setWorkspaceRegistry] = useState<WorkspaceListResult | null>(
    hasActspaceBridge()
      ? null
      : createMockWorkspaceRegistry(
          normalizeWorkspaceRoot(mockBootstrapState.workspaceRoot) ?? "/mock/default-workspace",
          mockSessions,
        ),
  );
  const [isStreaming, setIsStreaming] = useState(false);
  const [isAborting, setIsAborting] = useState(false);
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  const [streamingBlocks, setStreamingBlocks] = useState<MessageBlock[]>([]);
  const [sendScrollRequestId, setSendScrollRequestId] = useState(0);
  const [defaultModelId, setDefaultModelId] = useState<ModelId | undefined>(undefined);
  const [approvalPendingSessionIds, setApprovalPendingSessionIds] = useState<Set<string>>(() => new Set());
  const [failedSessionIds, setFailedSessionIds] = useState<Set<string>>(() => new Set());
  const [selectedWorkspaceRoot, setSelectedWorkspaceRoot] = useState<string | null>(
    hasActspaceBridge() ? null : normalizeWorkspaceRoot(mockSessionRecord.meta.workspaceRoot ?? mockBootstrapState.workspaceRoot),
  );
  const [reviewSummary, setReviewSummary] = useState<ComposerReviewSummary | null>(
    hasActspaceBridge()
      ? null
      : {
          status: "changes",
          additions: 4253,
          deletions: 5,
        },
  );
  const streamStateRef = useRef<StreamingState>(createEmptyStreamingState());
  const streamingUserBlockRef = useRef<MessageBlock | null>(null);
  const toolFinishTimersRef = useRef<Map<string, number>>(new Map());
  const activeSessionIdRef = useRef<string>("session-default");
  const reviewRefreshRequestIdRef = useRef(0);

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
    const newStreamBlocks = streamingStateToBlocks(streamStateRef.current);
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
        setBootstrapState(mockBootstrapState);
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

    window.actspace
      .getSettings()
      .then((settings) => setDefaultModelId(settings.defaultModelId ?? undefined))
      .catch((error: unknown) => {
        console.error("Failed to load settings", error);
      });
  }, []);

  const handleSettingsChange = useCallback((settings: AppSettings) => {
    setDefaultModelId(settings.defaultModelId ?? undefined);
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
        return;
      }

      const input: RunTurnInput = {
        sessionId: "session-learning-doc-plan",
        turnId: "turn-0001",
        userInput: "Review the repository, reason about context, and prepare the first runtime slice.",
      };
      activeSessionIdRef.current = input.sessionId;

      const result = await window.actspace.runTurn(input);
      setTurnResult(result);
      const refreshed = await window.actspace.listSessions();
      setSessions(refreshed);
      const restored = await window.actspace.getSession({ sessionId: input.sessionId });
      setSessionRecord(restored);
      setSelectedWorkspaceRoot(normalizeWorkspaceRoot(restored?.meta.workspaceRoot ?? bootstrapState?.workspaceRoot));
    }

    bootstrapSession().catch((error: unknown) => {
      console.error("Failed to bootstrap session", error);
      setSessions(mockSessions);
      setSessionRecord(mockSessionRecord);
      setTurnResult(mockTurnResult);
    });
  }, []);

  const handleStreamEvent = useCallback((event: RuntimeStreamEvent, streamSessionId = activeSessionIdRef.current) => {
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
          summaryText: event.summary ?? (event.status === "skipped" ? "Nothing to compact" : "Context compacted"),
          reductionLabel: removedCount > 0 ? `${removedCount} messages removed` : undefined,
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
        appendOrMergeSegment(state.segments, "thinking", event.delta);
        break;

      case "assistant_text_delta":
        appendOrMergeSegment(state.segments, "text", event.delta);
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
        setApprovalPendingForSession(streamSessionId, true);
        const tool = state.activeTools.get(event.toolCallId);
        if (tool) {
          tool.approvalPending = true;
          tool.approvalRequestId = event.requestId;
          tool.approvalReason = event.reason;
          tool.approvalSummary = event.summary;
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
        setApprovalPendingForSession(streamSessionId, false);
        refreshPendingApprovalStatuses([streamSessionId]).catch((error: unknown) => {
          console.error("Failed to refresh resolved approval status", error);
        });
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
        setApprovalPendingForSession(event.sessionId, false);
        setFailedForSession(event.sessionId, false);
        return;

      case "turn_failed":
        setApprovalPendingForSession(event.sessionId, false);
        setFailedForSession(event.sessionId, true);
        return;
    }

    refreshStreamingBlocks();
  }, [refreshPendingApprovalStatuses, refreshStreamingBlocks, setApprovalPendingForSession, setFailedForSession]);

  const handleSend = useCallback(async (
    text: string,
    options: ComposerSendOptions,
  ) => {
    if (isStreaming || (!text.trim() && !options.attachments?.length)) return;

    const sessionId = activeSessionIdRef.current;
    const turnId = nextTurnId();
    const isCompactCommand = text.trim() === "/compact";
    const nextWorkspaceRoot = selectedWorkspaceRoot;
    let nextWorkspace = findWorkspaceOption(nextWorkspaceRoot);
    const currentWorkspaceRoot = normalizeWorkspaceRoot(sessionRecord?.meta.workspaceRoot ?? bootstrapState?.workspaceRoot);

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
    } else {
      const userBlock: MessageBlock = {
        kind: "user",
        id: `user-${turnId}`,
        content: text,
        createdAt: new Date().toISOString(),
        attachments: options.attachments,
      };
      streamingUserBlockRef.current = userBlock;
      setStreamingBlocks([userBlock]);
    }
    setSendScrollRequestId((value) => value + 1);

    let unsubscribe: (() => void) | undefined;
    if (hasActspaceBridge()) {
      unsubscribe = window.actspace.onAgentStream((event) => {
        handleStreamEvent(event, sessionId);
      });
    }

    let runWasAborted = false;

    try {
      if (hasActspaceBridge()) {
        if (isCompactCommand) {
          const input: CompactContextInput = {
            sessionId,
            turnId,
            model: options.model,
          };
          const result = await window.actspace.compactContext(input);
          setApprovalPendingForSession(sessionId, false);
          setFailedForSession(sessionId, result.status === "failed");
          const restored = await window.actspace.getSession({ sessionId });
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
          const refreshed = await window.actspace.listSessions();
          setSessions(refreshed);
          return;
        }

        const input: RunTurnInput = {
          sessionId,
          turnId,
          userInput: text,
          attachments: options.attachments,
          model: options.model,
          thinkingEnabled: options.thinkingEnabled,
        };
        const result = await window.actspace.runTurn(input);

        if (result.status === "aborted") {
          runWasAborted = true;
          setApprovalPendingForSession(sessionId, false);
          setStreamingBlocks((current) => [...current, createStoppedBlock(turnId)]);
        } else {
          setApprovalPendingForSession(sessionId, false);
          setFailedForSession(sessionId, result.status === "failed");
          const restored = await window.actspace.getSession({ sessionId });
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
        }
        setTurnResult(null);
        const refreshed = await window.actspace.listSessions();
        setSessions(refreshed);
      }
    } catch (error) {
      console.error("Failed to run turn", error);
      setApprovalPendingForSession(sessionId, false);
      setFailedForSession(sessionId, true);
    } finally {
      unsubscribe?.();
      clearToolFinishTimers();
      if (hasActspaceBridge()) {
        void refreshReviewSummary(nextWorkspaceRoot);
      }
      setIsStreaming(false);
      setIsAborting(false);
      setActiveTurnId(null);
      if (!runWasAborted) {
        setStreamingBlocks([]);
      }
      streamStateRef.current = createEmptyStreamingState();
      streamingUserBlockRef.current = null;
    }
  }, [
    isStreaming,
    selectedWorkspaceRoot,
    findWorkspaceOption,
    refreshWorkspaces,
    sessionRecord?.meta.workspaceRoot,
    bootstrapState?.workspaceRoot,
    handleStreamEvent,
    refreshStreamingBlocks,
    clearToolFinishTimers,
    refreshReviewSummary,
    setApprovalPendingForSession,
    setFailedForSession,
  ]);

  const handleAbort = useCallback(async () => {
    if (!hasActspaceBridge() || !activeTurnId) return;

    const input: AbortTurnInput = {
      sessionId: activeSessionIdRef.current,
      turnId: activeTurnId,
    };

    try {
      setIsAborting(true);
      await window.actspace.abortTurn(input);
    } catch (error) {
      console.error("Failed to abort turn", error);
      setIsAborting(false);
    }
  }, [activeTurnId]);

  const handleCreateSession = useCallback(async (input: NewSessionInput = {}) => {
    setTurnResult(null);
    setStreamingBlocks([]);
    clearToolFinishTimers();
    streamStateRef.current = createEmptyStreamingState();
    streamingUserBlockRef.current = null;

    if (!hasActspaceBridge()) {
      const created = createMockEmptySession(input);
      activeSessionIdRef.current = created.meta.id;
      setSessionRecord(created);
      setSelectedWorkspaceRoot(normalizeWorkspaceRoot(created.meta.workspaceRoot ?? bootstrapState?.workspaceRoot));
      setMockSessionRecords((current) => ({ ...current, [created.meta.id]: created }));
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
      return;
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
    } catch (error) {
      console.error("Failed to create session", error);
    }
  }, [bootstrapState?.workspaceRoot, clearToolFinishTimers, refreshWorkspaces]);

  const handleAddWorkspace = useCallback(async () => {
    if (!hasActspaceBridge()) {
      await handleCreateSession({ workspaceRoot: MOCK_ADDED_WORKSPACE_ROOT });
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

      setIsStreaming(false);
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
        const selected = mockSessionRecords[sessionId];
        if (selected) {
          setSessionRecord(selected);
          setSelectedWorkspaceRoot(normalizeWorkspaceRoot(selected.meta.workspaceRoot ?? bootstrapState?.workspaceRoot));
          return;
        }

        const listed = sessions.find((session) => session.id === sessionId);
        if (!listed) return;

        const fixture = mockSessions.find((session) => session.id === sessionId);
        if (!fixture) return;

        setSessionRecord({
          ...mockSessionRecord,
          meta: {
            ...mockSessionRecord.meta,
            id: fixture.id,
            title: fixture.title,
            updatedAt: fixture.updatedAt,
            turnCount: fixture.turnCount,
            workspaceRoot: fixture.workspaceRoot,
            pinned: fixture.pinned,
          },
        });
        setSelectedWorkspaceRoot(normalizeWorkspaceRoot(fixture.workspaceRoot ?? bootstrapState?.workspaceRoot));
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
    [bootstrapState?.workspaceRoot, mockSessionRecords, sessions, clearToolFinishTimers, refreshPendingApprovalStatuses],
  );

  useEffect(() => {
    return () => {
      clearToolFinishTimers();
    };
  }, [clearToolFinishTimers]);

  const persistedEvents = sessionRecord?.events ?? turnResult?.events ?? [];
  const persistedMessages = useMemo<MessageBlock[]>(() => {
    const fromRecord = sessionRecord?.messageBlocks;
    if (fromRecord && fromRecord.length > 0) return fromRecord;

    const fromEvents = createMessageBlocks(persistedEvents);
    if (fromEvents.length > 0) return fromEvents;
    if (hasActspaceBridge() || sessionRecord) return [];
    return mockMessages;
  }, [persistedEvents, sessionRecord?.messageBlocks]);

  const messages = useMemo<MessageBlock[]>(() => {
    if (streamingBlocks.length === 0) return persistedMessages;
    return [...persistedMessages, ...streamingBlocks];
  }, [persistedMessages, streamingBlocks]);

  const contextSnapshot: ContextUsageSnapshot | null =
    sessionRecord?.contextSnapshot ??
    turnResult?.contextSnapshot ??
    getLatestContextSnapshot(persistedEvents) ??
    mockContextSnapshot;

  const contextState: ContextState | null =
    sessionRecord?.contextState ?? turnResult?.contextState ?? null;

  const activeSessionId =
    sessionRecord?.meta.id ?? turnResult?.sessionId ?? sessions[0]?.id ?? mockSessions[0]?.id ?? null;
  const showDemoAttachments = isDemoSession(activeSessionId);
  const isSessionReady = Boolean(sessionRecord || turnResult || streamingBlocks.length > 0 || !hasActspaceBridge());
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
        setMockSessionRecords((current) => {
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
        setMockSessionRecords((current) => {
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

  const handleReviewChanged = useCallback(() => {
    void refreshReviewSummary();
  }, [refreshReviewSummary]);

  return (
    <RightPanelProvider>
      <WorkbenchLayout
        sessions={sessions.length > 0 ? sessions : mockSessions}
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
        showDemoAttachments={showDemoAttachments}
        defaultModelId={defaultModelId}
        onSettingsChange={handleSettingsChange}
        onArchivedSessionsChange={handleArchivedSessionsChange}
        workspaces={workspaceRegistry?.items}
        workspaceOptions={workspaceOptions}
        selectedWorkspaceRoot={selectedWorkspaceRoot}
        onSelectWorkspace={setSelectedWorkspaceRoot}
        reviewSummary={reviewSummary}
        onReviewChanged={handleReviewChanged}
      />
      <ShutdownOverlay />
    </RightPanelProvider>
  );
}
