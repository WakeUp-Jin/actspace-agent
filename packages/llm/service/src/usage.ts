export type LlmUsage = {
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly cacheReadTokens: number | null;
  readonly cacheWriteTokens: number | null;
  readonly reasoningTokens: number | null;
  readonly cost: number | null;
  readonly costCurrency: string | null;
  readonly source: "provider-reported" | "estimated" | "unknown";
};

export const EMPTY_LLM_USAGE: LlmUsage = Object.freeze({ inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null, reasoningTokens: null, cost: null, costCurrency: null, source: "unknown" });
