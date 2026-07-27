import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { loadEnv } from "@actspace/agent-core";
import type { CatalogModelView, ModelMetadataView } from "@actspace/shared";
import { ModelStoreService } from "../model-store-service";
import { SettingsService, type SecretCrypto } from "../settings-service";

const CRYPTO: SecretCrypto = {
  isAvailable: () => true,
  encrypt: (plain) => Buffer.from(`enc:${plain}`),
  decrypt: (cipher) => cipher.toString().slice(4),
};
const NOW = new Date("2026-07-24T12:00:00.000Z");
const CATALOG: CatalogModelView = {
  provider: "openrouter",
  apiModel: "vendor/custom-agent",
  name: "Custom Agent",
  contextWindow: 128000,
  maxTokens: 16000,
  input: ["text"],
  toolUse: "declared",
  reasoning: true,
  reasoningEfforts: ["low", "medium", "high"],
  reasoningDefaultEffort: "medium",
  reasoningDefaultEnabled: true,
  reasoningMandatory: false,
  isFree: false,
  pricing: { currency: "USD", inputCacheHitPerMillion: 0.1, inputCacheMissPerMillion: 1, outputPerMillion: 2 },
  added: false,
};
const METADATA: ModelMetadataView = {
  key: "models.dev:xai:grok-4.5",
  source: "models.dev",
  provider: "xai",
  modelId: "grok-4.5",
  name: "Grok 4.5",
  aliases: ["grok-4.5", "xai/grok-4.5"],
  contextWindow: 256000,
  maxTokens: 32000,
  capabilities: { input: ["text", "image"], toolUse: "declared", reasoning: true, thinkingToggle: true },
  pricing: { currency: "USD", inputCacheHitPerMillion: 0.5, inputCacheMissPerMillion: 5, inputCacheWritePerMillion: 6.25, outputPerMillion: 30 },
  fetchedAt: NOW.toISOString(),
};

async function setup() {
  const dataRoot = await mkdtemp(join(tmpdir(), "actspace-model-store-test-"));
  const settings = new SettingsService({ dataRoot, crypto: CRYPTO, reloadEnv: () => loadEnv({ envPath: "/private/tmp/no-env", mergeToProcessEnv: false }) });
  await settings.load();
  const store = new ModelStoreService({ settings, findCatalogModel: (id) => id === CATALOG.apiModel ? CATALOG : undefined, now: () => NOW });
  return { settings, store };
}

async function setupWithMutableCatalog(initial: CatalogModelView) {
  const dataRoot = await mkdtemp(join(tmpdir(), "actspace-model-store-test-"));
  const settings = new SettingsService({ dataRoot, crypto: CRYPTO, reloadEnv: () => loadEnv({ envPath: "/private/tmp/no-env", mergeToProcessEnv: false }) });
  await settings.load();
  let catalog = initial;
  const store = new ModelStoreService({ settings, findCatalogModel: (id) => id === catalog.apiModel ? catalog : undefined, now: () => NOW });
  return { settings, store, setCatalog: (next: CatalogModelView) => { catalog = next; } };
}

