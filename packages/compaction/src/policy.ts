export type CompactionPolicy = {
  readonly reserveTokens: number;
  readonly triggerRatio: number;
  readonly minimumRegionEntries: number;
};

export type TokenUsage = import("@actspace/context").CompactionUsage;

export const DEFAULT_COMPACTION_POLICY: CompactionPolicy = Object.freeze({ reserveTokens: 16_000, triggerRatio: 0.8, minimumRegionEntries: 4 });

export function shouldCompact(usage: TokenUsage, policy: CompactionPolicy): boolean {
  const capacity = usage.contextWindow;
  if (typeof capacity !== "number" || !Number.isFinite(capacity) || capacity <= 0) return false;
  const threshold = Math.min(Math.floor(capacity * policy.triggerRatio), Math.max(1, capacity - policy.reserveTokens));
  return usage.inputTokens + usage.outputTokens >= threshold;
}
