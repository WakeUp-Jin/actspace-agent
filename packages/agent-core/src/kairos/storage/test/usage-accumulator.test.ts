import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KairosUsageAccumulator } from "../usage-accumulator";
import type { LlmUsagePayload, SessionEvent } from "@actspace/shared";

async function tmpFile(name = "usage-accumulator.json"): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "kairos-acc-"));
  return join(dir, name);
}

function makeUsage(over: Partial<LlmUsagePayload> = {}): LlmUsagePayload {
  return {
    callId: `call_${Math.random().toString(36).slice(2)}`,
    provider: "deepseek",
    model: "deepseek-v4-flash",
    modelId: "deepseek-v4-flash",
    promptTokens: 1_000,
    completionTokens: 200,
    totalTokens: 1_200,
    cacheHitTokens: 0,
    cacheMissTokens: 1_000,
    cost: { input: 0.001, output: 0.0002, cacheRead: 0, cacheWrite: 0, total: 0.0012, currency: "USD" },
    ...over,
  };
}

/**
 * `KairosUsageAccumulator` 双维度行为单测——
 * controller 之外、shared 聚合函数之上的运行时层；覆盖：
 * - 双维度累加正确性 + 币种状态机；
 * - 持久化（v2 schema 写盘 / 重建）；
 * - **resetSinceReset 不动 lifetime**（这是 v2 vs v1 的核心差异）；
 * - v1 → v2 schema 自动迁移；
 * - 文件丢失时从 events 重建 lifetime + sinceReset 归零。
 */
