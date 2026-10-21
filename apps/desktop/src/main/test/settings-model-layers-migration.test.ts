// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { ModelCatalogEntry, ModelDefinition, ModelKey, SettingsV4 } from "@actspace/shared";
import { defaultProviderSettings, defaultSettingsFromEnv, defaultSettingsV4Metadata } from "../settings/defaults";
import { toSettingsV4 } from "../settings/migrations";
import { migrateModelLayers, type LegacyModelHints } from "../settings/model-layers-migration";

const catalog = {
  entries: [{
    source: "models.dev", sourceProviderId: "anthropic", apiModel: "claude-sonnet-5", name: "Claude Sonnet 5", currency: "USD", unsupportedBilling: false,
    rates: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 }, contextWindow: 200_000, maxOutput: 64_000, input: ["text", "image"], reasoning: true,
  } satisfies ModelCatalogEntry],
};
const catalogPricing = { currency: "USD" as const, inputCacheMissPerMillion: 3, outputPerMillion: 15, inputCacheHitPerMillion: 0.3, inputCacheWritePerMillion: 3.75 };

// 旧文件里的计费方式和看图模型不在类型里，由读文件时的 hints 带入。
let billingModes: Record<string, "reference" | "token" | "manual"> = {};
let visionModel: string | null = null;
const hints = (): LegacyModelHints => ({ visionModel, billingModes });

function settingsV4(): SettingsV4 {
  billingModes = {};
  visionModel = null;
  const settings = toSettingsV4(defaultSettingsFromEnv("/tmp/actspace-layers"), defaultSettingsV4Metadata());
  settings.models.layersVersion = 0;
  settings.models.overrides = {};
  return settings;
}

function addConnection(settings: SettingsV4, connectionId: string, billingMode: "reference" | "token" | "manual" | undefined, multiplier = 1): void {
  settings.models.connections[connectionId] = { ...defaultProviderSettings(), connectionId, providerId: "openrouter", protocol: "anthropic-messages", baseUrl: "https://relay.example", defaultPricingMultiplier: multiplier };
  if (billingMode) billingModes[connectionId] = billingMode;
}

function addModel(settings: SettingsV4, connectionId: string, apiModel: string, over: Partial<ModelDefinition> = {}): ModelKey {
  const key = `openrouter:connection/${connectionId}/${apiModel}` as ModelKey;
  settings.models.definitions[key] = {
    key, provider: "openrouter", api: "anthropic-messages", apiModel, label: apiModel, source: "custom", contextWindow: 200_000, maxTokens: 64_000, thinkingDefault: false,
    capabilities: { input: ["text", "image"], toolUse: "declared", reasoning: false }, ...over,
  };
  settings.models.installed[key] = { enabled: true, addedAt: "2026-01-01T00:00:00.000Z", connectionId };
  return key;
}

