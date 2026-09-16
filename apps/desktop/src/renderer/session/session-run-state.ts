import type { MessageBlock, RuntimeStreamEvent, SessionEvent, SessionRecord, ToolUiPreview } from "@actspace/shared";

export type ToolEntry = {
  toolName: string;
  preview?: ToolUiPreview;
  isError?: boolean;
  finished?: boolean;
  terminalStatus?: Extract<RuntimeStreamEvent, { type: "tool_finished" }>["status"];
  approvalPending?: boolean;
  approvalRequestId?: string;
  approvalReason?: string;
  approvalSummary?: string;
  approvalScope?: "browser_session";
  transcriptEvents?: SessionEvent[];
};

export type StreamingSegment =
  | { type: "thinking"; text: string }
  | { type: "text"; text: string }
  | { type: "tool"; toolCallId: string }
  | { type: "compaction"; agentRunId: string }
  | { type: "workspace_preparation"; agentRunId: string };

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
  sessionId: string;
  agentRunId: string;
  state: StreamingState;
  userBlock: MessageBlock | null;
  aborting: boolean;
  record: SessionRecord | null;
  historyBefore: number | null;
};
