import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadEnv } from "@actspace/agent-core";
import { ModelRuntimeService } from "../model-runtime-service";
import { ModelStoreService } from "../model-store-service";
import { SettingsService, type SecretCrypto } from "../settings-service";

const crypto: SecretCrypto = {
  isAvailable: () => true,
  encrypt: (plain) => Buffer.from(`enc:${plain}`),
  decrypt: (cipher) => cipher.toString().slice(4),
};
const checkedAt = "2026-07-24T12:00:00.000Z";
async function setup() {
  const dataRoot = await mkdtemp(join(tmpdir(), "actspace-runtime-test-"));
  const settings = new SettingsService({ dataRoot, crypto, reloadEnv: () => loadEnv({ envPath: "/private/tmp/no-env", mergeToProcessEnv: false }), createCredentialId: () => "codex-sale" });
  await settings.load();
  const models = new ModelStoreService({ settings });
  const runtime = new ModelRuntimeService(settings, models);
  return { settings, models, runtime };
}

async function connect(settings: SettingsService, provider: "deepseek" | "kimi" | "openrouter" | "duckcoding") {
  await settings.updateProviderConnection({ provider, apiKey: `sk-${provider}` });
  await settings.markProviderConnectionResult(provider, { ok: true, message: "ok", checkedAt });
}

describe("ModelRuntimeService", () => {
  it("defaults image inspection to Luna on OpenRouter and can switch to Kimi", async () => {
    const { settings, runtime } = await setup();
    expect(runtime.resolveImageInspectionModel()).toMatchObject({ ok: false, code: "api_key_missing" });

    await connect(settings, "openrouter");
    expect(runtime.resolveImageInspectionModel()).toMatchObject({
      ok: true,
      model: {
        key: "openrouter:openai/gpt-5.6-luna",
        llmConfig: { provider: "openrouter", model: "openai/gpt-5.6-luna", apiKey: "sk-openrouter" },
      },
    });

    await connect(settings, "kimi");
    await settings.update({ imageInspection: { modelKey: "kimi:kimi-k2.7-code" } });
    expect(runtime.resolveImageInspectionModel()).toMatchObject({
      ok: true,
      model: {
        key: "kimi:kimi-k2.7-code",
        llmConfig: { provider: "kimi", model: "kimi-k2.7-code", apiKey: "sk-kimi" },
      },
    });
  });

  it("resolves requested main model with explicit provider runtime", async () => {
    const { settings, runtime } = await setup();
    await connect(settings, "deepseek");
    const result = runtime.resolveMainModel("deepseek:deepseek-v4-pro");
    expect(result).toMatchObject({ ok: true, model: { key: "deepseek:deepseek-v4-pro", source: "requested" } });
    if ("model" in result) expect(result.model.llmConfig.apiKey).toBe("sk-deepseek");
  });

  it("rejects disconnected, disabled and capability-mismatched main selections", async () => {
    const { settings, runtime } = await setup();
    expect(runtime.resolveMainModel("deepseek:deepseek-v4-pro")).toMatchObject({ ok: false, reason: "provider_disconnected" });
    await connect(settings, "deepseek");
    await settings.updateV2({ installedModels: { "deepseek:deepseek-v4-pro": { enabled: false } } });
    expect(runtime.resolveMainModel("deepseek:deepseek-v4-pro")).toMatchObject({ ok: false, reason: "model_disabled" });
    expect(runtime.resolveMainModel("not-a-model")).toMatchObject({ ok: false, code: "model_unavailable" });
  });

  it("uses configured utility/explore models and falls back to main without rewriting settings", async () => {
    const { settings, runtime } = await setup();
    await connect(settings, "deepseek");
    const main = runtime.resolveMainModel("deepseek:deepseek-v4-pro");
    if (!("model" in main)) throw new Error("main unavailable");
    await settings.updateV2({ taskModels: { utilityModel: "deepseek:deepseek-v4-flash", exploreModel: "deepseek:deepseek-v4-flash" } });
    expect(runtime.resolveUtilityModel(main.model)).toMatchObject({ ok: true, model: { key: "deepseek:deepseek-v4-flash", source: "configured" } });
    await settings.updateV2({ installedModels: { "deepseek:deepseek-v4-flash": { enabled: false } } });
    expect(runtime.resolveUtilityModel(main.model)).toMatchObject({ ok: true, model: { key: main.model.key, fallbackReason: "utility_to_main:model_disabled" } });
    expect(runtime.resolveExploreModel(main.model)).toMatchObject({ ok: true, model: { key: main.model.key, fallbackReason: "explore_to_main:model_disabled" } });
    expect(settings.getModelStorageState().taskModels.utilityModel).toBe("deepseek:deepseek-v4-flash");
  });

  it("blocks Kairos when configured model is unavailable and recovers after reconnect", async () => {
    const { settings, runtime } = await setup();
    await settings.updateV2({ kairos: { modelId: "deepseek:deepseek-v4-pro" } });
    expect(runtime.resolveKairosModel()).toMatchObject({ ok: false, reason: "provider_disconnected" });
    await connect(settings, "deepseek");
    expect(runtime.resolveKairosModel()).toMatchObject({ ok: true, model: { key: "deepseek:deepseek-v4-pro" } });
  });

  it("does not reuse stale process env keys after the UI key is disconnected", async () => {
    process.env.DEEPSEEK_API_KEY = "stale-env-key";
    const { settings, runtime } = await setup();
    expect(process.env.DEEPSEEK_API_KEY).toBeUndefined();
    expect(runtime.resolveMainModel("deepseek:deepseek-v4-pro")).toMatchObject({ ok: false, reason: "provider_disconnected" });
    await settings.updateProviderConnection({ provider: "deepseek", apiKey: "sk-ui" });
    await settings.markProviderConnectionResult("deepseek", { ok: true, message: "ok", checkedAt });
    await settings.updateProviderConnection({ provider: "deepseek", apiKey: null });
    process.env.DEEPSEEK_API_KEY = "stale-env-key";
    expect(runtime.resolveMainModel("deepseek:deepseek-v4-pro")).toMatchObject({ ok: false, reason: "provider_disconnected" });
  });

  it("uses the model-selected DuckCoding Key and applies its pricing multiplier without fallback", async () => {
    const { settings, models, runtime } = await setup();
    await connect(settings, "duckcoding");
    await settings.addProviderCredential({ provider: "duckcoding", label: "CodeX-Sale", apiKey: "sk-sale", pricingMultiplier: 0.2 });
    await settings.markProviderCredentialConnectionResult("duckcoding", "codex-sale", { ok: true, message: "ok", checkedAt });
    await models.addCustomModel({ provider: "duckcoding", apiModel: "gpt-5.6-sol", credentialId: "codex-sale", catalogModelId: "codex:gpt-5.6-sol" });

    const resolved = runtime.resolveMainModel("duckcoding:gpt-5.6-sol");
    expect(resolved).toMatchObject({
      ok: true,
      model: {
        providerRuntime: { apiKey: "sk-sale", pricingMultiplier: 0.2 },
        definition: { pricing: { inputCacheHitPerMillion: 0.1, inputCacheMissPerMillion: 1, inputCacheWritePerMillion: 1.25, outputPerMillion: 6 } },
      },
    });

    await settings.markProviderCredentialConnectionResult("duckcoding", "codex-sale", { ok: false, message: "bad", checkedAt, errorKind: "auth" });
    expect(runtime.resolveMainModel("duckcoding:gpt-5.6-sol")).toMatchObject({ ok: false, reason: "credential_unavailable" });
  });
});
