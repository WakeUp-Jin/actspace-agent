/**
 * resolveKairosEnv() —— 把 raw env 翻译成 ModelSpec + thinkingEnabled。
 *
 * 这些测试都通过手动改写 process.env 后强制重载 env module 来覆盖各种输入组合，
 * 包括"非法 modelId 静默回落"、"模型不支持 toggle 时强制 ignore"这种边界。
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const ENV_KEYS = ["KAIROS_MODEL_ID", "KAIROS_THINKING"] as const;

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
  // env module 内部有缓存（_env / _loaded），每次测试都重置以读到当前 process.env。
  // 复用 ESM 的 module cache 比较麻烦，这里用 vitest 的 resetModules 思路：
  // 直接 import fresh 实例。
  const envMod = await import("../../env");
  envMod.loadEnv({ mergeToProcessEnv: false });
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

  it("empty env → falls back to default ModelSpec, thinkingEnabled=undefined", async () => {
    withEnv({});
    const resolve = await loadResolver();
    const r = resolve();
    expect(r.modelSpec.id).toBe("deepseek-v4-flash"); // DEFAULT_MODEL_ID
    expect(r.thinkingEnabled).toBeUndefined();
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

  it("model without thinking toggle → KAIROS_THINKING is ignored even when=true", async () => {
    withEnv({ KAIROS_MODEL_ID: "deepseek-v4-flash", KAIROS_THINKING: "true" });
    const resolve = await loadResolver();
    const r = resolve();
    expect(r.modelSpec.supportsThinkingToggle).toBe(false);
    expect(r.thinkingEnabled).toBeUndefined();
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
