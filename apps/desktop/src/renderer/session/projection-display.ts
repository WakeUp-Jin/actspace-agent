import type { ContextUsageSnapshot } from "@actspace/shared";
import type { RuntimeRequestContextEstimateProjection } from "@actspace/shared/runtime-v2";

/** 上下文估算投影派生出的用量快照（数字与面板「当前」同源）。 */
export function contextEstimateToSnapshot(projection: RuntimeRequestContextEstimateProjection): ContextUsageSnapshot {
  return projection.usage;
}
