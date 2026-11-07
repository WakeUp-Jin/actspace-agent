import type { ContextUsageSnapshot } from "@actspace/shared";
import type {
  RuntimeV2ProviderUsageProjection,
  RuntimeV2RequestContextEstimateProjection,
} from "@actspace/shared/runtime-v2";

/** Adapt the revision-bound provider usage projection to the existing Context visual contract. */
export function providerUsageToContextSnapshot(
  projection: RuntimeV2ProviderUsageProjection,
): ContextUsageSnapshot {
  const usage = projection.usage;
  return {
    totalTokens: usage.totalTokens,
    maxTokens: 0,
    percentUsed: 0,
    cumulativeTokens: usage.totalTokens,
    estimator: projection.estimator,
    buckets: [
      { key: "conversation", name: "conversation", label: "Conversation", tokens: usage.inputTokens + usage.outputTokens },
      { key: "tools", name: "tools", label: "Tool results", tokens: usage.cacheReadTokens + usage.cacheWriteTokens },
    ],
  };
}

/** 上下文估算投影派生出的用量快照（数字与面板「当前」同源）。 */
export function contextEstimateToSnapshot(
  projection: RuntimeV2RequestContextEstimateProjection,
): ContextUsageSnapshot {
  return projection.usage;
}