describe("ModelStoreService", () => {
  beforeEach(() => {
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.KIMI_API_KEY;
  });

  it("installs curated models idempotently without changing addedAt", async () => {
    const { settings, store } = await setup();
    await store.ensureCuratedModelsInstalled();
    const first = settings.getModelStorageState().installedModels["openrouter:google/gemini-3.5-flash-lite"];
    await store.ensureCuratedModelsInstalled();
    const second = settings.getModelStorageState().installedModels["openrouter:google/gemini-3.5-flash-lite"];
    expect(first?.addedAt).toBe(NOW.toISOString());
    expect(second?.addedAt).toBe(first?.addedAt);
  });

  it("adds catalog models idempotently and supports enable/disable", async () => {
    const { settings, store } = await setup();
    await store.addCatalogModel("openrouter", CATALOG.apiModel);
    const key = "openrouter:vendor/custom-agent" as const;
    const firstAddedAt = settings.getModelStorageState().installedModels[key]?.addedAt;
    await store.addCatalogModel("openrouter", CATALOG.apiModel);
    expect(settings.getModelStorageState().installedModels[key]?.addedAt).toBe(firstAddedAt);
    expect((await store.setModelEnabled(key, false)).ok).toBe(true);
    expect(settings.getModelStorageState().installedModels[key]?.enabled).toBe(false);
    expect(settings.getModelStorageState().customModels[key]).toMatchObject({
      thinkingDefault: true,
      capabilities: {
        reasoningEfforts: ["low", "medium", "high"],
        reasoningDefaultEffort: "medium",
        reasoningMandatory: false,
      },
    });
  });

  it("refreshes installed provider-catalog capabilities after a catalog reload", async () => {
    const staleCatalog: CatalogModelView = {
      ...CATALOG,
      reasoningEfforts: undefined,
      reasoningDefaultEffort: undefined,
      reasoningMandatory: undefined,
    };
    const { settings, store, setCatalog } = await setupWithMutableCatalog(staleCatalog);
    await store.addCatalogModel("openrouter", staleCatalog.apiModel);
    const key = "openrouter:vendor/custom-agent" as const;
    const addedAt = settings.getModelStorageState().installedModels[key]?.addedAt;
    expect(settings.getModelStorageState().customModels[key]?.capabilities.reasoningEfforts).toBeUndefined();

    setCatalog(CATALOG);
    await expect(store.refreshInstalledCatalogModels()).resolves.toBe(1);

    expect(settings.getModelStorageState().installedModels[key]?.addedAt).toBe(addedAt);
    expect(settings.getModelStorageState().customModels[key]).toMatchObject({
      capabilities: {
        reasoningEfforts: ["low", "medium", "high"],
        reasoningDefaultEffort: "medium",
        reasoningMandatory: false,
      },
    });
  });

  it("rejects builtin deletion and reports references for an in-use catalog model", async () => {
    const { settings, store } = await setup();
    expect(await store.removeModel("deepseek:deepseek-v4-pro")).toMatchObject({ ok: false, code: "model_not_removable" });
    await store.addCatalogModel("openrouter", CATALOG.apiModel);
    const key = "openrouter:vendor/custom-agent" as const;
    await settings.updateV2({ taskModels: { utilityModel: key } });
    expect(await store.removeModel(key)).toMatchObject({ ok: false, code: "model_in_use", references: ["utilityModel"] });
    await settings.updateV2({ taskModels: { utilityModel: null } });
    expect((await store.removeModel(key)).ok).toBe(true);
  });

  it("keeps installed models after disconnect while resolver marks them unavailable", async () => {
    const { settings, store } = await setup();
    await settings.updateProviderConnection({ provider: "openrouter", apiKey: "sk-or" });
    await settings.markProviderConnectionResult("openrouter", { ok: true, message: "ok", checkedAt: NOW.toISOString() });
    await store.addCatalogModel("openrouter", CATALOG.apiModel);
    expect(store.listUsableModels("chat").some((model) => model.apiModel === CATALOG.apiModel)).toBe(true);
    await settings.updateProviderConnection({ provider: "openrouter", apiKey: null });
    const model = store.listInstalledModels().find((item) => item.definition.apiModel === CATALOG.apiModel);
    expect(model).toBeTruthy();
    expect(model?.unavailableReasons.chat).toBe("provider_disconnected");
  });

  it("adds a DuckDing API model with selected public metadata and an existing provider Key", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "actspace-model-store-test-"));
    const settings = new SettingsService({
      dataRoot,
      crypto: CRYPTO,
      reloadEnv: () => loadEnv({ envPath: "/private/tmp/no-env", mergeToProcessEnv: false }),
      createCredentialId: () => "codex-sale",
    });
    await settings.load();
    await settings.updateProviderConnection({ provider: "duckding", apiKey: "sk-default" });
    await settings.addProviderCredential({ provider: "duckding", label: "CodeX-Sale", apiKey: "sk-sale", pricingMultiplier: 0.2 });
    const store = new ModelStoreService({
      settings,
      findMetadataModel: (key) => key === METADATA.key ? METADATA : undefined,
      now: () => NOW,
    });

    const added = await store.addCustomModel({
      provider: "duckding",
      apiModel: "grok-4.5",
      credentialId: "codex-sale",
      metadataKey: METADATA.key,
    });

    expect(added).toMatchObject({ ok: true, model: { settings: { credentialId: "codex-sale" } } });
    expect(settings.getModelStorageState().customModels["duckding:grok-4.5"]).toMatchObject({
      apiModel: "grok-4.5",
      label: "Grok 4.5",
      metadata: { source: "models.dev", provider: "xai", modelId: "grok-4.5" },
      pricing: { inputCacheMissPerMillion: 5, inputCacheWritePerMillion: 6.25, outputPerMillion: 30 },
      capabilities: { input: ["text", "image"], toolUse: "declared", reasoning: true },
    });
    await expect(store.updateModelSettings("duckding:grok-4.5", { credentialId: "missing" })).resolves.toMatchObject({ ok: false, code: "credential_missing" });
    await expect(store.addCustomModel({ provider: "duckding", apiModel: "missing-model", metadataKey: "models.dev:xai:missing" })).resolves.toMatchObject({ ok: false, code: "model_not_found" });
  });
});
