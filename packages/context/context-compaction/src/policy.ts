export type CompactionPolicy = {
  readonly reserveTokens: number;
  readonly triggerRatio: number;
  readonly minimumRegionEntries: number;
};

export type TokenUsage = import("@actspace/context-engine").CompactionUsage;

export const DEFAULT_COMPACTION_POLICY: CompactionPolicy = Object.freeze({ reserveTokens: 16_000, triggerRatio: 0.8, minimumRegionEntries: 4 });

export function compactionThreshold(capacity: number | null, policy: CompactionPolicy): number | null {
  if (typeof capacity !== "number" || !Number.isFinite(capacity) || capacity <= 0) return null;
  return Math.min(Math.floor(capacity * policy.triggerRatio), Math.max(1, capacity - policy.reserveTokens));
}
export function shouldCompact(usage: TokenUsage, policy: CompactionPolicy): boolean {
  const threshold = compactionThreshold(usage.contextWindow, policy);
  return threshold !== null && usage.inputTokens + usage.outputTokens >= threshold;
}
