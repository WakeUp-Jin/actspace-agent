import { createEmptyStreamingState, type ToolEntry, type StreamingState, type StreamingSegment, type SessionRunState } from "./session/session-run-state";
import { SessionBrowseContext } from "./session/SessionBrowseContext";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_QUICK_OPEN_ACCELERATOR,
  DEFAULT_MODEL_ID,
  createMessageBlocks,
  formatSessionTranscript,
  getLatestContextSnapshot,
} from "@actspace/shared";
import type {
  AbortAgentRunInput,
  AgentRunResult,
  AppSettings,
  BashBackgroundStatus,
  BashStatus,
  BootstrapState,
  CompactContextInput,
  ComposerAttachment,
  ComposerMode,
  ContextState,
  ContextUsageSnapshot,
  MessageBlock,
  ModelSelectionId,
  ModelId,
  ModelKey,
  UsableModelView,
  ReviewGetSnapshotResult,
  RunAgentInput,
  RuntimeStreamEvent,
  SessionRunLocation,
  SessionListItem,
  SessionRecord,
  ToolUiPreview,
  WorkspaceEntry,
  WorkspaceGitContext,
  WorkspaceListResult,
} from "@actspace/shared";
import { WorkbenchLayout } from "./components/WorkbenchLayout";
import { RightPanelProvider } from "./components/right-panel/RightPanelContext";
import { SessionProjectionProvider } from "./session";
import { ShutdownOverlay } from "./components/ShutdownOverlay";
import { resolvePreferredChatModel } from "./model-selection";
import type { ComposerDraftRestore, ComposerExecutionContext, ComposerReviewSummary, ComposerSendOptions, ComposerWorkspaceOption } from "./components/Composer";
import type { NewSessionInput, SessionUiStatusKind } from "./components/Sidebar";
import { resolveQuickOpenTarget } from "./quick-open-routing";

const DEFAULT_WORKSPACE_LABEL = "默认工作区";
const DEFAULT_COMPOSER_STATE: { mode: ComposerMode; selectedSkills: string[] } = {
  mode: "agent",
  selectedSkills: [],
};

function hasActspaceBridge(): boolean {
  return typeof window !== "undefined" && Boolean(window.actspace);
}

function attachmentForRuntime(attachment: ComposerAttachment): ComposerAttachment {
  const { previewUrl: _previewUrl, ...runtimeAttachment } = attachment;
  return runtimeAttachment;
}

function getSessionTitle(sessionRecord: SessionRecord | null, sessions: SessionListItem[], sessionId: string | null): string {
  const selected = sessionId === null ? null : sessions.find((session) => session.id === sessionId);
  const rawTitle = sessionRecord?.meta.title ?? selected?.title ?? "新建会话";
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
  return items.filter((workspace) => !workspace.hidden).map((workspace) => ({
    value: workspace.path,
    label: workspace.label,
    workspaceId: workspace.id,
  }));
}

function reviewResultToSummary(result: ReviewGetSnapshotResult): ComposerReviewSummary {
  if (result.ok === false) {
    return {
      status: result.code === "not_a_repository" ? "notAvailable" : "failed",
      reason: result.code,
    };
  }
  return {
    status: result.snapshot.status === "ready" ? "changes" : result.snapshot.status,
    additions: result.snapshot.totals.additions,
    deletions: result.snapshot.totals.deletions,
  };
}

function hasFinishedAllActiveTools(state: StreamingState): boolean {
  return state.activeTools.size > 0 && [...state.activeTools.values()].every(
    (tool) => tool.finished && !tool.approvalPending,
  );
}

function isEmptyTodoPreview(preview: Extract<ToolUiPreview, { kind: "todo" }>): boolean {
  return preview.todos.length === 0 && preview.totalCount === 0 && preview.completedCount === 0 && preview.revision === 0;
}

function upsertStreamingTool(
  state: StreamingState,
  toolCallId: string,
  toolName: string,
  preview: ToolUiPreview | undefined,
): void {
  const existing = state.activeTools.get(toolCallId);
  if (existing) {
    if (existing.terminalStatus) return;
    if (!(preview?.kind === "todo" && isEmptyTodoPreview(preview) && existing.preview?.kind === "todo")) {
      existing.preview = preview ?? existing.preview;
    }
    existing.toolName = toolName;
    return;
  }

  let effectivePreview = preview;
  if (preview?.kind === "todo") {
    const previous = [...state.activeTools.entries()].find(([, tool]) => tool.preview?.kind === "todo");
    if (previous) {
      if (isEmptyTodoPreview(preview) && previous[1].preview?.kind === "todo") {
        effectivePreview = previous[1].preview;
      }
      state.activeTools.delete(previous[0]);
      const segment = state.segments.find(
        (candidate): candidate is Extract<StreamingSegment, { type: "tool" }> =>
          candidate.type === "tool" && candidate.toolCallId === previous[0],
      );
      if (segment) segment.toolCallId = toolCallId;
    }
  }

  state.activeTools.set(toolCallId, { toolName, preview: effectivePreview });
  if (!state.segments.some((segment) => segment.type === "tool" && segment.toolCallId === toolCallId)) {
    state.segments.push({ type: "tool", toolCallId });
  }
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
      schemaVersion: 2,
      id,
      title: "New chat",
      createdAt: now,
      updatedAt: now,
      agentRunCount: 0,
      workspaceRoot: input.workspaceRoot,
    },
    events: [],
    messageBlocks: [],
    contextSnapshot: null,
  };
}

function rewriteLocalSessionId<T>(value: T, sourceSessionId: string, targetSessionId: string, key?: string): T {
  if (Array.isArray(value)) {
    return value.map((item) => rewriteLocalSessionId(item, sourceSessionId, targetSessionId)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        rewriteLocalSessionId(entryValue, sourceSessionId, targetSessionId, entryKey),
      ]),
    ) as T;
  }
  if (key === "sessionId" && value === sourceSessionId) {
    return targetSessionId as T;
  }
  return value;
}

