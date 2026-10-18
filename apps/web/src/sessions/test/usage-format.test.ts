import type { TurnUsageSummary } from "@actspace/shared";
import { formatTokens, turnUsageView } from "../usage-format";

const usage = (extra: Partial<TurnUsageSummary> = {}): TurnUsageSummary => ({
  totalTokens: 88_400, inputTokens: 4_000, cacheReadTokens: 76_000, cacheWriteTokens: 2_000, outputTokens: 6_400, reasoningTokens: 1_200,
  routes: ["deepseek / deepseek-chat"], costUsd: 0.0123, unpricedRequestCount: 0, costEstimated: true, ...extra,
} as TurnUsageSummary);

it("formats compact token counts", () => {
  expect(formatTokens(950)).toBe("950");
  expect(formatTokens(88_400)).toBe("88.4K");
});

it("builds the usage pill label and rows in desktop order", () => {
  const view = turnUsageView(usage())!;
  expect(view.label).toBe("用量 88.4K tok");
  expect(view.rows.map(row => row.label)).toEqual(["提供方 / 模型", "缓存命中", "未缓存输入", "缓存读取", "缓存写入", "输出", "花费"]);
  expect(view.rows.find(row => row.label === "输出")?.note).toBe("其中推理 1,200 tok");
  expect(view.rows.find(row => row.label === "花费")?.note).toBe("预估");
});

it("reports unknown cost when some requests are unpriced, and hides empty usage", () => {
  expect(turnUsageView(usage({ unpricedRequestCount: 1, costUsd: 0 }))!.rows.at(-1)?.value).toBe("未知");
  expect(turnUsageView(usage({ unpricedRequestCount: 1 }))!.rows.at(-1)?.value).toBe("部分未知");
  expect(turnUsageView(usage({ totalTokens: 0 }))).toBeNull();
  expect(turnUsageView(undefined)).toBeNull();
});
