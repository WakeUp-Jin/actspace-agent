import type {
  ContextUsageBucket,
  ContextUsageSnapshot,
  SessionEvent,
  SessionId
} from "@actspace/shared";

export type ContextState = {
  sessionId: SessionId;
  events: SessionEvent[];
  usage: ContextUsageSnapshot;
};

export function createEmptyContextState(sessionId: SessionId): ContextState {
  return {
    sessionId,
    events: [],
    usage: {
      totalTokens: 0,
      maxTokens: 200_000,
      percentUsed: 0,
      compressionCount: 0,
      cumulativeTokens: 0,
      buckets: createEmptyBuckets()
    }
  };
}

export function createEmptyBuckets(): ContextUsageBucket[] {
  return [
    { key: "systemPrompt", name: "systemPrompt", label: "System prompt", tokens: 0, colorToken: "context.system" },
    { key: "tools", name: "tools", label: "Tools", tokens: 0, colorToken: "context.tools" },
    { key: "rules", name: "rules", label: "Rules", tokens: 0, colorToken: "context.rules" },
    { key: "skills", name: "skills", label: "Skills", tokens: 0, colorToken: "context.skills" },
    { key: "mcp", name: "mcp", label: "MCP", tokens: 0, colorToken: "context.mcp" },
    { key: "subagents", name: "subagents", label: "Subagents", tokens: 0, colorToken: "context.subagents" },
    { key: "conversation", name: "conversation", label: "Conversation", tokens: 0, colorToken: "context.conversation" }
  ];
}

export function createUsageSnapshot(totalTokens: number, maxTokens = 200_000): ContextUsageSnapshot {
  const safeMaxTokens = Math.max(maxTokens, 1);
  return {
    totalTokens,
    maxTokens: safeMaxTokens,
    percentUsed: Math.min(100, Math.round((totalTokens / safeMaxTokens) * 100)),
    compressionCount: 0,
    cumulativeTokens: totalTokens,
    buckets: createEmptyBuckets()
  };
}
