import { describe, it, expect } from "vitest";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createKairos } from "../controller";
import { ToolManager } from "../../tools/manager";
import { MockLLMService, mockText, mockToolCall } from "../../llm/services/mock";
import { createEmptyUsage } from "../../messages";
import type { AssistantMessage } from "../../messages";
import type { KairosRuntimeState, SessionEvent } from "@actspace/shared";

async function makeRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "kairos-ctrl-test-"));
}

async function writeConfig(root: string, files: Record<string, string>): Promise<void> {
  await mkdir(join(root, "config"), { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(root, "config", name), content, "utf8");
  }
}

function makeToolManagerFactory() {
  return () => new ToolManager({ workspaceRoot: "/tmp/work" });
}

describe("createKairos", () => {
  it("returns stopped state when preferences.enabled=false and start() is called without force", async () => {
    const root = await makeRoot();
    await writeConfig(root, {
      "preferences.json": JSON.stringify({ enabled: false }),
    });
    const llm = new MockLLMService({ provider: "mock", apiKey: "k", model: "m" });

    const ctrl = await createKairos({
      kairosRoot: root,
      llm,
      toolManagerFactory: makeToolManagerFactory(),
      contextWindow: 8000,
    });
    await ctrl.start();
    expect(ctrl.getState().state).toBe("stopped");
    expect(ctrl.getState().enabled).toBe(false);
    await ctrl.stop();
  });

  it("start({ force: true }) ignores preferences.enabled=false and runs at least one tick", async () => {
    const root = await makeRoot();
    await writeConfig(root, {
      "preferences.json": JSON.stringify({
        enabled: false,
        sleepRangeSeconds: { min: 1, max: 5, default: 1 },
        circuitBreaker: { errorThreshold: 5, cooldownSec: 1 },
      }),
    });
    const llm = new MockLLMService({ provider: "mock", apiKey: "k", model: "m" });
    llm.setResponses([
      mockToolCall("sleep", { seconds: 1 }, { id: "tc1" }),
      mockText("hello"),
    ]);
    const ctrl = await createKairos({
      kairosRoot: root,
      llm,
      toolManagerFactory: makeToolManagerFactory(),
      contextWindow: 8000,
      firstTickDelayMs: 0,
    });

    await ctrl.start({ force: true });
    expect(ctrl.getState().enabled).toBe(true);
    expect(ctrl.getState().state).not.toBe("stopped");
    // 让 first tick 跑起来
    await new Promise((r) => setTimeout(r, 600));
    await ctrl.stop();
    const buffer = ctrl.getRecentEvents(50);
    expect(buffer.some((e) => e.type === "kairos_tick_injected")).toBe(true);
  });

  it("starts processor when enabled, runs at least one tick, and exposes events through ring buffer", async () => {
    const root = await makeRoot();
    await writeConfig(root, {
      "preferences.json": JSON.stringify({
        enabled: true,
        sleepRangeSeconds: { min: 1, max: 5, default: 1 },
        circuitBreaker: { errorThreshold: 5, cooldownSec: 1 },
      }),
    });

    const llm = new MockLLMService({ provider: "mock", apiKey: "k", model: "m" });
    llm.setResponses([
      mockToolCall("sleep", { seconds: 1 }, { id: "tc1" }),
      mockText("hello"),
      mockToolCall("sleep", { seconds: 1 }, { id: "tc2" }),
      mockText("again"),
    ]);

    const ctrl = await createKairos({
      kairosRoot: root,
      llm,
      toolManagerFactory: makeToolManagerFactory(),
      contextWindow: 8000,
      firstTickDelayMs: 0,
    });

    const seenEvents: SessionEvent[] = [];
    ctrl.on("event", (e) => {
      seenEvents.push(e as SessionEvent);
    });

    await ctrl.start();
    // 让首 tick 跑完 + 进入 sleep
    await new Promise((r) => setTimeout(r, 1200));
    await ctrl.stop();

    const buffer = ctrl.getRecentEvents(200);
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.some((e) => e.type === "kairos_tick_injected")).toBe(true);
    expect(buffer.some((e) => e.type === "tool_call")).toBe(true);
    // 同一组事件 emit 给订阅者
    expect(seenEvents.length).toBeGreaterThan(0);
  });

  it("emits a final disabled stopped state after stop()", async () => {
    const root = await makeRoot();
    await writeConfig(root, {
      "preferences.json": JSON.stringify({
        enabled: true,
        sleepRangeSeconds: { min: 1, max: 5, default: 1 },
        circuitBreaker: { errorThreshold: 5, cooldownSec: 1 },
      }),
    });

    const llm = new MockLLMService({ provider: "mock", apiKey: "k", model: "m" });
    llm.setResponses([mockToolCall("sleep", { seconds: 1 }, { id: "tc1" }), mockText("hello")]);

    const ctrl = await createKairos({
      kairosRoot: root,
      llm,
      toolManagerFactory: makeToolManagerFactory(),
      contextWindow: 8000,
      firstTickDelayMs: 0,
    });

    const seenStates: KairosRuntimeState[] = [];
    ctrl.on("state", (state) => {
      seenStates.push(state);
    });

    await ctrl.start();
    await new Promise((r) => setTimeout(r, 300));
    await ctrl.stop();

    expect(seenStates.length).toBeGreaterThan(0);
    expect(seenStates.at(-1)).toMatchObject({
      enabled: false,
      state: "stopped",
    });
    expect(ctrl.getState()).toMatchObject({
      enabled: false,
      state: "stopped",
    });
  });

  it("reloadConfig updates internal config (verify by re-loading writes)", async () => {
    const root = await makeRoot();
    await writeConfig(root, { "preferences.json": JSON.stringify({ enabled: false }) });
    const llm = new MockLLMService({ provider: "mock", apiKey: "k", model: "m" });
    const ctrl = await createKairos({
      kairosRoot: root,
      llm,
      toolManagerFactory: makeToolManagerFactory(),
      contextWindow: 8000,
    });
    await ctrl.start();

    // 改 preferences 文件 → reload
    await writeConfig(root, { "preferences.json": JSON.stringify({ enabled: true }) });
    const reloaded = await ctrl.reloadConfig();
    expect(reloaded.preferences.enabled).toBe(true);
    await ctrl.stop();
  });

  it("setEnabledPreference(true) flips enabled while preserving other fields and reloads", async () => {
    const root = await makeRoot();
    await writeConfig(root, {
      "preferences.json": JSON.stringify({
        tip: "保留这个字段",
        enabled: false,
        sleepRangeSeconds: { min: 30, max: 900, default: 120 },
        someCustomField: "should be preserved",
      }),
    });
    const llm = new MockLLMService({ provider: "mock", apiKey: "k", model: "m" });
    const ctrl = await createKairos({
      kairosRoot: root,
      llm,
      toolManagerFactory: makeToolManagerFactory(),
      contextWindow: 8000,
    });

    await ctrl.setEnabledPreference(true);

    const raw = await readFile(join(root, "config", "preferences.json"), "utf8");
    const parsed = JSON.parse(raw);
    expect(parsed.enabled).toBe(true);
    expect(parsed.tip).toBe("保留这个字段");
    expect(parsed.someCustomField).toBe("should be preserved");
    expect(parsed.sleepRangeSeconds).toEqual({ min: 30, max: 900, default: 120 });

    // reload 之后内存 config 也应同步
    const reloaded = await ctrl.reloadConfig();
    expect(reloaded.preferences.enabled).toBe(true);

    await ctrl.stop();
  });

  it("setEnabledPreference(false) does the inverse without losing fields", async () => {
    const root = await makeRoot();
    await writeConfig(root, {
      "preferences.json": JSON.stringify({ enabled: true, tip: "x" }),
    });
    const llm = new MockLLMService({ provider: "mock", apiKey: "k", model: "m" });
    const ctrl = await createKairos({
      kairosRoot: root,
      llm,
      toolManagerFactory: makeToolManagerFactory(),
      contextWindow: 8000,
    });
    await ctrl.setEnabledPreference(false);
    const parsed = JSON.parse(await readFile(join(root, "config", "preferences.json"), "utf8"));
    expect(parsed.enabled).toBe(false);
    expect(parsed.tip).toBe("x");
    await ctrl.stop();
  });

  it("setEnabledPreference creates preferences.json when missing", async () => {
    const root = await makeRoot();
    // 不预写 preferences.json
    await mkdir(join(root, "config"), { recursive: true });
    const llm = new MockLLMService({ provider: "mock", apiKey: "k", model: "m" });
    const ctrl = await createKairos({
      kairosRoot: root,
      llm,
      toolManagerFactory: makeToolManagerFactory(),
      contextWindow: 8000,
    });
    await ctrl.setEnabledPreference(true);
    const parsed = JSON.parse(await readFile(join(root, "config", "preferences.json"), "utf8"));
    expect(parsed.enabled).toBe(true);
    await ctrl.stop();
  });

  it("setEnabledPreference throws when preferences.json is invalid JSON", async () => {
    const root = await makeRoot();
    await writeConfig(root, {
      "preferences.json": "{ this is not valid json",
    });
    const llm = new MockLLMService({ provider: "mock", apiKey: "k", model: "m" });
    const ctrl = await createKairos({
      kairosRoot: root,
      llm,
      toolManagerFactory: makeToolManagerFactory(),
      contextWindow: 8000,
    });
    await expect(ctrl.setEnabledPreference(true)).rejects.toThrow(/解析失败/);
    await ctrl.stop();
  });

  it("resetToday clears ring buffer and counters", async () => {
    const root = await makeRoot();
    await writeConfig(root, { "preferences.json": JSON.stringify({ enabled: true }) });
    const llm = new MockLLMService({ provider: "mock", apiKey: "k", model: "m" });
    llm.setResponses([mockText("ok")]);
    const ctrl = await createKairos({
      kairosRoot: root,
      llm,
      toolManagerFactory: makeToolManagerFactory(),
      contextWindow: 8000,
      firstTickDelayMs: 0,
    });
    await ctrl.start();
    await new Promise((r) => setTimeout(r, 500));
    expect(ctrl.getRecentEvents(50).length).toBeGreaterThan(0);
    await ctrl.resetToday();
    expect(ctrl.getRecentEvents(50).length).toBe(0);
    expect(ctrl.getState().todayTickCount).toBe(0);
    await ctrl.stop();
  });

  // ─── usageLifetime / usageSinceReset 双维度累加器 ───

  /**
   * 构造一个带 usage 的 AssistantMessage，便于驱动 runner 产出 llm_usage event。
   * `mockText` 默认走 `createEmptyUsage()`，所有字段为 0 → runner 会跳过 llm_usage，
   * 因此专门写一个 helper 注入真实 token 数。
   */
  function mockTextWithUsage(text: string, usage: { input: number; output: number; total: number }): AssistantMessage {
    return {
      role: "assistant",
      content: [{ type: "text", text }],
      model: "mock-model",
      provider: "mock",
      usage: {
        ...createEmptyUsage(),
        input: usage.input,
        output: usage.output,
        totalTokens: usage.total,
      },
      stopReason: "stop",
      timestamp: Date.now(),
      source: "llm",
    };
  }

  it("累加 lifetime 与 sinceReset 两份维度并通过 getState() 暴露", async () => {
    const root = await makeRoot();
    await writeConfig(root, {
      "preferences.json": JSON.stringify({
        enabled: true,
        sleepRangeSeconds: { min: 1, max: 5, default: 1 },
      }),
    });
    const llm = new MockLLMService({ provider: "mock", apiKey: "k", model: "m" });
    llm.setResponses([
      mockTextWithUsage("hello", { input: 200, output: 50, total: 250 }),
      mockTextWithUsage("again", { input: 300, output: 100, total: 400 }),
    ]);

    const ctrl = await createKairos({
      kairosRoot: root,
      llm,
      toolManagerFactory: makeToolManagerFactory(),
      contextWindow: 8000,
      firstTickDelayMs: 0,
    });

    await ctrl.start();
    await new Promise((r) => setTimeout(r, 700));
    await ctrl.wakeNow();
    await new Promise((r) => setTimeout(r, 700));
    await ctrl.stop();

    const state = ctrl.getState();
    // 还没 reset，两份维度应该完全相等。
    expect(state.usageLifetime.callCount).toBeGreaterThanOrEqual(1);
    expect(state.usageSinceReset.callCount).toBe(state.usageLifetime.callCount);
    expect(state.usageSinceReset.totalTokens).toBe(state.usageLifetime.totalTokens);
    expect(state.usageSinceReset.cost).toBeCloseTo(state.usageLifetime.cost, 6);
  });

  it("resetToday() 只清 sinceReset，保留 lifetime + accumulator 文件", async () => {
    const root = await makeRoot();
    await writeConfig(root, { "preferences.json": JSON.stringify({ enabled: true }) });
    const llm = new MockLLMService({ provider: "mock", apiKey: "k", model: "m" });
    llm.setResponses([mockTextWithUsage("first", { input: 1_000, output: 500, total: 1_500 })]);
    const ctrl = await createKairos({
      kairosRoot: root,
      llm,
      toolManagerFactory: makeToolManagerFactory(),
      contextWindow: 8000,
      firstTickDelayMs: 0,
    });
    await ctrl.start();
    await new Promise((r) => setTimeout(r, 700));
    await new Promise((r) => setTimeout(r, 400));

    // 在 reset 前先抓住 lifetime 数字，作为期望
    const beforeReset = ctrl.getState().usageLifetime;

    await ctrl.resetToday();

    const after = ctrl.getState();
    expect(after.usageSinceReset.callCount).toBe(0);
    expect(after.usageSinceReset.totalTokens).toBe(0);
    expect(after.usageSinceReset.cost).toBe(0);
    // lifetime 维度保留（reset 不破坏全期账）
    expect(after.usageLifetime.callCount).toBe(beforeReset.callCount);
    expect(after.usageLifetime.totalTokens).toBe(beforeReset.totalTokens);

    // accumulator 文件应**仍然存在**（含 lifetime 段 + 已清零的 sinceReset 段）。
    const accumulatorPath = join(root, "memory", "usage-accumulator.json");
    const persisted = JSON.parse(await readFile(accumulatorPath, "utf8"));
    expect(persisted.schemaVersion).toBe(2);
    expect(persisted.lifetime.summary.callCount).toBe(beforeReset.callCount);
    expect(persisted.sinceReset.summary.callCount).toBe(0);

    await ctrl.stop();
  });

  it("v1 旧 accumulator 文件自动迁移到双维度（两份同时拷贝旧 summary）", async () => {
    const root = await makeRoot();
    await writeConfig(root, { "preferences.json": JSON.stringify({ enabled: true }) });

    const accumulatorPath = join(root, "memory", "usage-accumulator.json");
    await mkdir(join(root, "memory"), { recursive: true });
    await writeFile(
      accumulatorPath,
      JSON.stringify({
        schemaVersion: 1,
        summary: {
          callCount: 5,
          promptTokens: 12_000,
          completionTokens: 3_000,
          totalTokens: 15_000,
          reasoningTokens: 0,
          cacheHitTokens: 4_000,
          cacheMissTokens: 8_000,
          cost: 0.42,
          currency: "CNY",
        },
        seenCurrency: "CNY",
        currencyMixed: false,
        lastUpdatedAt: new Date().toISOString(),
      }, null, 2),
      "utf8",
    );

    const llm = new MockLLMService({ provider: "mock", apiKey: "k", model: "m" });
    llm.setResponses([mockText("ok")]);
    const ctrl = await createKairos({
      kairosRoot: root,
      llm,
      toolManagerFactory: makeToolManagerFactory(),
      contextWindow: 8000,
    });

    const state = ctrl.getState();
    expect(state.usageLifetime.callCount).toBe(5);
    expect(state.usageLifetime.totalTokens).toBe(15_000);
    expect(state.usageLifetime.cost).toBeCloseTo(0.42, 4);
    expect(state.usageLifetime.currency).toBe("CNY");
    // v1 → v2 迁移：sinceReset 同时拷贝旧 summary 作为升级锚点。
    expect(state.usageSinceReset.callCount).toBe(5);
    expect(state.usageSinceReset.totalTokens).toBe(15_000);

    await ctrl.stop();
  });

  it("accumulator 文件缺失时从全部 jsonl 段重建 lifetime（用户语义：除非删文件不清）", async () => {
    const root = await makeRoot();
    await writeConfig(root, { "preferences.json": JSON.stringify({ enabled: true }) });

    // 直接预先写两条 llm_usage 进短期记忆 jsonl，模拟"上次跑过留下的历史"。
    const today = new Date();
    const utcDate = (() => {
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${today.getUTCFullYear()}-${pad(today.getUTCMonth() + 1)}-${pad(today.getUTCDate())}`;
    })();
    const monthDir = join(root, "memory", "short-term", utcDate.slice(0, 7));
    await mkdir(monthDir, { recursive: true });
    const jsonl = join(monthDir, `${utcDate}.jsonl`);
    const e1 = {
      id: "u1",
      sessionId: `kairos-${utcDate}`,
      turnId: "t1",
      type: "llm_usage",
      timestamp: today.toISOString(),
      schemaVersion: 1,
      payload: {
        callId: "c1",
        provider: "deepseek",
        model: "deepseek-v4-flash",
        modelId: "deepseek-v4-flash",
        promptTokens: 800,
        completionTokens: 200,
        totalTokens: 1_000,
        cost: { input: 0.001, output: 0.0002, cacheRead: 0, cacheWrite: 0, total: 0.0012, currency: "USD" },
      },
    };
    const e2 = {
      id: "u2",
      sessionId: `kairos-${utcDate}`,
      turnId: "t2",
      type: "llm_usage",
      timestamp: today.toISOString(),
      schemaVersion: 1,
      payload: {
        callId: "c2",
        provider: "deepseek",
        model: "deepseek-v4-flash",
        modelId: "deepseek-v4-flash",
        promptTokens: 1_200,
        completionTokens: 300,
        totalTokens: 1_500,
        cost: { input: 0.0015, output: 0.0003, cacheRead: 0, cacheWrite: 0, total: 0.0018, currency: "USD" },
      },
    };
    await writeFile(jsonl, `${JSON.stringify(e1)}\n${JSON.stringify(e2)}\n`, "utf8");

    const llm = new MockLLMService({ provider: "mock", apiKey: "k", model: "m" });
    llm.setResponses([mockText("ok")]);
    const ctrl = await createKairos({
      kairosRoot: root,
      llm,
      toolManagerFactory: makeToolManagerFactory(),
      contextWindow: 8000,
    });

    const state = ctrl.getState();
    // lifetime 从 jsonl 重建出 2 条
    expect(state.usageLifetime.callCount).toBe(2);
    expect(state.usageLifetime.totalTokens).toBe(2_500);
    expect(state.usageLifetime.currency).toBe("USD");
    // sinceReset 保守归零（reset 边界丢失，无法推断）
    expect(state.usageSinceReset.callCount).toBe(0);

    await ctrl.stop();
  });
});