describe("KairosUsageAccumulator", () => {
  it("两个维度同步累加同一条 payload", async () => {
    const acc = new KairosUsageAccumulator({ filePath: await tmpFile(), debounceMs: 5 });
    await acc.load(async () => []);

    acc.accumulate(makeUsage({ promptTokens: 100, completionTokens: 50, totalTokens: 150 }));
    acc.accumulate(makeUsage({ promptTokens: 200, completionTokens: 100, totalTokens: 300 }));

    const lifetime = acc.getLifetimeSummary();
    const sinceReset = acc.getSinceResetSummary();
    expect(lifetime.callCount).toBe(2);
    expect(lifetime.totalTokens).toBe(450);
    expect(sinceReset.callCount).toBe(2);
    expect(sinceReset.totalTokens).toBe(450);
    expect(sinceReset.cost).toBeCloseTo(lifetime.cost, 6);
  });

  it("混合币种时两个维度都标记为 MIXED", async () => {
    const acc = new KairosUsageAccumulator({ filePath: await tmpFile(), debounceMs: 5 });
    await acc.load(async () => []);

    acc.accumulate(makeUsage({
      cost: { input: 0.001, output: 0.0002, cacheRead: 0, cacheWrite: 0, total: 0.0012, currency: "USD" },
    }));
    acc.accumulate(makeUsage({
      cost: { input: 0.01, output: 0.005, cacheRead: 0, cacheWrite: 0, total: 0.015, currency: "CNY" },
    }));

    expect(acc.getLifetimeSummary().currency).toBe("MIXED");
    expect(acc.getSinceResetSummary().currency).toBe("MIXED");
  });

  it("resetSinceReset() 只清阶段维度，lifetime 保留", async () => {
    const filePath = await tmpFile();
    const acc = new KairosUsageAccumulator({ filePath, debounceMs: 5 });
    await acc.load(async () => []);

    acc.accumulate(makeUsage({ promptTokens: 800, completionTokens: 200, totalTokens: 1_000 }));
    acc.accumulate(makeUsage({ promptTokens: 400, completionTokens: 100, totalTokens: 500 }));

    await acc.resetSinceReset();

    const lifetime = acc.getLifetimeSummary();
    const sinceReset = acc.getSinceResetSummary();
    expect(lifetime.callCount).toBe(2);
    expect(lifetime.totalTokens).toBe(1_500);
    expect(sinceReset.callCount).toBe(0);
    expect(sinceReset.totalTokens).toBe(0);
    expect(sinceReset.cost).toBe(0);

    // 文件应仍然存在，lifetime 段保留 + sinceReset 段已清零
    const persisted = JSON.parse(await readFile(filePath, "utf8"));
    expect(persisted.schemaVersion).toBe(2);
    expect(persisted.lifetime.summary.callCount).toBe(2);
    expect(persisted.sinceReset.summary.callCount).toBe(0);
  });

  it("写盘后再加载能恢复两份维度", async () => {
    const filePath = await tmpFile();
    const acc1 = new KairosUsageAccumulator({ filePath, debounceMs: 5 });
    await acc1.load(async () => []);
    acc1.accumulate(makeUsage({ promptTokens: 800, completionTokens: 200, totalTokens: 1_000 }));
    await acc1.resetSinceReset();
    acc1.accumulate(makeUsage({ promptTokens: 100, completionTokens: 50, totalTokens: 150 }));
    await acc1.flush();

    const acc2 = new KairosUsageAccumulator({ filePath, debounceMs: 5 });
    await acc2.load(async () => []);
    expect(acc2.getLifetimeSummary().callCount).toBe(2);
    expect(acc2.getLifetimeSummary().totalTokens).toBe(1_150);
    expect(acc2.getSinceResetSummary().callCount).toBe(1);
    expect(acc2.getSinceResetSummary().totalTokens).toBe(150);
  });

  it("v1 schema 自动迁移：旧 summary 同时拷贝到 lifetime 和 sinceReset", async () => {
    const filePath = await tmpFile();
    await writeFile(
      filePath,
      JSON.stringify({
        schemaVersion: 1,
        summary: {
          callCount: 3,
          promptTokens: 600,
          completionTokens: 150,
          totalTokens: 750,
          reasoningTokens: 0,
          cacheHitTokens: 200,
          cacheMissTokens: 400,
          cost: 0.05,
          currency: "CNY",
        },
        seenCurrency: "CNY",
        currencyMixed: false,
        lastUpdatedAt: new Date().toISOString(),
      }),
      "utf8",
    );

    const acc = new KairosUsageAccumulator({ filePath, debounceMs: 5 });
    await acc.load(async () => []);

    const lifetime = acc.getLifetimeSummary();
    const sinceReset = acc.getSinceResetSummary();
    expect(lifetime.callCount).toBe(3);
    expect(lifetime.totalTokens).toBe(750);
    expect(lifetime.currency).toBe("CNY");
    expect(sinceReset.callCount).toBe(3);
    expect(sinceReset.totalTokens).toBe(750);
    expect(sinceReset.currency).toBe("CNY");

    // flush 一次让文件升到 v2
    await acc.flush();
    const persisted = JSON.parse(await readFile(filePath, "utf8"));
    expect(persisted.schemaVersion).toBe(2);
  });

  it("accumulator 文件缺失/损坏时从 events 重建 lifetime，sinceReset 归零", async () => {
    const filePath = await tmpFile();
    await writeFile(filePath, "{ this is not valid", "utf8");

    const events: SessionEvent[] = [
      {
        id: "u1",
        sessionId: "kairos-2026-05-28",
        agentRunId: "t1",
        type: "llm_usage",
        timestamp: new Date().toISOString(),
        schemaVersion: 1,
        payload: makeUsage({ promptTokens: 1_000, completionTokens: 200, totalTokens: 1_200 }),
      },
      {
        id: "u2",
        sessionId: "kairos-2026-05-28",
        agentRunId: "t2",
        type: "llm_usage",
        timestamp: new Date().toISOString(),
        schemaVersion: 1,
        payload: makeUsage({ promptTokens: 500, completionTokens: 100, totalTokens: 600 }),
      },
    ];

    const acc = new KairosUsageAccumulator({ filePath, debounceMs: 5 });
    await acc.load(async () => events);

    const lifetime = acc.getLifetimeSummary();
    const sinceReset = acc.getSinceResetSummary();
    expect(lifetime.callCount).toBe(2);
    expect(lifetime.totalTokens).toBe(1_800);
    // sinceReset 保守归零——reset 边界只能由 accumulator 文件维护，文件丢了就推断不出
    expect(sinceReset.callCount).toBe(0);
    expect(sinceReset.totalTokens).toBe(0);
  });
});
