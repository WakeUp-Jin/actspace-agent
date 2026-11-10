import type { ContextUsageSnapshot } from "@actspace/shared";
import type {
  RuntimeV2RequestContextEstimateProjection,
} from "@actspace/shared/runtime-v2";

/** 上下文估算投影派生出的用量快照（数字与面板「当前」同源）。 */
export function contextEstimateToSnapshot(
  projection: RuntimeV2RequestContextEstimateProjection,
): ContextUsageSnapshot {
  return projection.usage;
}
