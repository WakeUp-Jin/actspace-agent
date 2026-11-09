// 上下文用量快照与上下文状态（上下文面板、`context_snapshot` 事件 payload 的类型）。

import type { ContextUsageBucketName } from "../context-buckets";
import type { AgentRunId, EventId, SessionId } from "./primitives";

export type ContextUsageBucket = {
  name?: ContextUsageBucketName;
  key?: ContextUsageBucketName;
  label?: string;
  tokens: number;
  colorToken?: string;
};

export type ContextUsageSnapshot = {
  throughJournalSeq?: number;
  basis?: "current-request" | "last-request" | "next-request";
  requestId?: string;
  totalTokens: number;
  maxTokens: number;
  percentUsed: number;
  compressionCount?: number;
  cumulativeTokens?: number;
  cumulativeUsage?: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };
  estimator?: {
    name: string;
    version: string;
  };
  buckets: ContextUsageBucket[];
};

export type ContextStateEntry = {
  id: string;
  kind:
    | "systemPrompt"
    | "toolDefinitions"
    | "rules"
    | "skills"
    | "summarizedConversation"
    | "conversation";
  title: string;
  estimatedTokens: number;
  included: boolean;
  pinned?: boolean;
  removable?: boolean;
  sourceEventIds?: EventId[];
  contentHash?: string;
  preview?: string;
};

export type ContextState = {
  throughJournalSeq?: number;
  basis?: ContextUsageSnapshot["basis"];
  requestId?: string;
  sessionId: SessionId;
  activeAgentRunId?: AgentRunId;
  updatedAt: string;
  estimator: {
    name: string;
    version: string;
  };
  totalEstimatedTokens: number;
  maxTokens: number;
  percentUsed: number;
  buckets: ContextUsageBucket[];
  entries: ContextStateEntry[];
};
