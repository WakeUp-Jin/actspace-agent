import { describe, expect, it } from "vitest";
import type { TurnUsageSummary } from "@actspace/shared";
import { turnUsageModel } from "../components/conversation/turn-usage";

function usage(overrides: Partial<TurnUsageSummary> = {}): TurnUsageSummary {
  return { totalTokens: 88_035, inputTokens: 20_462, cacheReadTokens: 64_512, cacheWriteTokens: 0, outputTokens: 3_061, reasoningTokens: 0, routes: ["deepseek/deepseek-flash"], costUsd: 0.0123, unpricedRequestCount: 0, costEstimated: false, ...overrides };
}

describe("turnUsageModel", () => {
  it("formats the DeepSeek Harness buckets plus cost", () => {
    expect(turnUsageModel(usage())).toEqual({
      label: "用量 88K tok",
      total: "88,035 tok",
      routes: "deepseek/deepseek-flash",
      cacheHit: "75.9",
      input: "20,462 tok",
      cacheRead: "64,512 tok",
      cacheWrite: "0 tok",
      output: "3,061 tok",
      reasoning: null,
      cost: { kind: "known", text: "$0.0123", estimated: false },
    });
  });

  it("hides the pill when nothing was used", () => {
    expect(turnUsageModel(undefined)).toBeNull();
    expect(turnUsageModel(usage({ totalTokens: 0 }))).toBeNull();
  });

  it("drops empty routes, keeps reasoning, and marks estimated cost", () => {
    const model = turnUsageModel(usage({ routes: [], reasoningTokens: 1_200, costEstimated: true }));
    expect(model).toMatchObject({ routes: null, reasoning: "1,200 tok", cost: { kind: "known", estimated: true } });
  });

  it("never shows an undercounted cost when some requests have no price", () => {
    expect(turnUsageModel(usage({ unpricedRequestCount: 1 }))?.cost).toEqual({ kind: "unknown", text: "部分未知" });
    expect(turnUsageModel(usage({ unpricedRequestCount: 2, costUsd: 0 }))?.cost).toEqual({ kind: "unknown", text: "未知" });
  });
});
