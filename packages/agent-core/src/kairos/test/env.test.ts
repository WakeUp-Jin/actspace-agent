/**
 * resolveKairosEnv() —— 把 raw env 翻译成 ModelSpec + thinkingEnabled。
 *
 * 这些测试都通过手动改写 process.env 后强制重载 env module 来覆盖各种输入组合，
 * 包括"非法 modelId 静默回落"、"模型不支持 toggle 时强制 ignore"这种边界。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = ["KAIROS_MODEL_ID", "KAIROS_THINKING"] as const;
const EMPTY_ENV_PATH = "/tmp/actspace-agent-kairos-env-empty-do-not-create.env";

function withEnv(vars: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  for (const k of ENV_KEYS) {
    if (vars[k] !== undefined) {
      process.env[k] = vars[k];
    } else {
      delete process.env[k];
    }
  }
}

async function loadResolver() {
  // env 和 kairos/env 都在模块层读取缓存；每次测试重置模块，保证读到当前 process.env。
  vi.resetModules();
  const envMod = await import("../../env");
  envMod.loadEnv({ envPath: EMPTY_ENV_PATH, mergeToProcessEnv: false });
  const { resolveKairosEnv } = await import("../env");
  return resolveKairosEnv;
}

describe("resolveKairosEnv", () => {
  const original = { ...process.env };

  beforeEach(() => {
    // 清空两个相关 env
    delete process.env.KAIROS_MODEL_ID;
    delete process.env.KAIROS_THINKING;
  });

  afterEach(() => {
    for (const k of Object.keys(process.env)) {
      if (!(k in original)) delete process.env[k];
    }
    for (const [k, v] of Object.entries(original)) {
      if (v !== undefined) process.env[k] = v;
    }
  });

  it("empty env → falls back to Kairos default flash model with thinking enabled", async () => {
    withEnv({});
    const resolve = await loadResolver();
    const r = resolve();
    expect(r.modelSpec.id).toBe("deepseek-v4-flash");
    expect(r.thinkingEnabled).toBe(true);
  });

  it("valid modelId is honored", async () => {
    withEnv({ KAIROS_MODEL_ID: "kimi-k2.6" });
    const resolve = await loadResolver();
    const r = resolve();
    expect(r.modelSpec.id).toBe("kimi-k2.6");
    expect(r.modelSpec.provider).toBe("kimi");
  });

  it("garbage modelId silently falls back to default", async () => {
    withEnv({ KAIROS_MODEL_ID: "not-a-real-model" });
    const resolve = await loadResolver();
    const r = resolve();
    expect(r.modelSpec.id).toBe("deepseek-v4-flash");
  });

  it("KAIROS_THINKING=true on toggle-supporting model → thinkingEnabled=true", async () => {
    withEnv({ KAIROS_MODEL_ID: "deepseek-v4-pro", KAIROS_THINKING: "true" });
    const resolve = await loadResolver();
    const r = resolve();
    expect(r.thinkingEnabled).toBe(true);
  });

  it("KAIROS_THINKING=false on toggle-supporting model → thinkingEnabled=false", async () => {
    withEnv({ KAIROS_MODEL_ID: "kimi-k2.6", KAIROS_THINKING: "false" });
    const resolve = await loadResolver();
    const r = resolve();
    expect(r.thinkingEnabled).toBe(false);
  });

  it("KAIROS_THINKING=auto leaves thinkingEnabled undefined", async () => {
    withEnv({ KAIROS_MODEL_ID: "deepseek-v4-pro", KAIROS_THINKING: "auto" });
    const resolve = await loadResolver();
    const r = resolve();
    expect(r.thinkingEnabled).toBeUndefined();
  });

  it("garbage KAIROS_THINKING value → parses to auto → undefined", async () => {
    withEnv({ KAIROS_MODEL_ID: "deepseek-v4-pro", KAIROS_THINKING: "maybe" });
    const resolve = await loadResolver();
    const r = resolve();
    expect(r.thinkingEnabled).toBeUndefined();
  });

  it("garbage modelId falls back to Kairos default and still honors KAIROS_THINKING", async () => {
    withEnv({ KAIROS_MODEL_ID: "not-a-real-model", KAIROS_THINKING: "true" });
    const resolve = await loadResolver();
    const r = resolve();
    expect(r.modelSpec.id).toBe("deepseek-v4-flash");
    expect(r.modelSpec.supportsThinkingToggle).toBe(true);
    expect(r.thinkingEnabled).toBe(true);
  });

  it("accepts 1 / 0 / on / off as boolean shorthands", async () => {
    withEnv({ KAIROS_MODEL_ID: "kimi-k2.6", KAIROS_THINKING: "1" });
    let r = (await loadResolver())();
    expect(r.thinkingEnabled).toBe(true);

    withEnv({ KAIROS_MODEL_ID: "kimi-k2.6", KAIROS_THINKING: "0" });
    r = (await loadResolver())();
    expect(r.thinkingEnabled).toBe(false);

    withEnv({ KAIROS_MODEL_ID: "kimi-k2.6", KAIROS_THINKING: "on" });
    r = (await loadResolver())();
    expect(r.thinkingEnabled).toBe(true);

    withEnv({ KAIROS_MODEL_ID: "kimi-k2.6", KAIROS_THINKING: "off" });
    r = (await loadResolver())();
    expect(r.thinkingEnabled).toBe(false);
  });
});
