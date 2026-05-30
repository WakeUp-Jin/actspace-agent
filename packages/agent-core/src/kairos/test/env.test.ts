/**
 * resolveKairosEnv(modelId, thinking) —— 把 settings.json 的 kairos 分区翻译成
 * ModelSpec + thinkingEnabled。
 */
import { describe, expect, it } from "vitest";
import { resolveKairosEnv, resolveKairosModelSpec } from "../env";

describe("resolveKairosEnv", () => {
  it("null modelId → falls back to Kairos default flash model", () => {
    const r = resolveKairosEnv(null, "auto");
    expect(r.modelSpec.id).toBe("deepseek-v4-flash");
    expect(r.thinkingEnabled).toBeUndefined();
  });

  it("allows only explicit DeepSeek Pro as Kairos model override", () => {
    const r = resolveKairosEnv("deepseek-v4-pro", "auto");
    expect(r.modelSpec.id).toBe("deepseek-v4-pro");
    expect(r.modelSpec.provider).toBe("deepseek");
  });

  it("rejects shared registry models outside the Kairos allowlist", () => {
    const r = resolveKairosEnv("kimi-k2.6", "auto");
    expect(r.modelSpec.id).toBe("deepseek-v4-flash");
  });

  it("garbage modelId silently falls back to default", () => {
    const r = resolveKairosEnv("not-a-real-model", "auto");
    expect(r.modelSpec.id).toBe("deepseek-v4-flash");
  });

  it("settings thinking=on/off explicitly toggles supported DeepSeek models", () => {
    expect(resolveKairosEnv("deepseek-v4-pro", "on").thinkingEnabled).toBe(true);
    expect(resolveKairosEnv("deepseek-v4-pro", "off").thinkingEnabled).toBe(false);
    expect(resolveKairosEnv("deepseek-v4-pro", "auto").thinkingEnabled).toBeUndefined();
  });

  it("resolveKairosModelSpec follows the same allowlist", () => {
    expect(resolveKairosModelSpec(null).id).toBe("deepseek-v4-flash");
    expect(resolveKairosModelSpec("deepseek-v4-pro").id).toBe("deepseek-v4-pro");
    expect(resolveKairosModelSpec("kimi-k2.6").id).toBe("deepseek-v4-flash");
  });
});