function createLocalForkSession(source: SessionRecord): SessionRecord {
  const now = new Date().toISOString();
  const targetSessionId = `local-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const fork = rewriteLocalSessionId(source, source.meta.id, targetSessionId);
  return {
    ...fork,
    meta: {
      ...fork.meta,
      id: targetSessionId,
      title: `${source.meta.title} (fork)`,
      createdAt: now,
      updatedAt: now,
      pinned: false,
      archived: false,
    },
  };
}

function copyWithSelection(value: string): void {
  const textArea = document.createElement("textarea");
  textArea.value = value;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  document.execCommand("copy");
  textArea.remove();
}

async function copyTextToClipboard(value: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      copyWithSelection(value);
    }
  } catch {
    copyWithSelection(value);
  }
}

function getStreamingBashStatus(tool: {
  isError?: boolean;
  finished?: boolean;
  approvalPending?: boolean;
}, previewStatus?: BashStatus): BashStatus {
  if (tool.approvalPending) {
    return "pending";
  }
  if (!tool.finished) {
    return "running";
  }

  if (previewStatus === "denied" || previewStatus === "expired" || previewStatus === "cancelled") {
    return previewStatus;
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

function toolEntryToBlock(toolCallId: string, tool: ToolEntry, now: string, agentRunId?: string): MessageBlock {
  const blockId = agentRunId ? `turn:${agentRunId}:tool:${toolCallId}` : `streaming-tool-${toolCallId}`;

  if (tool.preview?.kind === "bash") {
    return {
      kind: "bash",
      id: blockId,
      status: getStreamingBashStatus(tool, tool.preview.status),
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
      sandboxed: tool.preview.sandboxed,
      notExecuted: tool.preview.notExecuted,
      createdAt: now,
    };
  }

  if (tool.preview?.kind === "read") {
    return {
      kind: "read",
      id: blockId,
      filePath: tool.preview.filePath,
      range: tool.preview.range,
      displayText: tool.finished ? tool.preview.displayText : getStreamingReadText(tool.preview),
      resultPreview: tool.finished ? tool.preview.resultPreview : undefined,
      createdAt: now,
      status: tool.finished ? tool.terminalStatus ?? (tool.isError ? "failed" : "completed") : "running",
    };
  }

  if (tool.preview?.kind === "search") {
    return {
      kind: "search",
      id: blockId,
      query: tool.preview.query,
      scope: tool.preview.scope,
      resultCount: tool.finished ? tool.preview.resultCount : undefined,
      displayText: tool.finished ? tool.preview.displayText : getStreamingSearchText(tool.preview),
      resultPreview: tool.finished ? tool.preview.resultPreview : undefined,
      createdAt: now,
      status: tool.finished ? tool.terminalStatus ?? (tool.isError ? "failed" : "completed") : "running",
    };
  }

  if (tool.preview?.kind === "grep") {
    return {
      kind: "grep",
      id: blockId,
      pattern: tool.preview.pattern,
      scope: tool.preview.scope,
      resultCount: tool.finished ? tool.preview.resultCount : undefined,
      displayText: tool.finished ? tool.preview.displayText : getStreamingGrepText(tool.preview),
      resultPreview: tool.finished ? tool.preview.resultPreview : undefined,
      createdAt: now,
      status: tool.finished ? tool.terminalStatus ?? (tool.isError ? "failed" : "completed") : "running",
    };
  }

  if (tool.preview?.kind === "glob") {
    return {
      kind: "glob",
      id: blockId,
      pattern: tool.preview.pattern,
      scope: tool.preview.scope,
      resultCount: tool.finished ? tool.preview.resultCount : undefined,
      displayText: tool.finished ? tool.preview.displayText : getStreamingGlobText(tool.preview),
      resultPreview: tool.finished ? tool.preview.resultPreview : undefined,
      createdAt: now,
      status: tool.finished ? tool.terminalStatus ?? (tool.isError ? "failed" : "completed") : "running",
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
      status: tool.finished ? tool.terminalStatus ?? (tool.isError ? "failed" : "completed") : "running",
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
      status: tool.finished ? tool.terminalStatus ?? (tool.isError ? "failed" : "completed") : "running",
      isError: tool.isError,
    };
  }

  if (tool.preview?.kind === "image_generation") {
    return {
      kind: "image_generation",
      id: blockId,
      status: tool.finished
        ? tool.isError ? "failed" : tool.preview.status
        : "running",
      promptPreview: tool.preview.promptPreview,
      requestedCount: tool.preview.requestedCount,
      generatedCount: tool.finished ? tool.preview.generatedCount : undefined,
      model: tool.preview.model,
      size: tool.preview.size,
      displayText: tool.preview.displayText,
      images: tool.finished ? tool.preview.images : undefined,
      warning: tool.preview.warning,
      errorMessage: tool.isError ? tool.preview.errorMessage : undefined,
      createdAt: now,
    };
  }

  if (tool.preview?.kind === "directory_list") {
    return {
      kind: "directory_list",
      id: blockId,
      path: tool.preview.path,
      entryCount: tool.finished ? tool.preview.entryCount : undefined,
      displayText: tool.finished ? tool.preview.displayText : getStreamingDirectoryText(tool.preview, tool.finished),
      createdAt: now,
      status: tool.finished ? tool.terminalStatus ?? (tool.isError ? "failed" : "completed") : "running",
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
      ...(tool.preview.outputPath ? { outputPath: tool.preview.outputPath } : {}),
      ...(tool.preview.outputRelativePath ? { outputRelativePath: tool.preview.outputRelativePath } : {}),
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
      ...(tool.preview.outputPath ? { outputPath: tool.preview.outputPath } : {}),
      ...(tool.preview.outputRelativePath ? { outputRelativePath: tool.preview.outputRelativePath } : {}),
      additions: tool.preview.additions,
      deletions: tool.preview.deletions,
      diff: tool.preview.diff,
      collapsedLines: tool.preview.collapsedLines,
      generationProgress: tool.preview.generationProgress,
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
      ...(tool.preview.outputPath ? { outputPath: tool.preview.outputPath } : {}),
      ...(tool.preview.outputRelativePath ? { outputRelativePath: tool.preview.outputRelativePath } : {}),
      additions: tool.preview.additions,
      deletions: tool.preview.deletions,
      diff: tool.preview.diff,
      collapsedLines: tool.preview.collapsedLines,
      generationProgress: tool.preview.generationProgress,
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
      agentKind: tool.preview.agentKind,
      displayText: tool.preview.displayText,
      summary: tool.preview.summary,
      recentEvents: tool.preview.recentEvents,
      transcriptRef: tool.preview.transcriptRef,
      stats: tool.preview.stats,
      error: tool.preview.error,
      // 流式首帧也必须沿用统一的右侧 child Session 入口，不能回退到旧 inline transcript。
      display: tool.preview.display ?? "panel",
      transcriptEvents: tool.transcriptEvents,
      createdAt: now,
    };
  }

  if (tool.preview?.kind === "todo") {
    return {
      kind: "todo",
      id: agentRunId ? `turn:${agentRunId}:todo` : `streaming-todo-${toolCallId}`,
      todos: tool.preview.todos,
      totalCount: tool.preview.totalCount,
      completedCount: tool.preview.completedCount,
      revision: tool.preview.revision,
      displayText: tool.preview.displayText,
      status: tool.finished ? tool.isError ? "failed" : "completed" : "running",
      isError: tool.isError,
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

function streamingStateToBlocks(state: StreamingState, agentRunId?: string): MessageBlock[] {
  const now = new Date().toISOString();
  const blocks: MessageBlock[] = [];
  let thinkingIdx = 0;
  let textIdx = 0;

  for (const [segmentIndex, seg] of state.segments.entries()) {
    if (seg.type === "thinking") {
      const index = thinkingIdx++;
      blocks.push({
        kind: "thinking",
        id: agentRunId ? `turn:${agentRunId}:thinking:${index}` : `streaming-thinking-${index}`,
        title: "Thinking...",
        content: seg.text,
        createdAt: now,
        collapsedByDefault: false,
        status: segmentIndex === state.segments.length - 1 ? "running" : "completed",
      });
    } else if (seg.type === "text") {
      const index = textIdx++;
      blocks.push({
        kind: "assistant",
        id: agentRunId ? `turn:${agentRunId}:assistant:${index}` : `streaming-assistant-${index}`,
        content: seg.text,
        createdAt: now,
      });
    } else if (seg.type === "tool") {
      const tool = state.activeTools.get(seg.toolCallId);
      if (tool) {
        blocks.push(toolEntryToBlock(seg.toolCallId, tool, now, agentRunId));
      }
    } else if (seg.type === "compaction") {
      const block = state.activeCompactions.get(seg.agentRunId);
      if (block) {
        blocks.push(block);
      }
    } else if (seg.type === "workspace_preparation") {
      const block = state.activeWorkspacePreparations.get(seg.agentRunId);
      if (block) blocks.push(block);
    }
  }

  if (state.retryNotice) {
    blocks.push({
      kind: "status",
      id: agentRunId
        ? `turn:${agentRunId}:retry:${state.retryNotice.attempt}`
        : `llm-retry-${state.retryNotice.attempt}`,
      content: `网关异常，正在重试 (${state.retryNotice.attempt}/${state.retryNotice.maxAttempts})`,
      createdAt: now,
      tone: "muted",
    });
  }

  if (state.waitingForModel && !state.retryNotice) {
    blocks.push({
      kind: "status",
      id: agentRunId ? `turn:${agentRunId}:model-wait` : "model-wait",
      content: "Operating Space · Expanding",
      createdAt: now,
      tone: "muted",
    });
  }

  return blocks;
}

function createCompactionBlock(input: {
  agentRunId: string;
  status: Extract<MessageBlock, { kind: "context_compaction" }>["status"];
  trigger?: "manual" | "auto";
  stage?: string;
  progress?: number;
  summaryText?: string;
}): Extract<MessageBlock, { kind: "context_compaction" }> {
  return {
    kind: "context_compaction",
    id: `turn:${input.agentRunId}:context-compaction:0`,
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

function upsertCompactionSegment(state: StreamingState, agentRunId: string): void {
  if (!state.segments.some((segment) => segment.type === "compaction" && segment.agentRunId === agentRunId)) {
    state.segments.push({ type: "compaction", agentRunId });
  }
}

function upsertWorkspacePreparationSegment(state: StreamingState, agentRunId: string): void {
  if (!state.segments.some((segment) => segment.type === "workspace_preparation" && segment.agentRunId === agentRunId)) {
    state.segments.push({ type: "workspace_preparation", agentRunId });
  }
}

let agentRunCounter = 0;
function nextAgentRunId(): string {
  return `agent-run-${Date.now()}-${++agentRunCounter}`;
}

function modelSelectionPayload(model: ModelSelectionId): { model?: ModelId; modelKey?: ModelKey } {
  return model.includes(":") ? { modelKey: model as ModelKey } : { model: model as ModelId };
}

export function App() {
  const [bootstrapState, setBootstrapState] = useState<BootstrapState | null>(null);
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [sessionRecord, setSessionRecord] = useState<SessionRecord | null>(null);
  const [browseGroups, setBrowseGroups] = useState<import("@actspace/shared").SessionListPage['groups']>([]);
  const [listLoading, setListLoading] = useState(hasActspaceBridge());
  const [listError, setListError] = useState<string | null>(null);
  const [listRetry, setListRetry] = useState(0);
  const [messageLoading, setMessageLoading] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [historyBefore, setHistoryBefore] = useState<number | null>(null);
  const [earlierLoading, setEarlierLoading] = useState(false);
  const [earlierError, setEarlierError] = useState<string | null>(null);
  const loadedListPages = useRef(new Map<string, number>());
  const readSidebarSessions = useCallback(async () => {
    if (!window.actspace.listSessionPage) return window.actspace.listSessions();
    const first = await window.actspace.listSessionPage();
    const items = [...first.items];
    const groups = [...first.groups];
    for (const group of first.groups) {
      const key = JSON.stringify([group.workspaceRoot, group.pinned]);
      let hasMore = group.hasMore;
      for (let page = 1; page < (loadedListPages.current.get(key) ?? 1) && hasMore; page++) {
        const after = items.filter(s => (s.workspaceRoot ?? '') === group.workspaceRoot && !!s.pinned === group.pinned).at(-1)?.id;
        const next = await window.actspace.listSessionPage({ workspaceRoot: group.workspaceRoot, pinned: group.pinned, after });
        items.push(...next.items); hasMore = next.groups[0]?.hasMore ?? false;
      }
      group.hasMore = hasMore;
    }
    setBrowseGroups(groups);
    return [...new Map(items.map(s => [s.id, s])).values()];
  }, []);
  const pageCacheRef = useRef(new Map<string, import("@actspace/shared").SessionMessagePage>());
  const messageRequestRef = useRef(0);
  const historyPendingRef = useRef<number | null>(null);
  const [localSessionRecords, setLocalSessionRecords] = useState<Record<string, SessionRecord>>({});
  const [agentRunResult, setAgentRunResult] = useState<AgentRunResult | null>(null);
  const [workspaceRegistry, setWorkspaceRegistry] = useState<WorkspaceListResult | null>(null);
  const [sessionBootstrapComplete, setSessionBootstrapComplete] = useState(!hasActspaceBridge());
  const [isStreaming, setIsStreaming] = useState(false);
  const [isAborting, setIsAborting] = useState(false);
  const [activeAgentRunId, setActiveAgentRunId] = useState<string | null>(null);
  const [streamingBlocks, setStreamingBlocks] = useState<MessageBlock[]>([]);
  // 后台 bash 任务状态（taskId → 最新状态）；bash_task_update 事件驱动，覆写块显示
  const [bashTaskUpdates, setBashTaskUpdates] = useState<Record<string, { status: BashBackgroundStatus; exitCode?: number | null }>>({});
  const [sendScrollRequestId, setSendScrollRequestId] = useState(0);
  const [composerFocusRequestId, setComposerFocusRequestId] = useState(0);
  const [defaultModelId, setDefaultModelId] = useState<ModelSelectionId | undefined>(undefined);
  const [selectedChatModelId, setSelectedChatModelId] = useState<ModelSelectionId>(DEFAULT_MODEL_ID);
  const [composerStateBySession, setComposerStateBySession] = useState<
    Record<string, { mode: ComposerMode; selectedSkills: string[] }>
  >({});
  const [usableChatModels, setUsableChatModels] = useState<UsableModelView[] | undefined>(undefined);
  const [approvalPendingSessionIds, setApprovalPendingSessionIds] = useState<Set<string>>(() => new Set());
  const [failedSessionIds, setFailedSessionIds] = useState<Set<string>>(() => new Set());
  const [selectedWorkspaceRoot, setSelectedWorkspaceRoot] = useState<string | null>(null);
  const [workspaceGitContext, setWorkspaceGitContext] = useState<WorkspaceGitContext | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string | undefined>(undefined);
  const [runLocation, setRunLocation] = useState<SessionRunLocation>("this_mac");
  const [composerDraftRestore, setComposerDraftRestore] = useState<ComposerDraftRestore | null>(null);
  const [reviewSummary, setReviewSummary] = useState<ComposerReviewSummary | null>(null);
  const sessionRunsRef = useRef(new Map<string, SessionRunState>());
  const [busySessionIds, setBusySessionIds] = useState<Set<string>>(() => new Set());
  const pageVersionsRef = useRef(new Map<string, number>());
  const approvalVersionsRef = useRef(new Map<string, number>());
  const draftsRef = useRef(new Map<string, ComposerDraftRestore>());
  const bashUpdatesRef = useRef(new Map<string, Record<string, { status: BashBackgroundStatus; exitCode?: number | null }>>());
  const activeSessionIdRef = useRef<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const refreshStreamingBlocks = useCallback((sessionId: string | null) => {
    if (activeSessionIdRef.current !== sessionId) return;
    const run = sessionId ? sessionRunsRef.current.get(sessionId) : undefined;
    const blocks = run ? streamingStateToBlocks(run.state, run.agentRunId) : [];
    setStreamingBlocks(run?.userBlock ? [run.userBlock, ...blocks] : blocks);
    setIsStreaming(Boolean(run));
    setIsAborting(run?.aborting ?? false);
    setActiveAgentRunId(run?.agentRunId ?? null);
  }, []);
  const setActiveSessionId = useCallback((sessionId: string | null) => {
    ++messageRequestRef.current;
    historyPendingRef.current = null;
    setEarlierLoading(false);
    setEarlierError(null);
    setMessageLoading(false);
    setMessageError(null);
    activeSessionIdRef.current = sessionId;
    setSelectedSessionId(sessionId);
    setSessionRecord(null);
    setHistoryBefore(null);
    setBashTaskUpdates(sessionId ? bashUpdatesRef.current.get(sessionId) ?? {} : {});
    setComposerDraftRestore(sessionId ? draftsRef.current.get(sessionId) ?? null : null);
    refreshStreamingBlocks(sessionId);
  }, [refreshStreamingBlocks]);
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

  const setApprovalPendingForSession = useCallback((sessionId: string | null | undefined, pending: boolean) => {
    if (!sessionId) return;
    approvalVersionsRef.current.set(sessionId, (approvalVersionsRef.current.get(sessionId) ?? 0) + 1);
    setApprovalPendingSessionIds((current) => updateStringSet(current, sessionId, pending));
  }, []);

  const setFailedForSession = useCallback((sessionId: string | null | undefined, failed: boolean) => {
    if (!sessionId) return;
    setFailedSessionIds((current) => updateStringSet(current, sessionId, failed));
  }, []);

  const refreshReviewSummary = useCallback(async (workspaceRoot?: string | null) => {
    if (!hasActspaceBridge()) return;

    const api = window.actspace?.getReviewSnapshot;
    if (!api) {
      setReviewSummary(null);
      return;
    }

    const resolvedWorkspaceRoot = normalizeWorkspaceRoot(
      workspaceRoot ?? sessionRecord?.meta.worktree?.workspaceRoot ?? selectedWorkspaceRoot ?? sessionRecord?.meta.workspaceRoot ?? bootstrapState?.workspaceRoot,
    );
    const requestId = ++reviewRefreshRequestIdRef.current;
    setReviewSummary({ status: "loading" });

    try {
      const result = await api({
        workspaceRoot: resolvedWorkspaceRoot ?? undefined,
        sessionId: sessionRecord?.meta.id,
        selection: { kind: "uncommitted" },
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
  }, [bootstrapState?.workspaceRoot, selectedWorkspaceRoot, sessionRecord?.meta.workspaceRoot, sessionRecord?.meta.worktree?.workspaceRoot]);

  const refreshPendingApprovalStatuses = useCallback(async (sessionIds: string[]) => {
    if (!hasActspaceBridge() || !window.actspace.listPendingApprovals) return;

    const uniqueSessionIds = [...new Set(sessionIds.filter(Boolean))];
    if (uniqueSessionIds.length === 0) return;

    const results = await Promise.all(uniqueSessionIds.map(async (sessionId) => {
      const version = (approvalVersionsRef.current.get(sessionId) ?? 0) + 1;
      approvalVersionsRef.current.set(sessionId, version);
      try {
        const pending = await window.actspace.listPendingApprovals({ sessionId });
        return { sessionId, version, hasPending: pending.length > 0 };
      } catch (error) {
        console.error("Failed to load pending approvals", error);
        return { sessionId, version, hasPending: null };
      }
    }));

    setApprovalPendingSessionIds((current) => {
      let next = current;
      for (const result of results) {
        if (result.hasPending === null || approvalVersionsRef.current.get(result.sessionId) !== result.version) continue;
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
    if (selectedWorkspaceRoot) return;
    setSelectedWorkspaceRoot(normalizeWorkspaceRoot(
      sessionRecord?.meta.worktree?.sourceWorkspaceRoot ?? sessionRecord?.meta.workspaceRoot ?? bootstrapState?.workspaceRoot,
    ));
  }, [bootstrapState?.workspaceRoot, selectedWorkspaceRoot, sessionRecord?.meta.workspaceRoot]);

  useEffect(() => {
    const lockedWorktree = sessionRecord?.meta.worktree;
    if (lockedWorktree) {
      setRunLocation("worktree");
      setSelectedBranch(lockedWorktree.branch);
      setWorkspaceGitContext(null);
      return;
    }
    const workspaceRoot = selectedWorkspaceRoot ?? bootstrapState?.workspaceRoot;
    if (!hasActspaceBridge() || !workspaceRoot || !window.actspace.getWorkspaceGitContext) {
      setWorkspaceGitContext(null);
      setSelectedBranch(undefined);
      setRunLocation("this_mac");
      return;
    }
    let cancelled = false;
    window.actspace.getWorkspaceGitContext({ workspaceRoot }).then((context) => {
      if (cancelled) return;
      setWorkspaceGitContext(context);
      setSelectedBranch(
        context.status === "ready" || context.status === "no_head"
          ? context.currentBranch
          : undefined,
      );
      setRunLocation("this_mac");
    }).catch((error: unknown) => {
      if (cancelled) return;
      console.error("Failed to load workspace Git context", error);
      setWorkspaceGitContext(null);
      setSelectedBranch(undefined);
      setRunLocation("this_mac");
    });
    return () => {
      cancelled = true;
    };
  }, [bootstrapState?.workspaceRoot, selectedWorkspaceRoot, sessionRecord?.meta.id, sessionRecord?.meta.agentRunCount, sessionRecord?.meta.worktree]);

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
    if (!hasActspaceBridge() || !window.actspace.onReviewChanged) return;
    return window.actspace.onReviewChanged(() => {
      void refreshReviewSummary();
    });
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
    if (!hasActspaceBridge() || !window.actspace.onSessionLiveEvent) return;
    let disposed = false;
    const unsubscribe = window.actspace.onSessionLiveEvent(({ event }) => {
      if (event.kind !== "runtime-live" || event.message !== "session-title-updated" || !event.sessionId) return;
      const sessionId = event.sessionId;
      void window.actspace.listSessions().then(items => {
        const item = items.find(s => s.id === sessionId);
        const record = item ? { meta: { title: item.title } } : null;
        if (disposed || !record) return;
        setSessions(current => current.map(item => item.id === sessionId ? { ...item, title: record.meta.title } : item));
        setSessionRecord(current => current?.meta.id === sessionId ? { ...current, meta: { ...current.meta, title: record.meta.title } } : current);
      }).catch(error => console.error("Failed to refresh session title", error));
    });
    return () => { disposed = true; unsubscribe(); };
  }, []);

  const cacheSessionPage = useCallback((sessionId: string, page: import("@actspace/shared").SessionMessagePage) => {
    pageCacheRef.current.delete(sessionId);
    pageCacheRef.current.set(sessionId, page);
    while (pageCacheRef.current.size > 3) pageCacheRef.current.delete(pageCacheRef.current.keys().next().value!);
    const run = sessionRunsRef.current.get(sessionId);
    if (run) { run.record = page.record; run.historyBefore = page.history.before; }
  }, []);

  const readSessionPage = useCallback(async (sessionId: string, restoreCache = false) => {
    const version = (pageVersionsRef.current.get(sessionId) ?? 0) + 1;
    pageVersionsRef.current.set(sessionId, version);
    const visible = () => activeSessionIdRef.current === sessionId;
    const request = visible() ? ++messageRequestRef.current : messageRequestRef.current;
    const run = sessionRunsRef.current.get(sessionId);
    const cached = restoreCache ? pageCacheRef.current.get(sessionId) : undefined;
    const cachedRecord = cached?.record ?? (restoreCache ? run?.record : null);
    if (visible()) {
      historyPendingRef.current = null;
      setEarlierLoading(false);
      if (cachedRecord) {
        setSessionRecord(cachedRecord);
        setHistoryBefore(cached ? cached.history.before : run?.historyBefore ?? null);
      }
      setMessageLoading(!cachedRecord && !run?.record); setMessageError(null); setEarlierError(null);
    }
    try {
      const page = window.actspace.getSessionPage
        ? await window.actspace.getSessionPage({ sessionId })
        : { record: await window.actspace.getSession({ sessionId }), history: { before: null, throughJournalSeq: -1 } };
      if (version !== pageVersionsRef.current.get(sessionId)) return null;
      if (!page.record) throw new Error('会话读取失败，请重试');
      cacheSessionPage(sessionId, { record: page.record, history: page.history });
      if (visible() && request === messageRequestRef.current) {
        setSessionRecord(current => {
          if (!current || current.meta.id !== sessionId || !window.actspace.getSessionPage) return page.record;
          const oldest = Math.min(...page.record!.events.map(e => Number(/^v2-(\d+)/.exec(e.id)?.[1] ?? Infinity)));
          const earlier = current.events.filter(e => Number(/^v2-(\d+)/.exec(e.id)?.[1] ?? Infinity) < oldest);
          const events = [...earlier, ...page.record!.events];
          const deferred = new Map([...(current.messageBlocks ?? []), ...(page.record!.messageBlocks ?? [])].filter(b => b.deferredToolDetail).map(b => [b.id, b.deferredToolDetail]));
          return { ...page.record!, events, messageBlocks: createMessageBlocks(events).map(b => deferred.has(b.id) ? { ...b, deferredToolDetail: deferred.get(b.id) } : b) };
        });
        setHistoryBefore(current => current === null ? page.history.before : page.history.before === null ? null : Math.min(current, page.history.before));
      }
      return page.record;
    } catch (error) {
      if (version === pageVersionsRef.current.get(sessionId) && visible() && request === messageRequestRef.current) setMessageError(error instanceof Error ? error.message : '消息加载失败');
      return null;
    } finally {
      if (version === pageVersionsRef.current.get(sessionId) && visible() && request === messageRequestRef.current) setMessageLoading(false);
    }
  }, [cacheSessionPage]);

  const loadEarlierMessages = useCallback(async () => {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId || historyBefore === null || !window.actspace?.getSessionPage || historyPendingRef.current !== null) return;
    const request = messageRequestRef.current;
    historyPendingRef.current = request; setEarlierLoading(true); setEarlierError(null);
    try {
      const page = await window.actspace.getSessionPage({ sessionId, before: historyBefore });
      if (request !== messageRequestRef.current || activeSessionIdRef.current !== sessionId) return;
      setSessionRecord(current => {
        if (!current || current.meta.id !== sessionId) return current;
        const ids = new Set(current.events.map(e => e.id));
        const events = [...page.record.events.filter(e => !ids.has(e.id)), ...current.events];
        const deferred = new Map([...(page.record.messageBlocks ?? []), ...(current.messageBlocks ?? [])].filter(b => b.deferredToolDetail).map(b => [b.id, b.deferredToolDetail]));
        return { ...current, events, messageBlocks: createMessageBlocks(events).map(b => deferred.has(b.id) ? { ...b, deferredToolDetail: deferred.get(b.id) } : b) };
      });
      setHistoryBefore(page.history.before);
    } catch (error) { if (request === messageRequestRef.current) setEarlierError(error instanceof Error ? error.message : '历史消息加载失败'); }
    finally { if (historyPendingRef.current === request) { historyPendingRef.current = null; setEarlierLoading(false); } }
  }, [historyBefore]);

  const loadMoreSessions = useCallback(async (input: import("@actspace/shared").SessionListPageInput) => {
    if (!window.actspace?.listSessionPage) return;
    const page = await window.actspace.listSessionPage(input);
    const key = JSON.stringify([input.workspaceRoot ?? "", input.pinned === true]);
    loadedListPages.current.set(key, (loadedListPages.current.get(key) ?? 1) + 1);
    setSessions(current => { const byId = new Map(current.map(s => [s.id, s])); for (const s of page.items) byId.set(s.id, s); return [...byId.values()]; });
    setBrowseGroups(current => [...current.filter(g => !page.groups.some(n => n.workspaceRoot === g.workspaceRoot && n.pinned === g.pinned)), ...page.groups]);
  }, []);

  useEffect(() => {
    if (!hasActspaceBridge()) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function bootstrapSession() {
      setListLoading(true); setListError(null);
      const [page, registry] = await Promise.all([
        window.actspace.listSessionPage ? window.actspace.listSessionPage() : readSidebarSessions().then(items => ({ items, groups: [], indexing: false, failed: 0 })),
        window.actspace.listWorkspaces?.() ?? Promise.resolve(null),
      ]);
      if (disposed) return;
      const listedSessions = page.items;
      setSessions(current => page.indexing ? [...new Map([...current, ...listedSessions].map(s => [s.id, s])).values()] : listedSessions);
      setBrowseGroups(page.groups);
      setListLoading(page.indexing);
      if (page.failed) setListError(`${page.failed} 个会话暂时无法读取，可重试`);
      if (registry) setWorkspaceRegistry(registry);
      if (page.indexing) {
        timer = setTimeout(() => { void bootstrapSession().catch(handleBootstrapError); }, 500);
      }
      if (activeSessionIdRef.current) { setSessionBootstrapComplete(true); return; }
      if (page.indexing) return;

      const hiddenWorkspaceIds = new Set(registry?.items.filter((workspace) => workspace.hidden).map((workspace) => workspace.id));
      const hiddenWorkspacePaths = new Set(registry?.items.filter((workspace) => workspace.hidden).map((workspace) => workspace.path));
      const existing = listedSessions.find((session) =>
        !hiddenWorkspaceIds.has(session.workspaceId ?? "") &&
        !hiddenWorkspacePaths.has(normalizeWorkspaceRoot(session.workspaceRoot) ?? ""),
      );
      if (existing) {
        setActiveSessionId(existing.id);
        const restored = await readSessionPage(existing.id, true);
        if (disposed || activeSessionIdRef.current !== existing.id) return;
        if (!restored) return;
        setSelectedWorkspaceRoot(
          normalizeWorkspaceRoot(
            restored?.meta.worktree?.sourceWorkspaceRoot ??
            restored?.meta.workspaceRoot ??
            existing.worktree?.sourceWorkspaceRoot ??
            existing.workspaceRoot ??
            bootstrapState?.workspaceRoot,
          ),
        );
        setSessionBootstrapComplete(true);
        return;
      }

      setActiveSessionId(null);
      setSessionRecord(null);
      setAgentRunResult(null);
      setSelectedWorkspaceRoot(normalizeWorkspaceRoot(
        registry?.items.find((workspace) => workspace.id === registry.defaultWorkspaceId)?.path ??
        bootstrapState?.workspaceRoot,
      ));
      setSessionBootstrapComplete(true);
    }

    function handleBootstrapError(error: unknown) {
      if (disposed) return;
      setListLoading(false); setListError(error instanceof Error ? error.message : '会话列表加载失败');
      setSessionBootstrapComplete(true);
    }
    void bootstrapSession().catch(handleBootstrapError);
    return () => { disposed = true; if (timer) clearTimeout(timer); };
  }, [listRetry, readSessionPage]);

  const handleStreamEvent = useCallback((event: Exclude<RuntimeStreamEvent, { type: "bash_task_update" }>) => {
    const run = sessionRunsRef.current.get(event.sessionId);
    if (!run || run.agentRunId !== event.agentRunId) return;
    const state = run.state;

    switch (event.type) {
      case "agent_run_started":
        state.waitingForModel = true;
        break;

      case "workspace_preparation_started":
        state.waitingForModel = false;
        upsertWorkspacePreparationSegment(state, event.agentRunId);
        state.activeWorkspacePreparations.set(event.agentRunId, {
          kind: "workspace_preparation",
          id: `turn:${event.agentRunId}:workspace-preparation:0`,
          status: "running",
          sourceWorkspaceRoot: event.sourceWorkspaceRoot,
          baseBranch: event.baseBranch,
          createdAt: new Date().toISOString(),
        });
        break;

      case "workspace_preparation_finished":
        upsertWorkspacePreparationSegment(state, event.agentRunId);
        state.activeWorkspacePreparations.set(event.agentRunId, {
          kind: "workspace_preparation",
          id: `turn:${event.agentRunId}:workspace-preparation:0`,
          status: "completed",
          sourceWorkspaceRoot: event.payload.sourceWorkspaceRoot,
          workspaceRoot: event.payload.workspaceRoot,
          baseBranch: event.payload.baseBranch,
          branch: event.payload.branch,
          baseCommit: event.payload.baseCommit,
          durationMs: event.payload.durationMs,
          environmentSetup: event.payload.environmentSetup,
          createdAt: new Date().toISOString(),
        });
        state.waitingForModel = true;
        break;

      case "context_compaction_started":
        state.waitingForModel = false;
        upsertCompactionSegment(state, event.agentRunId);
        state.activeCompactions.set(event.agentRunId, createCompactionBlock({
          agentRunId: event.agentRunId,
          status: "running",
          trigger: event.trigger,
          stage: event.stage,
          progress: event.progress,
          summaryText: "Compacting context",
        }));
        break;

      case "context_compaction_progress": {
        state.waitingForModel = false;
        upsertCompactionSegment(state, event.agentRunId);
        const existing = state.activeCompactions.get(event.agentRunId);
        state.activeCompactions.set(event.agentRunId, {
          ...(existing ?? createCompactionBlock({
            agentRunId: event.agentRunId,
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
        upsertCompactionSegment(state, event.agentRunId);
        const removedCount = event.payload.removedCount ?? Math.max(event.payload.beforeCount - event.payload.afterCount, 0);
        state.activeCompactions.set(event.agentRunId, createCompactionBlock({
          agentRunId: event.agentRunId,
          status: event.status === "compacted" ? "completed" : "skipped",
          trigger: event.trigger,
          stage: event.stage,
          progress: event.progress,
          summaryText: event.status === "skipped"
            ? (event.summary ?? "Nothing to compact")
            : formatContextCompactionSummary(removedCount),
        }));
        state.waitingForModel = event.trigger === "auto";
        break;
      }

      case "context_compaction_failed":
        state.waitingForModel = false;
        upsertCompactionSegment(state, event.agentRunId);
        state.activeCompactions.set(event.agentRunId, createCompactionBlock({
          agentRunId: event.agentRunId,
          status: "failed",
          trigger: event.trigger,
          stage: event.stage,
          summaryText: event.error.message,
        }));
        break;

      case "assistant_thinking_delta":
        state.retryNotice = undefined;
        if (event.delta.length > 0) {
          state.waitingForModel = false;
        }
        appendOrMergeSegment(state.segments, "thinking", event.delta);
        break;

      case "assistant_text_delta":
        state.retryNotice = undefined;
        if (event.delta.length > 0) {
          state.waitingForModel = false;
        }
        appendOrMergeSegment(state.segments, "text", event.delta);
        break;

      case "llm_retry":
        dropTrailingStreamSegments(state.segments);
        state.waitingForModel = false;
        state.retryNotice = { attempt: event.attempt, maxAttempts: event.maxAttempts };
        break;

      case "tool_call_streaming": {
        state.waitingForModel = false;
        upsertStreamingTool(state, event.toolCallId, event.toolName, event.preview);
        break;
      }

      case "tool_started": {
        state.waitingForModel = false;
        upsertStreamingTool(state, event.toolCallId, event.toolName, event.preview);
        break;
      }

      case "tool_finished": {
        if (state.activeTools.get(event.toolCallId)?.terminalStatus) break;
        upsertStreamingTool(state, event.toolCallId, event.toolName, event.preview);
        const tool = state.activeTools.get(event.toolCallId);
        if (tool) {
          if (event.preview) {
            tool.preview = event.preview;
          }
          tool.finished = true;
          tool.terminalStatus = event.status ?? (event.isError ? "failed" : "completed");
          tool.approvalPending = false;
          tool.approvalRequestId = undefined;
          tool.isError = event.isError;
        }
        state.waitingForModel = hasFinishedAllActiveTools(state);
        break;
      }

      case "subagent_event": {
        state.waitingForModel = false;
        const existing = state.activeTools.get(event.toolCallId);
        if (existing?.terminalStatus) break;
        if (existing) {
          existing.preview = event.preview;
          existing.transcriptEvents = [...(existing.transcriptEvents ?? []), event.event];
        } else {
          state.activeTools.set(event.toolCallId, {
            toolName: "agent",
            preview: event.preview,
            transcriptEvents: [event.event],
          });
          state.segments.push({ type: "tool", toolCallId: event.toolCallId });
        }
        break;
      }

      case "tool_approval_required": {
        state.waitingForModel = false;
        const tool = state.activeTools.get(event.toolCallId);
        if (tool && !tool.terminalStatus) {
          tool.approvalPending = true;
          tool.approvalRequestId = event.requestId;
          tool.approvalReason = event.reason;
          tool.approvalSummary = event.summary;
          tool.approvalScope = event.approvalScope;
          if (tool.preview?.kind === "bash") {
            tool.preview = {
              ...tool.preview,
              command: event.command ?? tool.preview.command,
              sandboxed: event.executionEnvironment === undefined
                ? tool.preview.sandboxed
                : event.executionEnvironment === "sandbox",
              notExecuted: undefined,
            };
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
        if (tool && !tool.terminalStatus) {
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
          if (tool.preview?.kind === "bash" && event.decision === "deny") {
            tool.finished = true;
            tool.isError = true;
            tool.preview = {
              ...tool.preview,
              status: "denied",
              title: "Bash command denied",
              sandboxed: undefined,
              notExecuted: true,
            };
          }
        }
        state.waitingForModel = hasFinishedAllActiveTools(state);
        break;
      }

      case "agent_run_finished":
      case "agent_run_aborted":
      case "agent_run_failed":
        state.waitingForModel = false;
        for (const tool of state.activeTools.values()) {
          if (tool.terminalStatus) continue;
          tool.finished = true;
          tool.isError = true;
          tool.terminalStatus = event.type === "agent_run_aborted" ? "aborted" : "failed";
          tool.approvalPending = false;
          tool.approvalRequestId = undefined;
          if (tool.preview?.kind === "write" || tool.preview?.kind === "edit_diff" || tool.preview?.kind === "delete") {
            tool.preview = { ...tool.preview, status: "failed" };
          } else if (tool.preview?.kind === "agent") {
            tool.preview = { ...tool.preview, status: tool.terminalStatus === "aborted" ? "aborted" : "failed" };
          }
        }
        break;
    }

    refreshStreamingBlocks(event.sessionId);
  }, [refreshStreamingBlocks]);

  useEffect(() => {
    if (!hasActspaceBridge()) return;

    return window.actspace.onAgentStream((event) => {
      const run = sessionRunsRef.current.get(event.sessionId);
      if (event.type !== "bash_task_update" && run && run.agentRunId !== event.agentRunId) return;
      if ((event.type === "tool_approval_required" || event.type === "tool_approval_resolved") &&
        run?.agentRunId === event.agentRunId && run.state.activeTools.get(event.toolCallId)?.terminalStatus) return;
      if (event.type === "tool_approval_required") {
        setApprovalPendingForSession(event.sessionId, true);
      } else if (
        event.type === "tool_approval_resolved" ||
        event.type === "agent_run_aborted" ||
        event.type === "agent_run_finished" ||
        event.type === "agent_run_failed"
      ) {
        refreshPendingApprovalStatuses([event.sessionId]).catch((error: unknown) => {
          console.error("Failed to refresh stream approval status", error);
        });
      }

      if (event.type === "agent_run_finished" || event.type === "agent_run_aborted") {
        setFailedForSession(event.sessionId, false);
      } else if (event.type === "agent_run_failed") {
        setFailedForSession(event.sessionId, true);
      }

      if (event.type === "bash_task_update") {
        const updates = { ...bashUpdatesRef.current.get(event.sessionId), [event.taskId]: { status: event.status, exitCode: event.exitCode } };
        bashUpdatesRef.current.set(event.sessionId, updates);
        if (event.sessionId === activeSessionIdRef.current) setBashTaskUpdates(updates);
        return;
      }

      handleStreamEvent(event);
    });
  }, [handleStreamEvent, refreshPendingApprovalStatuses, setApprovalPendingForSession, setFailedForSession]);

  const createSessionForInput = useCallback(async (input: NewSessionInput = {}): Promise<SessionRecord | null> => {
    if (!hasActspaceBridge()) {
      const created = createLocalEmptySession(input);
      setActiveSessionId(created.meta.id);
      setSessionRecord(created);
      setSelectedWorkspaceRoot(normalizeWorkspaceRoot(created.meta.workspaceRoot ?? bootstrapState?.workspaceRoot));
      setLocalSessionRecords((current) => ({ ...current, [created.meta.id]: created }));
      setSessions((current) => [
        {
          id: created.meta.id,
          title: created.meta.title,
          updatedAt: created.meta.updatedAt,
          agentRunCount: created.meta.agentRunCount,
          workspaceRoot: created.meta.workspaceRoot,
        },
        ...current,
      ]);
      return created;
    }

    const selectionRequest = messageRequestRef.current;
    try {
      const created = await window.actspace.createSession({
        ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
        ...(input.workspaceRoot ? { workspaceRoot: input.workspaceRoot } : {}),
      });
      if (selectionRequest === messageRequestRef.current) {
        setActiveSessionId(created.meta.id);
        setSessionRecord(created);
        setSelectedWorkspaceRoot(normalizeWorkspaceRoot(created.meta.workspaceRoot ?? bootstrapState?.workspaceRoot));
      }
      const refreshed = await readSidebarSessions();
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
    const sessionId = createdSession?.meta.id ?? activeSessionIdRef.current;
    if (!sessionId || sessionRunsRef.current.has(sessionId)) return;
    setComposerStateBySession((current) => ({
      ...current,
      [sessionId]: { mode: options.mode, selectedSkills: options.selectedSkills },
    }));

    const agentRunId = nextAgentRunId();
    const trimmedText = text.trim();
    const isCompactCommand = trimmedText === "/compact";
    const nextWorkspaceRoot = selectedWorkspaceRoot;
    let nextWorkspace = findWorkspaceOption(nextWorkspaceRoot);
    const currentWorkspaceRoot = normalizeWorkspaceRoot(
      (createdSession ?? sessionRecord)?.meta.workspaceRoot ?? bootstrapState?.workspaceRoot,
    );
    const currentWorktree = (createdSession ?? sessionRecord)?.meta.worktree;
    const isFirstAgentRun = ((createdSession ?? sessionRecord)?.meta.agentRunCount ?? 0) === 0;

    if (
      hasActspaceBridge() &&
      !isFirstAgentRun &&
      !currentWorktree &&
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
        setSessionRecord((current) => current?.meta.id === sessionId
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

    if (sessionRunsRef.current.has(sessionId)) return;
    const run: SessionRunState = {
      sessionId, agentRunId, state: createEmptyStreamingState(), userBlock: null, aborting: false,
      record: createdSession ?? sessionRecord, historyBefore,
    };
    sessionRunsRef.current.set(sessionId, run);
    setBusySessionIds(current => updateStringSet(current, sessionId, true));
    draftsRef.current.delete(sessionId);
    if (activeSessionIdRef.current === sessionId) setComposerDraftRestore(null);
    setApprovalPendingForSession(sessionId, false);
    setFailedForSession(sessionId, false);

    if (isCompactCommand) {
      const pendingBlock = createCompactionBlock({ agentRunId, status: "pending", summaryText: "/compact" });
      upsertCompactionSegment(run.state, agentRunId);
      run.state.activeCompactions.set(agentRunId, pendingBlock);
    } else {
      run.userBlock = {
        kind: "user", id: `turn:${agentRunId}:user:0`, content: text,
        createdAt: new Date().toISOString(), attachments: options.attachments,
      };
      run.state.waitingForModel = true;
    }
    refreshStreamingBlocks(sessionId);
    if (activeSessionIdRef.current === sessionId) setSendScrollRequestId(value => value + 1);

    const isCurrentRun = () => sessionRunsRef.current.get(sessionId) === run;
    const isCurrentVisibleTurn = () => isCurrentRun() && activeSessionIdRef.current === sessionId;
    const finishRun = () => {
      if (!isCurrentRun()) return;
      sessionRunsRef.current.delete(sessionId);
      setBusySessionIds(current => updateStringSet(current, sessionId, false));
      refreshStreamingBlocks(sessionId);
      if (activeSessionIdRef.current === sessionId && hasActspaceBridge()) void refreshReviewSummary();
    };
    const settleResult = async (result: AgentRunResult | Awaited<ReturnType<typeof window.actspace.compactContext>>) => {
      setApprovalPendingForSession(sessionId, false);
      setFailedForSession(sessionId, result.status === "failed");
      const restored = await readSessionPage(sessionId);
      if (!isCurrentRun()) return;
      // The result is durable. Invalidate in-flight reads started before settlement.
      pageVersionsRef.current.set(sessionId, (pageVersionsRef.current.get(sessionId) ?? 0) + 1);
      if (!restored) {
        const fallback: SessionRecord = {
          meta: run.record?.meta ?? { schemaVersion: 2, id: sessionId, title: "New chat", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), agentRunCount: 1 },
          events: result.events, contextSnapshot: result.contextSnapshot,
        };
        cacheSessionPage(sessionId, { record: fallback, history: { before: null, throughJournalSeq: -1 } });
        if (isCurrentVisibleTurn()) { setSessionRecord(fallback); setHistoryBefore(null); }
      }
      if (isCurrentVisibleTurn()) { setAgentRunResult(null); setMessageLoading(false); }
      finishRun();
    };

    try {
      if (hasActspaceBridge()) {
        if (isCompactCommand) {
          const input: CompactContextInput = {
            sessionId,
            agentRunId,
            ...modelSelectionPayload(options.model),
          };
          const result = await window.actspace.compactContext(input);
          await settleResult(result);
          const refreshed = await readSidebarSessions();
          setSessions(refreshed);
          return;
        }

        const input: RunAgentInput = {
          sessionId,
          agentRunId,
          userInput: text,
          attachments: options.attachments?.map(attachmentForRuntime),
          mode: options.mode,
          selectedSkills: options.selectedSkills,
          ...modelSelectionPayload(options.model),
          thinkingEnabled: options.thinkingEnabled,
          ...(options.reasoningEffort && { reasoningEffort: options.reasoningEffort }),
          ...(isFirstAgentRun && nextWorkspaceRoot ? {
            executionContext: {
              runLocation,
              ...(nextWorkspace?.id ? { workspaceId: nextWorkspace.id } : {}),
              sourceWorkspaceRoot: nextWorkspaceRoot,
              ...(selectedBranch ? { branch: selectedBranch } : {}),
            },
          } : {}),
        };
        const result = await window.actspace.runAgent(input);

        await settleResult(result);
        const refreshed = await readSidebarSessions();
        setSessions(refreshed);
      }
    } catch (error) {
      console.error("Failed to run Agent", error);
      if (isCurrentRun()) {
        let restored: SessionRecord | null = null;
        if (hasActspaceBridge() && !isCompactCommand) {
          try {
            restored = await readSessionPage(sessionId);
          } catch (restoreError) {
            console.error("Failed to inspect session after turn error", restoreError);
          }
        }
        if (!isCurrentRun()) return;
        const inputPersisted = restored?.events.some(
          (event) => event.agentRunId === agentRunId && event.type === "user_message",
        ) ?? false;
        if (inputPersisted && restored) {
          if (isCurrentVisibleTurn()) setSessionRecord(restored);
        } else if (!isCompactCommand) {
          const draft: ComposerDraftRestore = {
            id: Date.now(),
            sessionId,
            text,
            attachments: options.attachments,
            error: error instanceof Error ? error.message : "Could not prepare the execution context.",
          };
          draftsRef.current.set(sessionId, draft);
          if (isCurrentVisibleTurn()) setComposerDraftRestore(draft);
        }
        setApprovalPendingForSession(sessionId, false);
        setFailedForSession(sessionId, true);
      }
    } finally {
      finishRun();
    }
  }, [
    isStreaming,
    sessionRecord,
    historyBefore,
    readSessionPage,
    cacheSessionPage,
    refreshStreamingBlocks,
    selectedWorkspaceRoot,
    findWorkspaceOption,
    refreshWorkspaces,
    sessionRecord?.meta.workspaceRoot,
    bootstrapState?.workspaceRoot,
    refreshReviewSummary,
    refreshPendingApprovalStatuses,
    setApprovalPendingForSession,
    setFailedForSession,
    createSessionForInput,
    runLocation,
    selectedBranch,
  ]);

  const handleAbort = useCallback(async () => {
    const sessionId = activeSessionIdRef.current;
    const run = sessionId ? sessionRunsRef.current.get(sessionId) : undefined;
    if (!hasActspaceBridge() || !run || !sessionId) return;

    const input: AbortAgentRunInput = {
      sessionId,
      agentRunId: run.agentRunId,
    };

    try {
      run.aborting = true;
      refreshStreamingBlocks(sessionId);
      const aborted = await window.actspace.abortAgentRun(input);
      if (!aborted) {
        run.aborting = false;
        refreshStreamingBlocks(sessionId);
      }
    } catch (error) {
      console.error("Failed to abort turn", error);
      run.aborting = false;
      refreshStreamingBlocks(sessionId);
    }
  }, [refreshStreamingBlocks]);

  const handleCreateSession = useCallback(async (input: NewSessionInput = {}) => {
    setAgentRunResult(null);
    setComposerStateBySession((current) => ({ ...current, __draft__: DEFAULT_COMPOSER_STATE }));

    const created = await createSessionForInput(input);
    if (created) {
      setComposerStateBySession((current) => ({
        ...current,
        [created.meta.id]: DEFAULT_COMPOSER_STATE,
      }));
    }
  }, [createSessionForInput]);

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

  const handleUseExistingWorkspace = useCallback(async () => {
    if (!hasActspaceBridge() || !window.actspace.selectWorkspaceDirectory) return;
    try {
      const result = await window.actspace.selectWorkspaceDirectory();
      if (result.canceled || !result.workspaceRoot) return;
      setSelectedWorkspaceRoot(normalizeWorkspaceRoot(result.workspaceRoot));
    } catch (error) {
      console.error("Failed to select workspace", error);
    }
  }, []);

  const handleCreateWorkspaceFolder = useCallback(async (name: string) => {
    if (
      !hasActspaceBridge() ||
      !window.actspace.selectWorkspaceDirectory ||
      !window.actspace.createWorkspaceFolder
    ) return;
    try {
      const parent = await window.actspace.selectWorkspaceDirectory();
      if (parent.canceled || !parent.workspaceRoot) return;
      const result = await window.actspace.createWorkspaceFolder({
        parentRoot: parent.workspaceRoot,
        name,
      });
      if ("error" in result) {
        console.error("Failed to create workspace folder", result.error);
        return;
      }
      setSelectedWorkspaceRoot(normalizeWorkspaceRoot(result.workspaceRoot));
      await refreshWorkspaces();
    } catch (error) {
      console.error("Failed to create workspace folder", error);
    }
  }, [refreshWorkspaces]);

  const handleSelectSession = useCallback(
    async (sessionId: string) => {
      if (!sessionId || sessionId === activeSessionIdRef.current) return;

      setAgentRunResult(null);
      setActiveSessionId(sessionId);
      refreshPendingApprovalStatuses([sessionId]).catch((error: unknown) => {
        console.error("Failed to refresh selected session approvals", error);
      });

      if (!hasActspaceBridge()) {
        const selected = localSessionRecords[sessionId];
        if (selected) {
          setSessionRecord(selected);
          setSelectedWorkspaceRoot(normalizeWorkspaceRoot(
            selected.meta.worktree?.sourceWorkspaceRoot ?? selected.meta.workspaceRoot ?? bootstrapState?.workspaceRoot,
          ));
          return;
        }
        return;
      }

      setSessionRecord(null); setHistoryBefore(null);
      const restored = await readSessionPage(sessionId, true)
      if (activeSessionIdRef.current !== sessionId) return;
      setSelectedWorkspaceRoot(normalizeWorkspaceRoot(
        restored?.meta.worktree?.sourceWorkspaceRoot ?? restored?.meta.workspaceRoot ?? bootstrapState?.workspaceRoot,
      ));
    },
    [bootstrapState?.workspaceRoot, localSessionRecords, refreshPendingApprovalStatuses, readSessionPage],
  );

  useEffect(() => {
    const bridge = window.actspace;
    if (
      !sessionBootstrapComplete ||
      !bridge?.consumeQuickOpenRequest ||
      !bridge.onQuickOpenRequested
    ) return;
    let disposed = false;

    const consumeRequest = async () => {
      const request = await bridge.consumeQuickOpenRequest();
      if (!request || disposed) return;
      const [settings, listedSessions, registry] = await Promise.all([
        bridge.getSettings(),
        bridge.listSessions(),
        bridge.listWorkspaces?.() ?? Promise.resolve(workspaceRegistry),
      ]);
      if (disposed) return;
      setSessions(listedSessions);
      if (registry) setWorkspaceRegistry(registry);
      const shortcut = settings.shortcuts?.quickOpen ?? {
        enabled: true,
        accelerator: DEFAULT_QUICK_OPEN_ACCELERATOR,
        target: { kind: "automatic" as const },
      };
      const resolution = resolveQuickOpenTarget(shortcut, registry?.items ?? [], listedSessions);
      if (resolution.kind === "session") {
        await handleSelectSession(resolution.sessionId);
      } else if (resolution.kind === "workspace") {
        await handleCreateSession({
          workspaceId: resolution.workspaceId,
          workspaceRoot: resolution.workspaceRoot,
        });
      } else {
        await handleCreateSession();
      }
      if (!disposed) setComposerFocusRequestId((value) => value + 1);
    };

    const unsubscribe = bridge.onQuickOpenRequested(() => {
      void consumeRequest().catch((error: unknown) => {
        console.error("Failed to handle quick open request", error);
      });
    });
    void consumeRequest().catch((error: unknown) => {
      console.error("Failed to consume pending quick open request", error);
    });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [handleCreateSession, handleSelectSession, sessionBootstrapComplete, workspaceRegistry]);

  const persistedEvents = sessionRecord?.events ?? agentRunResult?.events ?? [];
  const persistedMessages = useMemo<MessageBlock[]>(() => {
    const streamingAgentRunId = streamingBlocks.length > 0 ? activeAgentRunId : null;
    const streamingTurnEventIds = streamingAgentRunId
      ? new Set(
          persistedEvents
            .filter((event) => event.agentRunId === streamingAgentRunId)
            .map((event) => event.id),
        )
      : null;
    const fromRecord = sessionRecord?.messageBlocks;
    if (fromRecord && fromRecord.length > 0) {
      return streamingTurnEventIds
        ? fromRecord.filter((block) => !streamingTurnEventIds.has(block.id) && !block.renderKey?.startsWith(`turn:${streamingAgentRunId}:`))
        : fromRecord;
    }

    const visibleEvents = streamingAgentRunId
      ? persistedEvents.filter((event) => event.agentRunId !== streamingAgentRunId)
      : persistedEvents;
    const fromEvents = createMessageBlocks(visibleEvents);
    if (fromEvents.length > 0) return fromEvents;
    return [];
  }, [activeAgentRunId, persistedEvents, sessionRecord?.messageBlocks, streamingBlocks.length]);

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
    agentRunResult?.contextSnapshot ??
    getLatestContextSnapshot(persistedEvents);

  const contextState: ContextState | null =
    sessionRecord?.contextState ?? agentRunResult?.contextState ?? null;

  const visibleSessions = useMemo(() => {
    if (!workspaceRegistry) return sessions;
    const hiddenWorkspaceIds = new Set(
      workspaceRegistry.items.filter((workspace) => workspace.hidden).map((workspace) => workspace.id),
    );
    const hiddenWorkspacePaths = new Set(
      workspaceRegistry.items.filter((workspace) => workspace.hidden).map((workspace) => workspace.path),
    );
    return sessions.filter((session) =>
      !hiddenWorkspaceIds.has(session.workspaceId ?? "") &&
      !hiddenWorkspacePaths.has(normalizeWorkspaceRoot(session.workspaceRoot) ?? ""),
    );
  }, [sessions, workspaceRegistry]);
  const activeSessionId = selectedSessionId;
  const composerStateKey = activeSessionId ?? "__draft__";
  const activeComposerState = composerStateBySession[composerStateKey] ?? DEFAULT_COMPOSER_STATE;
  const handleComposerModeChange = (mode: ComposerMode) => {
    setComposerStateBySession((current) => ({
      ...current,
      [composerStateKey]: {
        mode,
        selectedSkills: current[composerStateKey]?.selectedSkills ?? [],
      },
    }));
  };
  const handleSelectedSkillsChange = (selectedSkills: string[]) => {
    setComposerStateBySession((current) => ({
      ...current,
      [composerStateKey]: {
        mode: current[composerStateKey]?.mode ?? "agent",
        selectedSkills,
      },
    }));
  };
  const isSessionReady = Boolean(sessionRecord || agentRunResult || streamingBlocks.length > 0 || sessionBootstrapComplete);
  const title = getSessionTitle(sessionRecord, visibleSessions, activeSessionId);
  const workspaceOptions = useMemo(
    () => {
      const registryOptions = workspaceRegistry
        ? createWorkspaceOptionsFromRegistry(workspaceRegistry.items)
        : [];
      const fallbackOptions = createWorkspaceOptionsFromRoots([
        selectedWorkspaceRoot,
        sessionRecord?.meta.worktree?.sourceWorkspaceRoot,
        sessionRecord?.meta.workspaceRoot,
        bootstrapState?.workspaceRoot,
        ...sessions.map((session) => session.worktree?.sourceWorkspaceRoot ?? session.workspaceRoot),
      ], bootstrapState?.workspaceRoot);
      const merged = new Map(registryOptions.map((option) => [option.value, option]));
      for (const option of fallbackOptions) {
        if (!merged.has(option.value)) merged.set(option.value, option);
      }
      return [...merged.values()];
    },
    [bootstrapState?.workspaceRoot, selectedWorkspaceRoot, sessionRecord?.meta.workspaceRoot, sessions, workspaceRegistry],
  );
  const executionContext = useMemo<ComposerExecutionContext>(() => ({
    gitContext: workspaceGitContext,
    selectedBranch,
    runLocation,
    locked: (sessionRecord?.meta.agentRunCount ?? 0) > 0,
    onSelectBranch: setSelectedBranch,
    onSelectRunLocation: setRunLocation,
    onUseExistingWorkspace: handleUseExistingWorkspace,
    onCreateWorkspaceFolder: handleCreateWorkspaceFolder,
  }), [
    handleCreateWorkspaceFolder,
    handleUseExistingWorkspace,
    runLocation,
    selectedBranch,
    sessionRecord?.meta.agentRunCount,
    workspaceGitContext,
  ]);
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

  const handleCopySessionId = useCallback(async (sessionId: string) => {
    if (!sessionId) return;
    try {
      await copyTextToClipboard(sessionId);
    } catch (error) {
      console.error("Failed to copy session id", error);
    }
  }, []);

  const handleCopyTranscript = useCallback(async (sessionId: string) => {
    if (!sessionId) return;

    try {
      const listedSession = sessions.find((session) => session.id === sessionId);
      let transcriptMessages: MessageBlock[];
      let transcriptTitle = listedSession?.title ?? "Untitled session";

      if (sessionId === activeSessionId && !window.actspace?.getSessionPage) {
        transcriptMessages = messages;
        transcriptTitle = sessionRecord?.meta.title ?? transcriptTitle;
      } else {
        const record = !hasActspaceBridge()
          ? localSessionRecords[sessionId] ?? null
          : await window.actspace.getSession({ sessionId });
        if (!record) {
          throw new Error(`Session not found: ${sessionId}`);
        }
        transcriptTitle = record.meta.title;
        transcriptMessages = record.messageBlocks?.length
          ? record.messageBlocks
          : createMessageBlocks(record.events);
      }

      await copyTextToClipboard(formatSessionTranscript(transcriptTitle, transcriptMessages));
    } catch (error) {
      console.error("Failed to copy session transcript", error);
    }
  }, [activeSessionId, localSessionRecords, messages, sessionRecord?.meta.title, sessions]);

  const handleForkSession = useCallback(async (sessionId: string) => {
    if (
      !sessionId ||
      busySessionIds.has(sessionId) ||
      approvalPendingSessionIds.has(sessionId)
    ) {
      return;
    }

    try {
      let forked: SessionRecord;
      if (!hasActspaceBridge()) {
        const source = localSessionRecords[sessionId] ?? (sessionRecord?.meta.id === sessionId ? sessionRecord : null);
        if (!source) throw new Error(`Session not found: ${sessionId}`);
        forked = createLocalForkSession(source);
        setLocalSessionRecords((current) => ({ ...current, [forked.meta.id]: forked }));
        setSessions((current) => [
          {
            id: forked.meta.id,
            title: forked.meta.title,
            updatedAt: forked.meta.updatedAt,
            agentRunCount: forked.meta.agentRunCount,
            workspaceId: forked.meta.workspaceId,
            workspaceRoot: forked.meta.workspaceRoot,
          },
          ...current,
        ]);
      } else {
        if (!window.actspace.forkSession) {
          throw new Error("Session fork is not available");
        }
        forked = await window.actspace.forkSession({ sessionId });
        const refreshed = await readSidebarSessions();
        setSessions(refreshed);
        await refreshWorkspaces();
      }

      setActiveSessionId(forked.meta.id);
      setAgentRunResult(null);
      setSessionRecord(forked);
      setSelectedWorkspaceRoot(normalizeWorkspaceRoot(
        forked.meta.worktree?.sourceWorkspaceRoot ?? forked.meta.workspaceRoot ?? bootstrapState?.workspaceRoot,
      ));
      setApprovalPendingForSession(forked.meta.id, false);
      setFailedForSession(forked.meta.id, false);
    } catch (error) {
      console.error("Failed to fork session", error);
    }
  }, [
    approvalPendingSessionIds,
    bootstrapState?.workspaceRoot,
    busySessionIds,
    localSessionRecords,
    refreshWorkspaces,
    sessionRecord,
    setApprovalPendingForSession,
    setFailedForSession,
  ]);

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
        const refreshed = await readSidebarSessions();
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

        const refreshed = await readSidebarSessions();
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
        const refreshed = await readSidebarSessions();
        setSessions(refreshed);
      } catch (error) {
        console.error("Failed to archive session", error);
      }
    },
    [activeSessionId],
  );

  const handleOpenWorkspace = useCallback(async (workspaceId: string) => {
    if (!hasActspaceBridge() || !window.actspace.openWorkspaceInIde) return;
    const result = await window.actspace.openWorkspaceInIde({ workspaceId });
    if (!result.ok) {
      console.error("Failed to open workspace in IDE", result.error);
    }
  }, []);

  const handleArchiveWorkspace = useCallback(async (workspaceId: string, workspaceRoot?: string) => {
    if (!workspaceRoot && workspaceId === workspaceRegistry?.defaultWorkspaceId) {
      workspaceRoot = workspaceRegistry.items.find((workspace) => workspace.id === workspaceId)?.path;
    }
    const archiveCandidates = hasActspaceBridge() ? await window.actspace.listSessions() : sessions;
    const targetSessionIds = archiveCandidates
      .filter((session) =>
        session.workspaceId === workspaceId ||
        (!session.workspaceId && normalizeWorkspaceRoot(session.workspaceRoot) === normalizeWorkspaceRoot(workspaceRoot)) ||
        (!session.workspaceId && !session.workspaceRoot && workspaceId === workspaceRegistry?.defaultWorkspaceId),
      )
      .map((session) => session.id);
    if (targetSessionIds.length === 0) return;
    if (targetSessionIds.some((sessionId) => busySessionIds.has(sessionId) || approvalPendingSessionIds.has(sessionId))) {
      return;
    }

    if (activeSessionId && targetSessionIds.includes(activeSessionId)) {
      const hiddenWorkspaces = workspaceRegistry?.items.filter((workspace) => workspace.hidden) ?? [];
      const hiddenIds = new Set(hiddenWorkspaces.map((workspace) => workspace.id));
      const hiddenPaths = new Set(hiddenWorkspaces.map((workspace) => normalizeWorkspaceRoot(workspace.path)));
      const fallback = sessions.find((session) =>
        !targetSessionIds.includes(session.id) &&
        !hiddenIds.has(session.workspaceId ?? "") &&
        !hiddenPaths.has(normalizeWorkspaceRoot(session.workspaceRoot)),
      );
      if (fallback) {
        await handleSelectSession(fallback.id);
      } else {
        const created = await createSessionForInput({ workspaceId, workspaceRoot });
        if (!created) return;
      }
    }

    if (!hasActspaceBridge()) {
      const targets = new Set(targetSessionIds);
      setSessions((current) => current.filter((session) => !targets.has(session.id)));
      setLocalSessionRecords((current) => Object.fromEntries(
        Object.entries(current).filter(([sessionId]) => !targets.has(sessionId)),
      ));
      return;
    }
    if (!window.actspace.archiveSessions) return;
    const result = await window.actspace.archiveSessions({ sessionIds: targetSessionIds });
    const refreshed = await readSidebarSessions();
    setSessions(refreshed);
    if (!result.ok) {
      console.error("Some workspace sessions could not be archived", result.failedSessionIds);
    }
  }, [activeSessionId, approvalPendingSessionIds, busySessionIds, createSessionForInput, handleSelectSession, sessions, workspaceRegistry]);

  const handleRemoveWorkspace = useCallback(async (workspaceId: string, workspaceRoot?: string) => {
    if (!workspaceRegistry || workspaceId === workspaceRegistry.defaultWorkspaceId) return;
    const targetSessionIds = new Set(sessions
      .filter((session) =>
        session.workspaceId === workspaceId ||
        (!session.workspaceId && normalizeWorkspaceRoot(session.workspaceRoot) === normalizeWorkspaceRoot(workspaceRoot)),
      )
      .map((session) => session.id));

    if (activeSessionId && targetSessionIds.has(activeSessionId)) {
      const hiddenWorkspaces = workspaceRegistry.items.filter((workspace) => workspace.hidden);
      const hiddenIds = new Set(hiddenWorkspaces.map((workspace) => workspace.id));
      const hiddenPaths = new Set(hiddenWorkspaces.map((workspace) => workspace.path));
      const fallback = sessions.find((session) =>
        !targetSessionIds.has(session.id) &&
        !hiddenIds.has(session.workspaceId ?? "") &&
        !hiddenPaths.has(normalizeWorkspaceRoot(session.workspaceRoot) ?? ""),
      );
      if (fallback) {
        setActiveSessionId(fallback.id);
        const restored = hasActspaceBridge()
          ? await readSessionPage(fallback.id)
          : localSessionRecords[fallback.id] ?? null;
        if (!restored || activeSessionIdRef.current !== fallback.id) return;
        setSessionRecord(restored);
        setAgentRunResult(null);
        setSelectedWorkspaceRoot(normalizeWorkspaceRoot(
          restored.meta.workspaceRoot ?? fallback.workspaceRoot ?? bootstrapState?.workspaceRoot,
        ));
      } else {
        const created = await createSessionForInput({ workspaceId: workspaceRegistry.defaultWorkspaceId });
        if (!created) return;
      }
    }

    if (!hasActspaceBridge() || !window.actspace.setWorkspaceVisibility) {
      setWorkspaceRegistry((current) => current ? {
        ...current,
        items: current.items.map((workspace) => workspace.id === workspaceId ? { ...workspace, hidden: true } : workspace),
      } : current);
      return;
    }
    const result = await window.actspace.setWorkspaceVisibility({ workspaceId, hidden: true });
    if (!result.ok) {
      console.error("Failed to remove workspace from sidebar", result.error);
      return;
    }
    await refreshWorkspaces();
    if (normalizeWorkspaceRoot(selectedWorkspaceRoot) === normalizeWorkspaceRoot(workspaceRoot)) {
      setSelectedWorkspaceRoot(normalizeWorkspaceRoot(
        workspaceRegistry.items.find((workspace) => workspace.id === workspaceRegistry.defaultWorkspaceId)?.path ??
        bootstrapState?.workspaceRoot,
      ));
    }
  }, [activeSessionId, bootstrapState?.workspaceRoot, createSessionForInput, localSessionRecords, refreshWorkspaces, selectedWorkspaceRoot, sessions, workspaceRegistry]);

  const handleArchivedSessionsChange = useCallback(async () => {
    if (!hasActspaceBridge()) return;

    try {
      const refreshed = await readSidebarSessions();
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
    <SessionProjectionProvider sessionId={activeSessionId}>
      <SessionBrowseContext.Provider value={{ groups: browseGroups, listLoading, listError, retryList: () => setListRetry(n => n + 1), loadMore: loadMoreSessions, messageLoading, messageError, retryMessages: () => { if (activeSessionIdRef.current) void readSessionPage(activeSessionIdRef.current); }, hasEarlier: historyBefore !== null, earlierLoading, earlierError, loadEarlier: loadEarlierMessages }}>
      <RightPanelProvider>
        <WorkbenchLayout
        sessions={visibleSessions}
        activeSessionId={activeSessionId}
        title={title}
        messages={messages}
        contextSnapshot={contextSnapshot}
        contextState={contextState}
        isStreaming={isStreaming}
        isAborting={isAborting}
        sendScrollRequestId={sendScrollRequestId}
        composerFocusRequestId={composerFocusRequestId}
        busySessionIds={busySessionIds}
        sessionStatuses={sessionStatuses}
        onSend={handleSend}
        onAbort={handleAbort}
        onNewSession={handleCreateSession}
        onAddWorkspace={handleAddWorkspace}
        onSelectSession={handleSelectSession}
        onTogglePin={handleTogglePin}
        onRenameSession={handleRenameSession}
        onCopySessionId={handleCopySessionId}
        onCopyTranscript={handleCopyTranscript}
        onForkSession={handleForkSession}
        onArchiveSession={handleArchiveSession}
        onOpenWorkspace={handleOpenWorkspace}
        onArchiveWorkspace={handleArchiveWorkspace}
        onRemoveWorkspace={handleRemoveWorkspace}
        isSessionReady={isSessionReady}
        defaultModelId={defaultModelId}
        selectedModelId={selectedChatModelId}
        onSelectedModelChange={handleSelectedChatModelChange}
        composerMode={activeComposerState.mode}
        onComposerModeChange={handleComposerModeChange}
        selectedSkills={activeComposerState.selectedSkills}
        onSelectedSkillsChange={handleSelectedSkillsChange}
        onSettingsChange={handleSettingsChange}
        onArchivedSessionsChange={handleArchivedSessionsChange}
        workspaces={workspaceRegistry?.items.filter((workspace) => !workspace.hidden)}
        workspaceOptions={workspaceOptions}
        selectedWorkspaceRoot={selectedWorkspaceRoot}
        onSelectWorkspace={setSelectedWorkspaceRoot}
        executionContext={executionContext}
        draftRestore={composerDraftRestore}
        getSessionPreview={getSessionPreview}
        reviewSummary={reviewSummary}
        onReviewChanged={handleReviewChanged}
        models={usableChatModels}
        />
        <ShutdownOverlay />
      </RightPanelProvider>
      </SessionBrowseContext.Provider>
    </SessionProjectionProvider>
  );
}
