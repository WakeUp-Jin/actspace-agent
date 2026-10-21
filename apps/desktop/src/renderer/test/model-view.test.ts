import { describe, expect, it } from "vitest";
import type { ConnectionModelView, ConnectionView, EffectiveModel, FactSource, ModelKey } from "@actspace/shared";
import {
  PURPOSES,
  familyLogo,
  formatMultiplier,
  formatPrice,
  formatTokens,
  isWellKnown,
  levelName,
  parsePositive,
  parseRate,
  pendingCount,
  pickerGroups,
  purposeLevelLabel,
  purposeSummary,
  rateMultiplierNote,
  thinkingKind,
  toggleLevel,
  unknownNote,
  withOverride,
} from "../components/settings/models/model-view";

function effective(patch: Partial<EffectiveModel> = {}, source: FactSource = "catalog"): EffectiveModel {
  return {
    label: "Model",
    contextWindow: 200_000,
    maxOutput: 32_000,
    input: ["text"],
    thinking: { levels: ["off", "low", "high"], default: "high" },
    rates: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: null },
    ratesUnsupported: false,
    ratesScaled: true,
    multiplier: 1,
    sources: { label: source, contextWindow: source, maxOutput: source, input: source, thinking: source, rates: source },
    catalog: { apiModel: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", exact: true },
    aliased: false,
    ...patch,
  };
}

function model(key: string, patch: Partial<ConnectionModelView> = {}): ConnectionModelView {
  return { key: key as ModelKey, apiModel: key.split("/").pop()!, enabled: true, effective: effective({ label: key }), overrides: null, removable: true, usedBy: [], ...patch };
}

function connection(connectionId: string, models: ConnectionModelView[], patch: Partial<ConnectionView> = {}): ConnectionView {
  return {
    connectionId,
    templateId: "custom",
    label: connectionId,
    relay: true,
    protocol: "openai-completions",
    baseUrl: "https://relay.test",
    defaultBaseUrl: null,
    hasApiKey: true,
    enabled: true,
    lastConnection: { status: "untested" } as ConnectionView["lastConnection"],
    multiplier: 1,
    proxy: { enabled: false, url: null },
    balance: false,
    models,
    ...patch,
  };
}

const UNKNOWN = effective({ catalog: null, contextWindow: null, thinking: null }, "unknown");

