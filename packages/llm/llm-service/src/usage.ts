import type { UsageCostProvenance } from "@actspace/shared";
export type LlmUsage = {
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly cacheReadTokens: number | null;
  readonly cacheWriteTokens: number | null;
  /** Anthropic 1 小时缓存写入，是 cacheWriteTokens 的一部分；缺省按全是 5 分钟写入计价。 */
  readonly cacheWrite1hTokens?: number | null;
  readonly reasoningTokens: number | null;
  readonly costProvenance?: UsageCostProvenance;
  readonly cost: number | null;
  readonly costCurrency: string | null;
  readonly source: "provider-reported" | "estimated" | "unknown";
};

export const EMPTY_LLM_USAGE: LlmUsage = Object.freeze({ inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null, reasoningTokens: null, cost: null, costCurrency: null, source: "unknown" });
