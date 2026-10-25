import type { MessageBlock, RuntimeStreamEvent } from "@actspace/shared";
import type { SessionRunState } from "./run-state.js";
import { createCompactionBlock, streamingStateToBlocks } from "./stream-blocks.js";
import { appendOrMergeSegment, dropTrailingStreamSegments, hasFinishedAllActiveTools, upsertCompactionSegment, upsertStreamingTool, upsertWorkspacePreparationSegment } from "./stream-state.js";

type UserBlock = Extract<MessageBlock, { kind: "user" }>;
/** steer 插入的消息正文；桌面端的排队消息结构上满足它。 */
export type SteeredMessage = { readonly text: string; readonly options: { readonly attachments?: UserBlock["attachments"]; readonly fileReferences?: UserBlock["fileReferences"]; readonly responseAnnotations?: UserBlock["responseAnnotations"] } };

// 运行中的 run 与它的流式块（14 S6，从 App 的 sessionRunsRef / streamingBlocks / handleStreamEvent 迁入）。
// run.state 由事件就地修改；改完调用 refresh，视图在下次读取时重算并缓存。

/** 已结束的 runId 只保留最近这么多个，用来拒绝迟到的 agent_run_started。 */
export const TERMINAL_RUN_LIMIT = 200;

export type LiveRunView = {
  readonly blocks: readonly MessageBlock[];
  readonly isStreaming: boolean;
  readonly isAborting: boolean;
  readonly runId: string | null;
  /** 渲染进程重载后重新挂上的 run（见 transcript.ts 的 LiveTranscript.recovered）。 */
  readonly recovered: boolean;
};

export type StreamEvent = RuntimeStreamEvent;

export interface LiveRunStore {
  get(sessionId: string): SessionRunState | undefined;
  has(sessionId: string): boolean;
  /** 挂上（或替换）会话的 run，会话进入 busy。 */
  start(run: SessionRunState): void;
  /** 卸下会话的 run；给了 `expected` 时只在仍是它时卸下。返回是否卸下。 */
  end(sessionId: string, expected?: SessionRunState): boolean;
  /** run.state / aborting / userBlock 就地改过之后调用。 */
  refresh(sessionId: string): void;
  view(sessionId: string | null): LiveRunView;
  /** 运行中的会话；成员变化时换成新的 Set，调用方不要修改它。 */
  busyIds(): Set<string>;
  markTerminal(runId: string): void;
  isTerminal(runId: string): boolean;
  /** 把流式事件归并进对应 run；不属于当前 run 的事件忽略。steer 的正文由 `onSteered` 提供。 */
  applyStreamEvent(event: StreamEvent, onSteered: (sessionId: string, messageId: string) => SteeredMessage | undefined): void;
  subscribe(listener: () => void): () => void;
  /** 释放会话的视图缓存；run 仍在时不释放。 */
  evict(sessionId: string): void;
}

const IDLE_VIEW: LiveRunView = Object.freeze({ blocks: Object.freeze([]) as readonly MessageBlock[], isStreaming: false, isAborting: false, runId: null, recovered: false });

/** 插入顺序即新旧顺序；重复加入的 id 移到最新，超出上限时淘汰最旧的。 */
export function createBoundedSet(limit: number) {
  const items = new Set<string>();
  return {
    add(value: string) {
      items.delete(value);
      items.add(value);
      while (items.size > limit) items.delete(items.values().next().value!);
    },
    has: (value: string) => items.has(value),
    get size() { return items.size; },
  };
}

export type LiveRunStoreOptions = {
  /**
   * 文本 / 思考 / 工具参数的流式增量改由它延后通知（例如按帧合并），其余事件仍立即通知。
   * 不传时每个事件都立即通知。
   */
  readonly scheduleNotify?: (flush: () => void) => void;
};

/** 高频的流式增量：一个回复可能有上千个，按帧合并通知即可。 */
const DEFERRABLE_STREAM_EVENTS: ReadonlySet<StreamEvent["type"]> = new Set(["assistant_text_delta", "assistant_thinking_delta", "tool_call_streaming"]);

