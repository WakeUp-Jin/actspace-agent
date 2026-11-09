// 会话模型里到处用的标识符别名与最小公共结构。

export type SessionId = string;
export type AgentRunId = string;
export type TurnId = string;
export type LlmCallId = string;
export type EventId = string;
export type ToolCallId = string;

export type SessionError = {
  code: string;
  message: string;
  recoverable: boolean;
  details?: string;
};

export type LlmUsageCost = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
  currency: "USD" | "CNY";
};
