import { describe, it, expect } from "vitest";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createKairos } from "../controller";
import { ToolManager } from "../../tools/manager";
import { MockLLMService, mockText, mockToolCall } from "../../llm/services/mock";
import type { SessionEvent } from "@actspace/shared";

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
});