export function createLiveRunStore(terminalLimit = TERMINAL_RUN_LIMIT, options: LiveRunStoreOptions = {}): LiveRunStore {
  const runs = new Map<string, SessionRunState>();
  const views = new Map<string, LiveRunView>();
  const terminal = createBoundedSet(terminalLimit);
  const listeners = new Set<() => void>();
  let busy = new Set<string>();
  let notifyScheduled = false;
  const notify = () => { notifyScheduled = false; for (const listener of [...listeners]) listener(); };
  const refresh = (sessionId: string) => { views.delete(sessionId); notify(); };
  const refreshSoon = (sessionId: string) => {
    views.delete(sessionId);
    if (!options.scheduleNotify) { notify(); return; }
    if (notifyScheduled) return;
    notifyScheduled = true;
    options.scheduleNotify(() => { if (notifyScheduled) notify(); });
  };
  const setBusy = (sessionId: string, included: boolean) => {
    if (busy.has(sessionId) === included) return;
    const next = new Set(busy);
    if (included) next.add(sessionId); else next.delete(sessionId);
    busy = next;
  };
  const view = (sessionId: string | null): LiveRunView => {
    if (sessionId === null) return IDLE_VIEW;
    const cached = views.get(sessionId);
    if (cached) return cached;
    const run = runs.get(sessionId);
    if (!run) return IDLE_VIEW;
    const blocks = streamingStateToBlocks(run.state, run.agentRunId);
    const next: LiveRunView = { blocks: run.userBlock ? [run.userBlock, ...blocks] : blocks, isStreaming: true, isAborting: run.aborting, runId: run.agentRunId, recovered: run.recovered === true };
    views.set(sessionId, next);
    return next;
  };

  function applyStreamEvent(event: StreamEvent, onSteered: (sessionId: string, messageId: string) => SteeredMessage | undefined) {
    const run = runs.get(event.sessionId);
    if (!run || run.agentRunId !== event.agentRunId) return;
    // A recovered run keeps its durable transcript, including text completed
    // before reload. Subsequent text is supplied by the live Journal projection.
    if (run.recovered && (event.type === "assistant_text_delta" || event.type === "assistant_thinking_delta")) return;
    const state = run.state;

    switch (event.type) {
      case "agent_run_started":
        state.waitingForModel = true;
        break;

      case "user_message_steered": {
        const item = onSteered(event.sessionId, event.messageId);
        if (!item) break;
        state.segments.push({
          type: "user_message",
          block: {
            kind: "user", id: `turn:${event.agentRunId}:steer:${event.messageId}`, runId: event.agentRunId, content: item.text,
            createdAt: new Date().toISOString(), attachments: item.options.attachments,
            ...(item.options.fileReferences?.length ? { fileReferences: item.options.fileReferences } : {}),
            ...(item.options.responseAnnotations?.length ? { responseAnnotations: item.options.responseAnnotations } : {}),
          },
        });
        state.waitingForModel = true;
        break;
      }

      case "background_notice_claimed": {
        // id 与 durable 选择器的 renderKey 一致，run 结束后由 durable 块接手同一行。
        const id = `turn:${event.agentRunId}:background-notice:0`;
        if (state.segments.some((segment) => segment.type === "background_notice")) break;
        state.segments.unshift({ type: "background_notice", block: { kind: "background_notice", id, renderKey: id, runId: event.agentRunId, content: event.content, createdAt: new Date().toISOString(), ...event.notice } });
        break;
      }

      case "workspace_preparation_started":
        state.waitingForModel = false;
        upsertWorkspacePreparationSegment(state, event.agentRunId);
        state.activeWorkspacePreparations.set(event.agentRunId, {
          kind: "workspace_preparation",
          id: `turn:${event.agentRunId}:workspace-preparation:0`,
          runId: event.agentRunId,
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
          runId: event.agentRunId,
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
          startedAt: event.startedAt,
        }));
        break;

      case "context_compaction_finished": {
        state.waitingForModel = false;
        if (event.payload.status === "skipped") {
          state.activeCompactions.delete(event.agentRunId);
          state.segments = state.segments.filter((segment) => !(segment.type === "compaction" && segment.agentRunId === event.agentRunId));
          break;
        }
        upsertCompactionSegment(state, event.agentRunId);
        state.activeCompactions.set(event.agentRunId, createCompactionBlock({
          agentRunId: event.agentRunId,
          status: event.payload.status === "failed" ? "failed" : "completed",
          removedCount: event.payload.removedCount ?? Math.max(event.payload.beforeCount - event.payload.afterCount, 0),
          durationMs: event.payload.durationMs,
          compactionId: event.payload.compactionId,
          trigger: event.payload.trigger,
          beforeTokens: event.payload.beforeTokens,
          afterTokens: event.payload.afterTokens,
          beforeEstimated: event.payload.beforeEstimated,
          errorMessage: event.payload.reason,
        }));
        break;
      }

      case "context_compaction_failed":
        state.waitingForModel = false;
        upsertCompactionSegment(state, event.agentRunId);
        state.activeCompactions.set(event.agentRunId, createCompactionBlock({
          agentRunId: event.agentRunId,
          status: "failed",
          errorMessage: event.error.message,
        }));
        break;

      case "assistant_thinking_delta":
        if (!event.delta) break;
        state.retryNotice = undefined;
        if (event.delta.trim().length > 0) {
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

    if (DEFERRABLE_STREAM_EVENTS.has(event.type)) refreshSoon(event.sessionId);
    else refresh(event.sessionId);
  }

  return {
    get: (sessionId) => runs.get(sessionId),
    has: (sessionId) => runs.has(sessionId),
    start(run) {
      runs.set(run.sessionId, run);
      setBusy(run.sessionId, true);
      refresh(run.sessionId);
    },
    end(sessionId, expected) {
      const run = runs.get(sessionId);
      if (!run || (expected && run !== expected)) return false;
      runs.delete(sessionId);
      setBusy(sessionId, false);
      refresh(sessionId);
      return true;
    },
    refresh,
    view,
    busyIds: () => busy,
    markTerminal: (runId) => terminal.add(runId),
    isTerminal: (runId) => terminal.has(runId),
    applyStreamEvent,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    evict(sessionId) {
      if (!runs.has(sessionId)) views.delete(sessionId);
    },
  };
}
