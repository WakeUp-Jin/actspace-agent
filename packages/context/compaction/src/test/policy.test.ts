import { expect, it } from "vitest";
import { DEFAULT_COMPACTION_POLICY, shouldCompact } from "../policy.js";

it("uses the actual model capacity and the configured ratio without subtracting reserve twice", () => {
  const policy = { ...DEFAULT_COMPACTION_POLICY, triggerRatio: 0.5 };
  expect(shouldCompact({ inputTokens: 60_660, outputTokens: 54, contextWindow: 256_000 }, policy)).toBe(false);
  expect(shouldCompact({ inputTokens: 127_900, outputTokens: 99, contextWindow: 256_000 }, policy)).toBe(false);
  expect(shouldCompact({ inputTokens: 127_900, outputTokens: 100, contextWindow: 256_000 }, policy)).toBe(true);
  expect(shouldCompact({ inputTokens: 128_000, outputTokens: 0, contextWindow: 1_000_000 }, policy)).toBe(false);
  expect(shouldCompact({ inputTokens: 500_000, outputTokens: 0, contextWindow: 1_000_000 }, policy)).toBe(true);
});

it("keeps reserve as a separate capacity ceiling and does not guess unknown capacity", () => {
  expect(shouldCompact({ inputTokens: 240_000, outputTokens: 0, contextWindow: 256_000 }, { ...DEFAULT_COMPACTION_POLICY, triggerRatio: 1 })).toBe(true);
  for (const contextWindow of [null, 0, NaN]) expect(shouldCompact({ inputTokens: 500_000, outputTokens: 0, contextWindow }, DEFAULT_COMPACTION_POLICY)).toBe(false);
});
