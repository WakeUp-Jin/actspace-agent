/**
 * Context 兼容层
 *
 * 保留旧版 ContextState/createEmptyContextState/createUsageSnapshot 接口，
 * 供 agent.ts 等现有消费者使用。
 *
 * 新代码应直接使用 context/ 目录下的 ContextManager 和模块。
 * 此文件将在所有消费者迁移后移除。
 */

import type {
  ContextUsageBucket,
  ContextUsageSnapshot,
  SessionEvent,
  SessionId
} from "@actspace/shared";
import { createEmptyBuckets } from "./context/token-estimator";

// Re-export 新 context 系统的所有导出
export * from "./context/index";

// ─── 旧版接口（向后兼容） ───

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
      buckets: createLegacyBuckets()
    }
  };
}

// 兼容层 bucket 也走共享注册表（单一事实来源），不再各自硬编码列表。
function createLegacyBuckets(): ContextUsageBucket[] {
  return createEmptyBuckets();
}

export function createUsageSnapshot(totalTokens: number, maxTokens = 200_000): ContextUsageSnapshot {
  const safeMaxTokens = Math.max(maxTokens, 1);
  return {
    totalTokens,
    maxTokens: safeMaxTokens,
    percentUsed: Math.min(100, Math.round((totalTokens / safeMaxTokens) * 100)),
    compressionCount: 0,
    cumulativeTokens: totalTokens,
    buckets: createLegacyBuckets()
  };
}
