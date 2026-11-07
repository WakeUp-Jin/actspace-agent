import type { MessageBlock, RuntimeStreamEvent, SessionEvent, ToolUiPreview } from "@actspace/shared";

export type ToolEntry = {
  toolName: string;
  preview?: ToolUiPreview;
  isError?: boolean;
  finished?: boolean;
  /** 已收到 `tool_started`（真正开始执行）。批内排在后面、还没轮到的调用没有它。 */
  started?: boolean;
  terminalStatus?: Extract<RuntimeStreamEvent, { type: "tool_finished" }>["status"];
  approvalPending?: boolean;
  approvalRequestId?: string;
  approvalReason?: string;
  approvalSummary?: string;
  approvalScope?: "browser_session";
  /** 正在流式生成参数时所属的模型请求（`tool_call_streaming.llmCallId`）。 */
  llmCallId?: string;
  transcriptEvents?: SessionEvent[];
};

export type StreamingSegment =
  /** `llmCallId` / `messageId`：产生这段输出的模型请求与消息（轨迹流式层按请求取正文）；旧帧可能没有。 */
  | { type: "thinking"; text: string; llmCallId?: string; messageId?: string }
  | { type: "text"; text: string; llmCallId?: string; messageId?: string }
  | { type: "tool"; toolCallId: string }
  | { type: "compaction"; agentRunId: string }
  | { type: "workspace_preparation"; agentRunId: string }
  /** 运行中引导、已被 loop 读到的用户消息。 */
  | { type: "user_message"; block: Extract<MessageBlock, { kind: "user" }> }
  /** 唤醒回合开头的后台任务通知分隔行。 */
  | { type: "background_notice"; messageId: string; block: Extract<MessageBlock, { kind: "background_notice" }> };

export type StreamingState = {
  segments: StreamingSegment[];
  activeTools: Map<string, ToolEntry>;
  activeCompactions: Map<string, Extract<MessageBlock, { kind: "context_compaction" }>>;
  activeWorkspacePreparations: Map<string, Extract<MessageBlock, { kind: "workspace_preparation" }>>;
  /** 已发起模型请求、但尚未收到可见回复或工具活动。仅用于当前流式 UI，不写入会话。 */
  waitingForModel: boolean;
  /** LLM 可重试错误退避中：显示重试提示；新 delta 到达（重试成功）时清除 */
  retryNotice?: { attempt: number; maxAttempts: number };
};

export function createEmptyStreamingState(): StreamingState {
  return {
    segments: [],
    activeTools: new Map(),
    activeCompactions: new Map(),
    activeWorkspacePreparations: new Map(),
    waitingForModel: false,
  };
}

/** Renderer-owned live projection. Runtime owns execution; selection never disposes this state. */
export type SessionRunState = {
  operationTaskId?: string;
  /** Reattached after renderer reload; completion comes from the host stream. */
  recovered?: boolean;
  /**
   * Recovered runs only: the live baseline's revision once applied. Until then text/thinking deltas wait in
   * `liveBuffer`; afterwards frames whose `liveRevision` is not greater are already in the baseline and dropped.
   */
  liveCut?: number;
  liveBuffer?: Extract<RuntimeStreamEvent, { type: "assistant_text_delta" | "assistant_thinking_delta" }>[];
  sessionId: string;
  agentRunId: string;
  state: StreamingState;
  userBlock: MessageBlock | null;
  aborting: boolean;
};
