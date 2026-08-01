import type {
  AssistantReply,
  ContextUsageSnapshot,
  SessionEvent,
  SessionId,
  ToolPreviewKind,
  AgentRunId,
  ToolExecutionResult
} from "@actspace/shared";

export type AgentRunInput = {
  sessionId: SessionId;
  agentRunId: AgentRunId;
  userInput: string;
  contextSnapshot?: ContextUsageSnapshot;
};

export type AgentRunOutcome = {
  sessionId: SessionId;
  agentRunId: AgentRunId;
  events: SessionEvent[];
  finalReply?: AssistantReply;
  contextSnapshot: ContextUsageSnapshot;
  status: "completed" | "failed";
  error?: {
    code: string;
    message: string;
  };
};

export type ModelTurnToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type ModelTurnOutput = {
  model: string;
  provider: string;
  thinking?: string;
  toolCalls: ModelTurnToolCall[];
  finalReply?: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
};

export type ModelProviderInput = {
  sessionId: SessionId;
  agentRunId: AgentRunId;
  userInput: string;
  contextSnapshot?: ContextUsageSnapshot;
};

export type ModelProvider = {
  id: string;
  label: string;
  completeTurn(input: ModelProviderInput): Promise<ModelTurnOutput>;
};

export type ToolDefinition = {
  name: string;
  description: string;
  previewKind: ToolPreviewKind;
  inputSchema: Record<string, unknown>;
};

export type ToolExecutionContext = {
  sessionId: SessionId;
  agentRunId: AgentRunId;
};

export type ToolExecutor = (
  input: Record<string, unknown>,
  context: ToolExecutionContext
) => Promise<ToolExecutionResult>;

export type RegisteredTool = {
  definition: ToolDefinition;
  execute: ToolExecutor;
};
