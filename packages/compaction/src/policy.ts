export type CompactionPolicy = {
  readonly contextLimitTokens: number;
  readonly reserveTokens: number;
  readonly triggerRatio: number;
  readonly minimumRegionEntries: number;
};

export type TokenUsage = { readonly inputTokens: number; readonly outputTokens: number };

export const DEFAULT_COMPACTION_POLICY: CompactionPolicy = Object.freeze({ contextLimitTokens: 128_000, reserveTokens: 16_000, triggerRatio: 0.8, minimumRegionEntries: 4 });

export function shouldCompact(usage: TokenUsage, policy: CompactionPolicy): boolean {
  return usage.inputTokens + usage.outputTokens >= Math.floor(policy.contextLimitTokens * policy.triggerRatio) - policy.reserveTokens;
}
