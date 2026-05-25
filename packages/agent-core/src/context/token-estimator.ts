/**
 * Token 估算与 ContextUsageSnapshot 生成
 *
 * V0 使用 字符数 / 3.5 估算 Token 数量。
 * 不要求精确，但应稳定、可解释。
 */

import type {
  ContextUsageBucket,
  ContextUsageBucketName,
  ContextUsageSnapshot,
} from "@actspace/shared";
import type { Message } from "../messages";
import { getMessageText } from "../messages";

const CHARS_PER_TOKEN = 3.5;
const ESTIMATOR = { name: "char-ratio", version: "1" };

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function estimateMessagesTokens(messages: Message[]): number {
  return messages.reduce(
    (sum, msg) => sum + estimateTokens(getMessageText(msg)),
    0,
  );
}

// ─── Bucket 生成 ───

function createBucket(
  name: ContextUsageBucketName,
  label: string,
  tokens: number,
  colorToken: string,
): ContextUsageBucket {
  return { key: name, name, label, tokens, colorToken };
}

export function createEmptyBuckets(): ContextUsageBucket[] {
  return [
    createBucket("systemPrompt", "System prompt", 0, "context.system"),
    createBucket("tools", "Tools", 0, "context.tools"),
    createBucket("rules", "Rules", 0, "context.rules"),
    createBucket("skills", "Skills", 0, "context.skills"),
    createBucket("mcp", "MCP", 0, "context.mcp"),
    createBucket("subagents", "Subagents", 0, "context.subagents"),
    createBucket("conversation", "Conversation", 0, "context.conversation"),
  ];
}

export interface SnapshotInput {
  systemPromptTokens: number;
  toolsTokens: number;
  conversationTokens: number;
  maxTokens?: number;
  compressionCount?: number;
}

export function createContextUsageSnapshot(input: SnapshotInput): ContextUsageSnapshot {
  const maxTokens = input.maxTokens ?? 200_000;
  const totalTokens = input.systemPromptTokens + input.toolsTokens + input.conversationTokens;
  const safeMax = Math.max(maxTokens, 1);

  const buckets = createEmptyBuckets();
  const bucketMap = new Map(buckets.map((b) => [b.name, b]));
  bucketMap.get("systemPrompt")!.tokens = input.systemPromptTokens;
  bucketMap.get("tools")!.tokens = input.toolsTokens;
  bucketMap.get("conversation")!.tokens = input.conversationTokens;

  return {
    totalTokens,
    maxTokens: safeMax,
    percentUsed: Math.min(100, Math.round((totalTokens / safeMax) * 100)),
    compressionCount: input.compressionCount ?? 0,
    cumulativeTokens: totalTokens,
    estimator: ESTIMATOR,
    buckets,
  };
}