describe("model-view", () => {
  it("classifies thinking shapes", () => {
    expect(thinkingKind(null)).toBe("unknown");
    expect(thinkingKind({ levels: [] })).toBe("none");
    expect(thinkingKind({ levels: ["off", "high"] })).toBe("toggle");
    expect(thinkingKind({ levels: ["high"] })).toBe("always");
    expect(thinkingKind({ levels: ["off", "low", "high"] })).toBe("levels");
    expect(thinkingKind({ levels: ["low", "high"] })).toBe("mandatory");
  });

  it("names on/off-only levels 开 / 关", () => {
    expect(levelName(["off", "high"], "high")).toBe("开");
    expect(levelName(["off", "high"], "off")).toBe("关");
    expect(levelName(["off", "low", "high"], "high")).toBe("高");
  });

  it("shows a purpose level only when the model has a choice", () => {
    expect(purposeLevelLabel({ levels: ["off", "low", "high"], default: "high" }, null)).toBe("高");
    expect(purposeLevelLabel({ levels: ["off", "low", "high"], default: "high" }, "off")).toBe("思考关");
    expect(purposeLevelLabel({ levels: ["off", "high"], default: "off" }, "high")).toBe("思考开");
    expect(purposeLevelLabel({ levels: ["high"], default: "high" }, null)).toBe("");
    expect(purposeLevelLabel({ levels: [] }, null)).toBe("");
    expect(purposeLevelLabel(null, "high")).toBe("");
  });

  it("formats tokens, prices and multipliers", () => {
    expect(formatTokens(200_000)).toBe("200K");
    expect(formatTokens(1_000_000)).toBe("1M");
    expect(formatTokens(1_048_576)).toBe("1M");
    expect(formatTokens(null)).toBe("—");
    expect(formatPrice(0.3)).toBe("$0.3");
    expect(formatPrice(null)).toBe("—");
    expect(formatMultiplier(0.6)).toBe("0.6");
    expect(formatMultiplier(1 / 3)).toBe("0.3333");
  });

  it("parses user numbers: empty → null, invalid → undefined", () => {
    expect(parsePositive(" 128000 ")).toBe(128_000);
    expect(parsePositive("")).toBeNull();
    expect(parsePositive("0")).toBeUndefined();
    expect(parsePositive("abc")).toBeUndefined();
    expect(parseRate("$1.5")).toBe(1.5);
    expect(parseRate("0")).toBe(0);
    expect(parseRate("")).toBeNull();
    expect(parseRate("-1")).toBeUndefined();
  });

  it("notes only models that nothing knows about", () => {
    expect(unknownNote(effective())).toBeNull();
    expect(unknownNote(UNKNOWN)).toBe("不在模型目录中");
    expect(unknownNote({ ...UNKNOWN, catalog: { apiModel: "deepseek-chat", name: "DeepSeek V3", exact: false } })).toBe("像是 DeepSeek V3 的日期版本");
    // 服务商给了上下文就不算未知。
    expect(unknownNote({ ...UNKNOWN, sources: { ...UNKNOWN.sources, contextWindow: "provider" } })).toBeNull();
  });

  it("treats catalog, aliased and provider-sized models as well known", () => {
    expect(isWellKnown(effective())).toBe(true);
    expect(isWellKnown(UNKNOWN)).toBe(false);
    expect(isWellKnown({ ...UNKNOWN, aliased: true })).toBe(true);
    expect(isWellKnown({ ...UNKNOWN, sources: { ...UNKNOWN.sources, contextWindow: "provider" } })).toBe(true);
  });

  it("shows ×multiplier only on scaled reference prices", () => {
    expect(rateMultiplierNote(effective({ multiplier: 0.6 }))).toBe("×0.6");
    expect(rateMultiplierNote(effective({ multiplier: 0.6, ratesScaled: false }))).toBeNull();
    expect(rateMultiplierNote(effective({ multiplier: 1 }))).toBeNull();
  });

  it("drops empty overrides back to null", () => {
    expect(withOverride(null, "label", "A")).toEqual({ label: "A" });
    expect(withOverride({ label: "A" }, "label", undefined)).toBeNull();
    expect(withOverride({ label: "A", contextWindow: 1 }, "label", undefined)).toEqual({ contextWindow: 1 });
  });

  it("toggles levels in canonical order and keeps a still-valid default", () => {
    expect(toggleLevel({ levels: ["high"], default: "high" }, "off")).toEqual({ levels: ["off", "high"], default: "high" });
    expect(toggleLevel({ levels: ["off", "high"], default: "high" }, "high")).toEqual({ levels: ["off"] });
    expect(toggleLevel(null, "low")).toEqual({ levels: ["low"] });
  });

  it("groups enabled models per enabled connection, filtered by purpose and query", () => {
    const vision = model("a/vision-pro", { effective: effective({ label: "Vision Pro", input: ["text", "image"] }) });
    const text = model("a/text-only");
    const off = model("a/disabled", { enabled: false });
    const connections = [
      connection("a", [vision, text, off]),
      connection("b", [model("b/other")], { enabled: false }),
    ];
    const chat = PURPOSES.find((purpose) => purpose.id === "chat")!;
    const visionPurpose = PURPOSES.find((purpose) => purpose.id === "vision")!;
    expect(pickerGroups(connections, chat, "").map((group) => group.models.map((item) => item.key))).toEqual([["a/vision-pro", "a/text-only"]]);
    expect(pickerGroups(connections, visionPurpose, "").map((group) => group.models.map((item) => item.key))).toEqual([["a/vision-pro"]]);
    expect(pickerGroups(connections, chat, "VISION").map((group) => group.models.length)).toEqual([1]);
    expect(pickerGroups(connections, chat, "nothing")).toEqual([]);
  });

  it("summarises purpose bindings and flags missing models", () => {
    const connections = [connection("a", [model("a/m1")])];
    expect(purposeSummary(connections, { model: null, thinking: null })).toBeNull();
    expect(purposeSummary(connections, { model: "a/m1" as ModelKey, thinking: "low" })).toEqual({ label: "a/m1", level: "低", missing: false });
    expect(purposeSummary(connections, { model: "gone" as ModelKey, thinking: null })).toMatchObject({ missing: true });
  });

  it("counts enabled unknown models as pending", () => {
    expect(pendingCount(connection("a", [model("a/known"), model("a/new", { effective: UNKNOWN }), model("a/off", { effective: UNKNOWN, enabled: false })]))).toBe(1);
  });

  it("picks a family mark from the catalog id, else the raw id", () => {
    expect(familyLogo({ apiModel: "my-alias", effective: effective() })).toBe("anthropic");
    expect(familyLogo({ apiModel: "openrouter/deepseek/deepseek-chat", effective: UNKNOWN })).toBe("deepseek");
    expect(familyLogo({ apiModel: "gpt-5", effective: UNKNOWN })).toBe("openai");
    expect(familyLogo({ apiModel: "llama-3", effective: UNKNOWN })).toBeNull();
  });
});
