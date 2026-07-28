import { describe, expect, it } from "vitest";
import { calculateUsageCost } from "../cost";

describe("calculateUsageCost", () => {
  it("prices cache writes separately instead of charging them again as uncached input", () => {
    const cost = calculateUsageCost({
      inputTokens: 1_000_000,
      outputTokens: 100_000,
      totalTokens: 1_100_000,
      cacheHitTokens: 200_000,
      cacheMissTokens: 800_000,
      cacheWriteTokens: 300_000,
    }, {
      currency: "USD",
      inputCacheHitPerMillion: 0.5,
      inputCacheMissPerMillion: 5,
      inputCacheWritePerMillion: 6.25,
      outputPerMillion: 30,
    });

    expect(cost).toEqual({
      input: 2.5,
      output: 3,
      cacheRead: 0.1,
      cacheWrite: 1.875,
      total: 7.475,
      currency: "USD",
    });
  });
});
