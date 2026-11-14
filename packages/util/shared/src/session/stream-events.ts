// Runtime 运行时推给界面的实时流事件（不落盘）；落盘的会话事件在 `./events`。

import type {
  AssistantReply,
  BackgroundNotice,
  ContextCompactionPayload,
  SessionEvent,
  WorkspacePreparationPayload,
} from "./events";
import type { AgentRunId, EventId, LlmCallId, SessionError, SessionId, ToolCallId, TurnId } from "./primitives";
import type { AgentToolPreview, SubAgentTranscriptRef, ToolUiPreview } from "./tool-preview";

export type RuntimeStreamEvent =
  | {
      type: "agent_run_started";
      sessionId: SessionId;
      agentRunId: AgentRunId;
      recoveredReset?: boolean /** Set for a subagent's Run: the main Session it belongs to. */;
      parentSessionId?: SessionId;
    }
  | { type: "agent_turn_started"; sessionId: SessionId; agentRunId: AgentRunId; turnId: TurnId; turnIndex: number }
  | { type: "agent_turn_finished"; sessionId: SessionId; agentRunId: AgentRunId; turnId: TurnId; turnIndex: number }
  | {
      type: "llm_call_started";
      sessionId: SessionId;
      agentRunId: AgentRunId;
      turnId: TurnId;
      turnIndex: number;
      llmCallId: LlmCallId;
      attempt: number;
    }
  | {
      type: "llm_call_finished";
      sessionId: SessionId;
      agentRunId: AgentRunId;
      turnId: TurnId;
      turnIndex: number;
      llmCallId: LlmCallId;
      attempt: number;
      durationMs: number;
      stopReason: AssistantReply["stopReason"];
    }
  | {
      type: "workspace_preparation_started";
      sessionId: SessionId;
      agentRunId: AgentRunId;
      kind: "worktree";
      sourceWorkspaceRoot: string;
      baseBranch: string;
    }
  | {
      type: "workspace_preparation_finished";
      sessionId: SessionId;
      agentRunId: AgentRunId;
      payload: WorkspacePreparationPayload;
    }
  | { type: "context_compaction_started"; sessionId: SessionId; agentRunId: AgentRunId; startedAt: string }
  | {
      type: "context_compaction_finished";
      sessionId: SessionId;
      agentRunId: AgentRunId;
      payload: ContextCompactionPayload;
    }
  | { type: "context_compaction_failed"; sessionId: SessionId; agentRunId: AgentRunId; error: SessionError }
  /** 运行中插入的消息已被 Agent 读到（下一步开始前）。 */
  | { type: "user_message_steered"; sessionId: SessionId; agentRunId: AgentRunId; turnId: TurnId; messageId: string }
  /** 唤醒回合领取了后台任务通知，回合以分隔行开头。 */
  | {
      type: "background_notice_claimed";
      sessionId: SessionId;
      agentRunId: AgentRunId;
      turnId: TurnId;
      messageId: string;
      notice: BackgroundNotice;
      content: string;
    }
  /** `liveRevision`：合并进这一帧的最后一段增量在实时底稿里的编号；恢复运行据此丢掉底稿已包含的帧。 */
  | {
      type: "assistant_text_delta";
      sessionId: SessionId;
      agentRunId: AgentRunId;
      turnId: TurnId;
      llmCallId: LlmCallId;
      messageId: EventId;
      delta: string;
      liveRevision?: number;
    }
  | {
      type: "assistant_thinking_delta";
      sessionId: SessionId;
      agentRunId: AgentRunId;
      turnId: TurnId;
      llmCallId: LlmCallId;
      messageId: EventId;
      delta: string;
      liveRevision?: number;
    }
  /** 恢复运行（重载、重新观察）的起点：主进程或远程 Host 里还没定稿的正文与思考。 */
  | {
      type: "live_output_baseline";
      sessionId: SessionId;
      agentRunId: AgentRunId;
      revision: number;
      segments: readonly { kind: "text" | "thinking"; messageId: string; requestId?: string; text: string }[];
    }
  | {
      type: "tool_call_streaming";
      sessionId: SessionId;
      agentRunId: AgentRunId;
      turnId: TurnId;
      llmCallId: LlmCallId;
      toolCallId: ToolCallId;
      toolName: string;
      /** 首帧（dispatched 阶段）为 true，后续帧 false/undefined */
      isInitial?: boolean;
      /** 后端按 previewKind 解析 partial args 得到的 typed preview，前端直接渲染 */
      preview: ToolUiPreview;
    }
  | {
      type: "tool_started";
      sessionId: SessionId;
      agentRunId: AgentRunId;
      turnId: TurnId;
      llmCallId: LlmCallId;
      toolCallId: ToolCallId;
      toolName: string;
      argsPreview: string;
      preview?: ToolUiPreview;
    }
  | {
      type: "tool_finished";
      sessionId: SessionId;
      agentRunId: AgentRunId;
      turnId: TurnId;
      llmCallId: LlmCallId;
      toolCallId: ToolCallId;
      toolName: string;
      resultEventId: EventId;
      isError: boolean;
      status?: "completed" | "failed" | "denied" | "aborted" | "outcome-unknown";
      preview?: ToolUiPreview;
    }
  | {
      type: "subagent_event";
      sessionId: SessionId;
      agentRunId: AgentRunId;
      turnId?: TurnId;
      llmCallId?: LlmCallId;
      toolCallId: ToolCallId;
      transcriptRef: SubAgentTranscriptRef;
      event: SessionEvent;
      preview: AgentToolPreview;
    }
  | {
      type: "tool_approval_required";
      sessionId: SessionId;
      agentRunId: AgentRunId;
      turnId?: TurnId;
      llmCallId?: LlmCallId;
      toolCallId: ToolCallId;
      toolName: string;
      requestId: string /** 远端审批所在的 Host；本机审批没有。 */;
      hostId?: string;
      summary: string;
      reason: string;
      command?: string;
      riskLevel?: string;
      approvalScope?: "browser_session";
      executionEnvironment?: "sandbox" | "real";
    }
  | {
      type: "tool_approval_resolved";
      sessionId: SessionId;
      agentRunId: AgentRunId;
      turnId?: TurnId;
      llmCallId?: LlmCallId;
      toolCallId: ToolCallId;
      requestId: string;
      hostId?: string;
      decision: string;
      approvalScope?: "browser_session";
    }
  | {
      /** LLM 调用命中可重试错误、agent loop 正在退避重试；renderer 据此清掉半截 streaming 内容并显示重试提示 */
      type: "llm_retry";
      sessionId: SessionId;
      agentRunId: AgentRunId;
      turnId: TurnId;
      turnIndex: number;
      /** 触发重试的失败请求；下一次请求尚未创建自己的 llmCallId。 */
      failedLlmCallId: LlmCallId;
      /** 即将开始的请求尝试序号（首次为 1，因此重试事件从 2 开始）。 */
      attempt: number;
      /** 最大重试次数 */
      maxAttempts: number;
      reason: string;
    }
  | { type: "agent_run_aborted"; sessionId: SessionId; agentRunId: AgentRunId; parentSessionId?: SessionId }
  | {
      type: "agent_run_finished";
      sessionId: SessionId;
      agentRunId: AgentRunId;
      resultEventIds: EventId[];
      parentSessionId?: SessionId;
    }
  | {
      type: "agent_run_failed";
      sessionId: SessionId;
      agentRunId: AgentRunId;
      error: SessionError;
      parentSessionId?: SessionId;
    };
