/**
 * Token 估算与 ContextUsageSnapshot 生成
 *
 * V0 使用 字符数 / 3.5 估算 Token 数量。
 * 不要求精确，但应稳定、可解释。
 */

import type {
  ContextUsageBucket,
  ContextUsageSnapshot,
} from "@actspace/shared";
import { CONTEXT_BUCKET_REGISTRY } from "@actspace/shared";
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

/**
 * 从共享注册表生成空 bucket 列表（单一事实来源）。
 * 新增上下文类型时只改 `@actspace/shared` 的 CONTEXT_BUCKET_REGISTRY，这里自动跟随。
 */
export function createEmptyBuckets(): ContextUsageBucket[] {
  return CONTEXT_BUCKET_REGISTRY.map((bucket) => ({
    key: bucket.key,
    name: bucket.key,
    label: bucket.label,
    tokens: 0,
    colorToken: bucket.colorVar,
  }));
}

export interface SnapshotInput {
  systemPromptTokens: number;
  rulesTokens?: number;
  toolsTokens: number;
  conversationTokens: number;
  /** 压缩摘要消息（source:"compaction"）的估算 token，单独成桶展示 */
  summarizedConversationTokens?: number;
  maxTokens?: number;
  compressionCount?: number;
}

export function createContextUsageSnapshot(input: SnapshotInput): ContextUsageSnapshot {
  const maxTokens = input.maxTokens ?? 200_000;
  const summarizedConversationTokens = input.summarizedConversationTokens ?? 0;
  const rulesTokens = input.rulesTokens ?? 0;
  const totalTokens =
    input.systemPromptTokens +
    rulesTokens +
    input.toolsTokens +
    input.conversationTokens +
    summarizedConversationTokens;
  const safeMax = Math.max(maxTokens, 1);

  const buckets = createEmptyBuckets();
  const bucketMap = new Map(buckets.map((b) => [b.name, b]));
  bucketMap.get("systemPrompt")!.tokens = input.systemPromptTokens;
  bucketMap.get("rules")!.tokens = rulesTokens;
  bucketMap.get("tools")!.tokens = input.toolsTokens;
  bucketMap.get("summarizedConversation")!.tokens = summarizedConversationTokens;
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
