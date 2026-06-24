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

  it("allows explicit DeepSeek Pro as Kairos model override", () => {
    const r = resolveKairosEnv("deepseek-v4-pro", "auto");
    expect(r.modelSpec.id).toBe("deepseek-v4-pro");
    expect(r.modelSpec.provider).toBe("deepseek");
  });

  it("allows explicit Kimi models as Kairos model override", () => {
    const r = resolveKairosEnv("kimi-k2.6", "auto");
    expect(r.modelSpec.id).toBe("kimi-k2.6");
    expect(r.modelSpec.provider).toBe("kimi");
    const code = resolveKairosEnv("kimi-k2.7-code", "auto");
    expect(code.modelSpec.id).toBe("kimi-k2.7-code");
    expect(code.modelSpec.provider).toBe("kimi");
  });

  it("rejects shared registry models outside the Kairos allowlist", () => {
    const r = resolveKairosEnv("deepseek-v4-flash", "auto");
    // flash 不是「显式覆盖」选项；非 allowlist 字符串一律回落默认 flash。
    expect(r.modelSpec.id).toBe("deepseek-v4-flash");
    const garbage = resolveKairosEnv("not-a-real-model", "auto");
    expect(garbage.modelSpec.id).toBe("deepseek-v4-flash");
  });

  it("settings thinking=on/off explicitly toggles supported DeepSeek models", () => {
    expect(resolveKairosEnv("deepseek-v4-pro", "on").thinkingEnabled).toBe(true);
    expect(resolveKairosEnv("deepseek-v4-pro", "off").thinkingEnabled).toBe(false);
    expect(resolveKairosEnv("deepseek-v4-pro", "auto").thinkingEnabled).toBeUndefined();
  });

  it("resolveKairosModelSpec follows the same allowlist", () => {
    expect(resolveKairosModelSpec(null).id).toBe("deepseek-v4-flash");
    expect(resolveKairosModelSpec("deepseek-v4-pro").id).toBe("deepseek-v4-pro");
    expect(resolveKairosModelSpec("kimi-k2.6").id).toBe("kimi-k2.6");
    expect(resolveKairosModelSpec("kimi-k2.7-code").id).toBe("kimi-k2.7-code");
    expect(resolveKairosModelSpec("not-a-real-model").id).toBe("deepseek-v4-flash");
  });
});
