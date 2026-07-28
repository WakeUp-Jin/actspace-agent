import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { loadEnv } from "@actspace/agent-core";
import type { CatalogModelView } from "@actspace/shared";
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

  it("adds a DuckCoding local-catalog model with a context override and an existing provider Key", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "actspace-model-store-test-"));
    const settings = new SettingsService({
      dataRoot,
      crypto: CRYPTO,
      reloadEnv: () => loadEnv({ envPath: "/private/tmp/no-env", mergeToProcessEnv: false }),
      createCredentialId: () => "codex-sale",
    });
    await settings.load();
    await settings.updateProviderConnection({ provider: "duckcoding", apiKey: "sk-default" });
    await settings.addProviderCredential({ provider: "duckcoding", label: "CodeX-Sale", apiKey: "sk-sale", pricingMultiplier: 0.2 });
    const store = new ModelStoreService({ settings, now: () => NOW });

    const added = await store.addCustomModel({
      provider: "duckcoding",
      apiModel: "grok-4.5",
      credentialId: "codex-sale",
      catalogModelId: "grok:grok-4.5",
      contextWindow: 256000,
    });

    expect(added).toMatchObject({ ok: true, model: { settings: { credentialId: "codex-sale" } } });
    expect(settings.getModelStorageState().customModels["duckcoding:grok-4.5"]).toMatchObject({
      apiModel: "grok-4.5",
      label: "Grok 4.5",
      family: "grok",
      contextWindow: 256000,
      capabilities: { input: ["text"], toolUse: "declared", reasoning: true, reasoningMandatory: true },
    });
    await expect(store.updateModelSettings("duckcoding:grok-4.5", { credentialId: "missing" })).resolves.toMatchObject({ ok: false, code: "credential_missing" });
    await expect(store.addCustomModel({ provider: "duckcoding", apiModel: "missing-model", catalogModelId: "grok:missing" })).resolves.toMatchObject({ ok: false, code: "model_not_found" });
    await expect(store.addCustomModel({ provider: "duckcoding", apiModel: "grok-4.5", catalogModelId: "codex:gpt-5.6-sol" })).resolves.toMatchObject({ ok: false, code: "invalid_model" });
    await expect(store.addCustomModel({ provider: "duckcoding", apiModel: "bad-context", contextWindow: 10 })).resolves.toMatchObject({ ok: false, code: "invalid_model" });
  });

  it("backfills Codex pricing and Responses protocol for an already-installed DuckCoding model", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "actspace-model-store-pricing-test-"));
    const settings = new SettingsService({
      dataRoot,
      crypto: CRYPTO,
      reloadEnv: () => loadEnv({ envPath: "/private/tmp/no-env", mergeToProcessEnv: false }),
    });
    await settings.load();
    await settings.updateModelStorage({
      installedModels: {
        "duckcoding:gpt-5.6-sol": { enabled: true, addedAt: NOW.toISOString() },
      },
      customModels: {
        "duckcoding:gpt-5.6-sol": {
          key: "duckcoding:gpt-5.6-sol",
          provider: "duckcoding",
          api: "openai-completions",
          apiModel: "gpt-5.6-sol",
          label: "5.6 Sol",
          source: "custom",
          contextWindow: 255_000,
          maxTokens: null,
          thinkingDefault: true,
          capabilities: { input: ["text"], toolUse: "declared", reasoning: true, thinkingToggle: false },
        },
      },
    });

    const store = new ModelStoreService({ settings, now: () => NOW });
    expect(store.getModelSnapshot().definitions["duckcoding:gpt-5.6-sol"]?.api).toBe("openai-responses");
    expect(store.getModelSnapshot().definitions["duckcoding:gpt-5.6-sol"]?.pricing).toEqual({
      currency: "USD",
      inputCacheHitPerMillion: 0.5,
      inputCacheMissPerMillion: 5,
      inputCacheWritePerMillion: 6.25,
      outputPerMillion: 30,
    });
    expect(settings.getModelStorageState().customModels["duckcoding:gpt-5.6-sol"]?.pricing).toBeUndefined();
  });
});