describe("migrateModelLayers", () => {
  it("keeps only the fields that differ from the catalog as user changes", () => {
    const settings = settingsV4();
    addConnection(settings, "relay", "reference");
    const same = addModel(settings, "relay", "claude-sonnet-5", { pricing: catalogPricing });
    const bigger = addModel(settings, "relay", "claude-sonnet-5-big", { label: "Big Sonnet", contextWindow: 1_000_000, capabilities: { input: ["text"], toolUse: "declared", reasoning: false } });
    const migrated = migrateModelLayers(settings, catalog, hints())!;
    expect(migrated.models.overrides?.[same]).toBeUndefined();
    // 目录里没有这个模型：和「未知」比，填过的字段全算用户修改。
    expect(migrated.models.overrides?.[bigger]).toMatchObject({ label: "Big Sonnet", contextWindow: 1_000_000, maxOutput: 64_000 });
    expect(migrated.models.connections.relay).not.toHaveProperty("billingMode");
    expect(migrated.models.layersVersion).toBe(1);
  });

  it("turns reference and manual prices into hand-entered prices and drops token-mode prices", () => {
    const settings = settingsV4();
    addConnection(settings, "reference", "reference", 0.5);
    addConnection(settings, "manual", undefined, 0.5);
    addConnection(settings, "token", "token", 0.5);
    const pricing = { currency: "USD" as const, inputCacheMissPerMillion: 4, outputPerMillion: 20, inputCacheHitPerMillion: 0.4 };
    const reference = addModel(settings, "reference", "claude-sonnet-5", { pricing });
    const manual = addModel(settings, "manual", "claude-sonnet-5", { pricing });
    const token = addModel(settings, "token", "claude-sonnet-5", { pricing });
    const overrides = migrateModelLayers(settings, catalog, hints())!.models.overrides!;
    expect(overrides[reference]?.rates).toEqual({ input: 4, output: 20, cacheRead: 0.4, cacheWrite: null });
    // 旧的 manual 模式会乘倍率：迁移时乘好，之后手填价不再乘。
    expect(overrides[manual]?.rates).toEqual({ input: 2, output: 10, cacheRead: 0.2, cacheWrite: null });
    expect(overrides[token]).toBeUndefined();
  });

  it("turns manual reasoning into a thinking change and forgets automatic reasoning", () => {
    const settings = settingsV4();
    addConnection(settings, "relay", "reference");
    const manual = addModel(settings, "relay", "claude-sonnet-5", {
      reasoningConfig: { mode: "manual", efforts: ["low", "high"] },
      thinkingDefault: true,
      capabilities: { input: ["text", "image"], toolUse: "declared", reasoning: true, thinkingToggle: true, reasoningEfforts: ["low", "high"], reasoningDefaultEffort: "high" },
    });
    const auto = addModel(settings, "relay", "claude-sonnet-5-auto", { reasoningConfig: { mode: "auto" } });
    const migrated = migrateModelLayers(settings, catalog, hints())!;
    expect(migrated.models.overrides?.[manual]?.thinking).toEqual({ levels: ["off", "low", "high"], default: "high" });
    expect(migrated.models.overrides?.[auto]?.thinking).toBeUndefined();
    expect(migrated.models.definitions[manual]).not.toHaveProperty("reasoningConfig");
    expect(migrated.models.definitions[auto]).not.toHaveProperty("reasoningConfig");
  });

  it("moves custom labels, vision, the explore mirror and purpose thinking into the purpose table", () => {
    const settings = settingsV4();
    addConnection(settings, "relay", "reference");
    const key = addModel(settings, "relay", "claude-sonnet-5");
    settings.models.installed[key]!.customLabel = "工作用 Sonnet";
    visionModel = key;
    settings.models.taskBindings.explore = null;
    settings.subagents.routes.explore = { model: key };
    delete settings.models.taskBindings.thinking;
    const migrated = migrateModelLayers(settings, catalog, hints())!;
    expect(migrated.models.overrides?.[key]).toMatchObject({ label: "工作用 Sonnet" });
    expect(migrated.models.installed[key]).not.toHaveProperty("customLabel");
    expect(migrated.models.taskBindings).toMatchObject({ vision: key, explore: key, thinking: { utility: "off", autoReview: "off" } });
    expect(migrated.subagents.routes).not.toHaveProperty("explore");
  });

  it("follows the chat model for vision when the old vision model is not installed, and keeps a set explore binding", () => {
    const settings = settingsV4();
    addConnection(settings, "relay", "reference");
    const key = addModel(settings, "relay", "claude-sonnet-5");
    visionModel = "openrouter:not-installed";
    settings.models.taskBindings.explore = key;
    settings.subagents.routes.explore = { model: "openrouter:stale" };
    settings.models.taskBindings.thinking = { utility: "high" };
    const migrated = migrateModelLayers(settings, catalog, hints())!;
    expect(migrated.models.taskBindings).toMatchObject({ vision: null, explore: key, thinking: { utility: "high", autoReview: "off" } });
  });

  it("runs only once", () => {
    const settings = settingsV4();
    addConnection(settings, "relay", "manual", 2);
    addModel(settings, "relay", "claude-sonnet-5", { pricing: catalogPricing });
    const migrated = migrateModelLayers(settings, catalog, hints())!;
    expect(migrateModelLayers(migrated, catalog, hints())).toBeNull();
    expect(settings.models.layersVersion).toBe(0);
  });
});
