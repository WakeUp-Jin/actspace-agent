// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { SettingsService, type SecretCrypto } from "../settings-service";
import { ModelStoreService } from "../model-store-service";
import { ModelRuntimeService } from "../model-runtime-service";
import type { ModelApi, ModelKey } from "@actspace/shared";
import type { LlmAdapterDispatchInput } from "@actspace/llm-service";
import { DesktopCredentialResolver } from "../runtime-v2/credential-resolver";
import { DesktopLegacyLlmAdapter } from "../runtime-v2/legacy-llm-adapter";

const { wire, dispatch } = vi.hoisted(() => ({ wire: vi.fn(), dispatch: vi.fn(async () => (async function* () {})()) }));
vi.mock("@actspace/llm-pi-ai", async (importOriginal) => ({ ...await importOriginal<typeof import("@actspace/llm-pi-ai")>(),
  PiAiAdapter: class { dispatch = dispatch; constructor(options: { wire?: unknown }) { if (options.wire !== undefined) wire(options.wire); } },
  PiAiWireEngine: class { constructor(options: unknown) { wire(options); } },
  LegacyProxyWireEngine: class {},
  DeepSeekFileUploader: class { clear() {} },
}));

const roots: string[] = [];
const crypto: SecretCrypto = { isAvailable: () => true, encrypt: (text) => Buffer.from(text), decrypt: (data) => data.toString() };
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "actspace-connection-protocol-"));
  roots.push(root);
  const settings = new SettingsService({ dataRoot: root, crypto });
  await settings.load();
  await settings.clearProviderKey("openrouter");
  return { root, settings };
}
const protocols: ModelApi[] = ["openai-completions", "openai-responses", "anthropic-messages"];

it.each(protocols)("persists %s with its own model, endpoint and credential without an OpenRouter key", async (protocol) => {
  const { root, settings } = await fixture();
  const snapshot = await settings.createCustomConnection({ providerId: "openrouter", protocol, displayName: "Relay", apiKey: "fixture-secret", baseUrl: "https://relay.example/api", defaultModel: "vendor/same-model" });
  const connection = Object.values(snapshot.settings.models.connections).find((item) => item.displayName === "Relay")!;
  const modelKey = Object.entries(snapshot.settings.models.installed).find(([, model]) => model?.connectionId === connection.connectionId)![0];
  expect(snapshot.settings.models.taskBindings.defaultChat).not.toBe(modelKey);
  expect(await readFile(join(root, "settings.json"), "utf8")).not.toContain("fixture-secret");
  const reloaded = new SettingsService({ dataRoot: root, crypto });
  await reloaded.load();
  const models = new ModelStoreService({ settings: reloaded });
  const runtime = new ModelRuntimeService(reloaded, models);
  expect(runtime.resolveMainModel(modelKey)).toMatchObject({ ok: true, model: {
    definition: { api: protocol, apiModel: "vendor/same-model", contextWindow: null },
    providerRuntime: { apiKey: "fixture-secret", baseUrl: "https://relay.example/api" },
  } });
  const credential = await new DesktopCredentialResolver(runtime).resolve("desktop:default", new AbortController().signal);
  const adapter = new DesktopLegacyLlmAdapter(runtime, async () => { throw new Error("unused"); });
  try {
    await adapter.dispatch({ request: { model: modelKey, options: {} }, credential, signal: new AbortController().signal } as unknown as LlmAdapterDispatchInput);
    expect(wire).toHaveBeenLastCalledWith(expect.objectContaining({ route: protocol, modelId: "vendor/same-model", baseUrl: "https://relay.example/api" }));
    expect(dispatch).toHaveBeenLastCalledWith(expect.objectContaining({ credential: expect.objectContaining({ apiKey: "fixture-secret", baseUrl: "https://relay.example/api" }) }));
  } finally { await adapter.dispose(); }
  await models.setModelEnabled(modelKey as ModelKey, false);
  const restart = new SettingsService({ dataRoot: root, crypto });
  await restart.load();
  expect(new ModelRuntimeService(restart, new ModelStoreService({ settings: restart })).resolveMainModel(modelKey)).toMatchObject({ ok: false, reason: "model_disabled" });
});

it("keeps the selected connection intact when the default uses a different key and proxy", async () => {
  const { settings } = await fixture();
  await settings.updateProviderConnection({ provider: "deepseek", enabled: true, apiKey: "default-secret", proxy: { enabled: true, url: "http://127.0.0.1:9876" } });
  await settings.createCustomConnection({ providerId: "openrouter", connectionId: "selected-relay", displayName: "Relay", apiKey: "relay-secret", baseUrl: "https://relay.example/v1", defaultModel: "gpt-model" });
  const runtime = new ModelRuntimeService(settings, new ModelStoreService({ settings }));
  const adapter = new DesktopLegacyLlmAdapter(runtime, async () => { throw new Error("unused"); });
  try {
    for (const model of ["openrouter:connection/selected-relay/gpt-model", "default"]) {
      const signal = new AbortController().signal;
      const credential = await new DesktopCredentialResolver(runtime).resolve("desktop:default", signal);
      await adapter.dispatch({ request: { model, options: {} }, credential, signal } as unknown as LlmAdapterDispatchInput);
      expect(dispatch).toHaveBeenLastCalledWith(expect.objectContaining({ credential: model === "default"
        ? expect.objectContaining({ apiKey: "default-secret", proxyUrl: "http://127.0.0.1:9876" })
        : { apiKey: "relay-secret", baseUrl: "https://relay.example/v1", proxyUrl: undefined, pricingMultiplier: 1 } }));
    }
  } finally { await adapter.dispose(); }
});

it("isolates duplicate upstream model IDs and never falls back after a connection is deleted", async () => {
  const { settings } = await fixture();
  for (const id of ["relay-one", "relay-two"]) await settings.createCustomConnection({ providerId: "openrouter", connectionId: id, protocol: "anthropic-messages", displayName: id, apiKey: id, baseUrl: `https://${id}.example`, defaultModel: "same-model" });
  const models = new ModelStoreService({ settings });
  const runtime = new ModelRuntimeService(settings, models);
  const keys = models.listUsableModels("chat").filter((model) => model.apiModel === "same-model").map((model) => model.key);
  expect(keys).toHaveLength(2);
  await settings.removeCustomConnection("relay-one");
  expect(runtime.resolveMainModel(keys[0])).toMatchObject({ ok: false, reason: "connection_unavailable" });
  expect(runtime.resolveMainModel(keys[1])).toMatchObject({ ok: true, model: { providerRuntime: { apiKey: "relay-two" } } });
  expect(settings.getProviderRuntimeConfigForCredential("openrouter", undefined, "relay-one")).toMatchObject({ ok: false });
});

it("keeps an old connection without protocol on Chat and does not mutate models while editing the connection", async () => {
  const { root, settings } = await fixture();
  const input = { providerId: "openrouter" as const, connectionId: "old-relay", catalogId: "openai", displayName: "Old", apiKey: "old-secret", baseUrl: "https://old.example/v1", defaultModel: "first" };
  await settings.createCustomConnection(input);
  const raw = JSON.parse(await readFile(join(root, "settings.json"), "utf8"));
  delete raw.models.connections["old-relay"].protocol;
  await writeFile(join(root, "settings.json"), JSON.stringify(raw));
  const reloaded = new SettingsService({ dataRoot: root, crypto });
  await reloaded.load();
  await reloaded.updateCustomConnection({ ...input, apiKey: "", defaultModel: "second" });
  const models = new ModelStoreService({ settings: reloaded });
  const runtime = new ModelRuntimeService(reloaded, models);
  for (const model of models.listUsableModels("chat").filter((model) => model.apiModel === "first")) {
    expect(runtime.resolveMainModel(model.key)).toMatchObject({ ok: true, model: { definition: { api: "openai-completions" }, providerRuntime: { apiKey: "old-secret" } } });
  }
  expect(models.listUsableModels("chat").filter((model) => ["first", "second"].includes(model.apiModel))).toHaveLength(1);
  expect(reloaded.getV4().settings.models.connections["old-relay"]?.defaultModel).toBe("first");
  await expect(reloaded.updateCustomConnection({ ...input, protocol: "anthropic-messages" })).rejects.toThrow("协议不可更改");
});

it("manually adds, edits, defaults and deletes connection-scoped models with pricing", async () => {
  const { root, settings } = await fixture();
  await settings.createCustomConnection({
    providerId: "openrouter",
    protocol: "anthropic-messages",
    connectionId: "priced-relay",
    displayName: "Priced Relay",
    apiKey: "secret",
    baseUrl: "https://relay.example",
    initialModel: {
      apiModel: "claude-primary",
      label: "Primary",
      enabled: true,
      contextWindow: 1_000_000,
      maxTokens: 128_000,
      input: ["text", "image"],
      reasoningConfig: { mode: "manual", support: "supported", efforts: ["low", "medium", "high"], defaultEffort: "medium", allowOff: true },
      pricing: { currency: "USD", inputCacheMissPerMillion: 5, outputPerMillion: 25, inputCacheHitPerMillion: 0.5, inputCacheWritePerMillion: 6.25 },
    },
  });
  const models = new ModelStoreService({ settings, now: () => new Date("2026-09-24T00:00:00.000Z") });
  const primary = models.listInstalledModels().find((model) => model.settings.connectionId === "priced-relay")!;
  expect(primary.definition).toMatchObject({ apiModel: "claude-primary", pricing: { inputCacheWritePerMillion: 6.25 } });
  const primaryRuntime = new ModelRuntimeService(settings, models).resolveMainModel(primary.definition.key);
  expect(primaryRuntime).toMatchObject({ ok: true });
  if (primaryRuntime.ok) expect(new ModelRuntimeService(settings, models).resolvePricing(primaryRuntime.model, primary.definition.apiModel)).toMatchObject({
    providerId: "openrouter",
    connectionId: "priced-relay",
    source: "configured",
    currency: "USD",
    rates: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  });

  expect(await models.addCustomModel({
    connectionId: "priced-relay",
    apiModel: "claude-backup",
    label: "Backup",
    enabled: true,
    contextWindow: 200_000,
    maxTokens: 64_000,
    input: ["text"],
    reasoningConfig: { mode: "auto" },
    pricing: null,
    setAsConnectionDefault: false,
  })).toMatchObject({ ok: true });
  expect(await models.addCustomModel({
    connectionId: "priced-relay",
    apiModel: "claude-backup",
    label: "Duplicate",
    enabled: true,
    contextWindow: null,
    maxTokens: null,
    input: ["text"],
    reasoningConfig: { mode: "auto" },
    pricing: null,
    setAsConnectionDefault: false,
  })).toMatchObject({ ok: false, code: "model_already_exists" });
  expect(await models.addCustomModel({
    connectionId: "priced-relay",
    apiModel: "claude-invalid-price",
    label: "Invalid price",
    enabled: true,
    contextWindow: null,
    maxTokens: null,
    input: ["text"],
    reasoningConfig: { mode: "auto" },
    pricing: { currency: "USD", inputCacheMissPerMillion: Number.NaN, outputPerMillion: 1, inputCacheHitPerMillion: 1, inputCacheWritePerMillion: 1 },
    setAsConnectionDefault: false,
  })).toMatchObject({ ok: false, code: "invalid_pricing" });
  const backup = models.listInstalledModels().find((model) => model.definition.apiModel === "claude-backup")!;
  expect(settings.getV4().settings.models.connections["priced-relay"]?.defaultModel).toBe("claude-primary");
  expect(await models.removeModel(primary.definition.key)).toMatchObject({ ok: false, code: "default_model_requires_replacement" });
  expect(await models.setCustomConnectionDefaultModel({ connectionId: "priced-relay", modelKey: backup.definition.key })).toMatchObject({ ok: true });
  expect(await models.editCustomModel({
    modelKey: backup.definition.key,
    label: "Backup Updated",
    enabled: false,
    contextWindow: 300_000,
    maxTokens: 70_000,
    input: ["text", "image"],
    reasoningConfig: { mode: "auto" },
    pricing: { currency: "CNY", inputCacheMissPerMillion: 3, outputPerMillion: 12, inputCacheHitPerMillion: 0.3, inputCacheWritePerMillion: 4 },
  })).toMatchObject({ ok: true });
  expect(await models.removeModel(primary.definition.key)).toMatchObject({ ok: true });

  const reloaded = new SettingsService({ dataRoot: root, crypto });
  await reloaded.load();
  const persisted = new ModelStoreService({ settings: reloaded }).listInstalledModels().find((model) => model.definition.apiModel === "claude-backup")!;
  expect(persisted).toMatchObject({
    definition: { label: "Backup Updated", contextWindow: 300_000, capabilities: { input: ["text", "image"] }, pricing: { currency: "USD", inputCacheWritePerMillion: 4 / 7.2 } },
    settings: { enabled: false, connectionId: "priced-relay" },
  });
  expect(reloaded.getV4().settings.models.connections["priced-relay"]?.defaultModel).toBe("claude-backup");
  expect(await new ModelStoreService({ settings: reloaded }).removeModel(persisted.definition.key)).toMatchObject({ ok: true });
  expect(reloaded.getV4().settings.models.connections["priced-relay"]).toMatchObject({ defaultModel: null });
});

it("rejects malformed runtime model mutation inputs without throwing", async () => {
  const { settings } = await fixture();
  await settings.createCustomConnection({ providerId: "openrouter", connectionId: "validated-relay", displayName: "Relay", apiKey: "secret", baseUrl: "https://relay.example/v1", defaultModel: "model" });
  const models = new ModelStoreService({ settings });
  await expect(models.addCustomModel({ connectionId: "validated-relay" } as never)).resolves.toMatchObject({ ok: false, code: "invalid_model" });
  await expect(models.editCustomModel({ modelKey: "openrouter:missing" } as never)).resolves.toMatchObject({ ok: false, code: "invalid_model" });
  await expect(models.setCustomConnectionDefaultModel({ connectionId: "validated-relay" } as never)).resolves.toMatchObject({ ok: false, code: "invalid_model" });
});

it("keeps identical API model ids isolated across custom connections", async () => {
  const { settings } = await fixture();
  for (const connectionId of ["isolated-one", "isolated-two"]) {
    await settings.createCustomConnection({ providerId: "openrouter", connectionId, displayName: connectionId, apiKey: connectionId, baseUrl: "https://relay.example/v1", defaultModel: "shared-alias" });
  }
  const models = new ModelStoreService({ settings });
  const scoped = models.listInstalledModels().filter((model) => model.definition.apiModel === "shared-alias");
  expect(scoped).toHaveLength(2);
  expect(new Set(scoped.map((model) => model.definition.key)).size).toBe(2);
  const first = scoped.find((model) => model.settings.connectionId === "isolated-one")!;
  expect(await models.editCustomModel({ modelKey: first.definition.key, label: "Only One", enabled: true, contextWindow: null, maxTokens: null, input: ["text"], reasoningConfig: { mode: "auto" }, pricing: null })).toMatchObject({ ok: true });
  expect(models.listInstalledModels().find((model) => model.settings.connectionId === "isolated-two")?.definition.label).not.toBe("Only One");
});

it("rejects an invalid protocol before writing a credential or connection", async () => {
  const { settings } = await fixture();
  await expect(settings.createCustomConnection({ providerId: "openrouter", protocol: "invalid" as ModelApi, connectionId: "bad-relay", displayName: "Bad", apiKey: "secret", baseUrl: "https://bad.example", defaultModel: "model" })).rejects.toThrow("协议无效");
  expect(settings.getV4().settings.models.connections["bad-relay"]).toBeUndefined();
});

it("normalizes Anthropic /v1 base URLs to the site root and persists short/off cache modes", async () => {
  const { root, settings } = await fixture();
  await settings.createCustomConnection({ providerId: "openrouter", protocol: "anthropic-messages", connectionId: "v1-anthropic", displayName: "V1", apiKey: "secret", baseUrl: "https://relay.example/v1/", defaultModel: "claude" });
  expect(settings.getV4().settings.models.connections["v1-anthropic"]?.baseUrl).toBe("https://relay.example");
  await expect(settings.createCustomConnection({ providerId: "openrouter", protocol: "anthropic-messages", connectionId: "mismatch", displayName: "Mismatch", apiKey: "secret", baseUrl: "https://relay.example/v1/chat/completions", defaultModel: "claude" })).rejects.toThrow("协议不一致");
  expect(settings.getV4().settings.models.connections["mismatch"]).toBeUndefined();

  await settings.createCustomConnection({ providerId: "openrouter", protocol: "anthropic-messages", connectionId: "anthropic-short", displayName: "Short", apiKey: "secret", baseUrl: "https://relay.example/anthropic", defaultModel: "claude" });
  await settings.createCustomConnection({ providerId: "openrouter", protocol: "anthropic-messages", connectionId: "anthropic-off", displayName: "Off", apiKey: "secret", baseUrl: "https://relay.example", defaultModel: "claude", promptCacheMode: "off" });
  const reloaded = new SettingsService({ dataRoot: root, crypto });
  await reloaded.load();
  expect(reloaded.getV4().settings.models.connections["anthropic-short"]?.promptCacheMode).toBe("short");
  expect(reloaded.getV4().settings.models.connections["anthropic-off"]?.promptCacheMode).toBe("off");
  expect(reloaded.getCustomConnectionRuntimeConfig("anthropic-short")).toMatchObject({ protocol: "anthropic-messages", promptCacheMode: "short", model: "claude" });
  expect(reloaded.getCustomConnectionRuntimeConfig("anthropic-off")).toMatchObject({ promptCacheMode: "off" });
});

it("restores the old key when an edit fails to persist settings", async () => {
  const { root, settings } = await fixture();
  const input = { providerId: "openrouter" as const, connectionId: "edit-relay", displayName: "Relay", apiKey: "old-secret", baseUrl: "https://old.example", defaultModel: "same-model" };
  await settings.createCustomConnection(input);
  let failSettings = false;
  const editing = new SettingsService({ dataRoot: root, crypto, writeJson: async (path, value) => {
    if (failSettings && path.endsWith("settings.json")) throw new Error("fixture write failure");
    await writeFile(path, JSON.stringify(value));
  } });
  await editing.load();
  failSettings = true;
  await expect(editing.updateCustomConnection({ ...input, apiKey: "new-secret", baseUrl: "https://new.example" })).rejects.toThrow();
  const reloaded = new SettingsService({ dataRoot: root, crypto });
  await reloaded.load();
  expect(reloaded.getProviderRuntimeConfigForCredential("openrouter", undefined, input.connectionId)).toMatchObject({ apiKey: "old-secret", baseUrl: "https://old.example" });
});

it("serializes simultaneous additions without losing either connection", async () => {
  const { root, settings } = await fixture();
  await Promise.all(["one", "two"].map((id) => settings.createCustomConnection({ providerId: "openrouter", connectionId: id, displayName: id, apiKey: id, baseUrl: "https://relay.example", defaultModel: "same-model" })));
  const reloaded = new SettingsService({ dataRoot: root, crypto });
  await reloaded.load();
  expect(new ModelStoreService({ settings: reloaded }).listUsableModels("chat").filter((model) => model.apiModel === "same-model")).toHaveLength(2);
});

it("persists per-model manual reasoning across reload and connection rename", async () => {
  const { root, settings } = await fixture();
  const input = { providerId: "openrouter" as const, connectionId: "reasoning-relay", displayName: "Relay", apiKey: "secret", baseUrl: "https://relay.example/v1", defaultModel: "gpt-6-astra" };
  await settings.createCustomConnection(input);
  const models = new ModelStoreService({ settings });
  const key = models.listInstalledModels().find((m) => m.settings.connectionId === input.connectionId)!.definition.key;
  expect(models.getModelSnapshot().definitions[key]?.reasoningConfig).toEqual({ mode: "auto" });
  const reasoningConfig = { mode: "manual" as const, support: "supported" as const, efforts: ["low", "high"] as const, defaultEffort: "high" as const, allowOff: true };
  expect(await models.updateModelSettings(key, { reasoningConfig: { ...reasoningConfig, efforts: [...reasoningConfig.efforts] } })).toMatchObject({ ok: true });
  await settings.updateCustomConnection({ ...input, displayName: "Renamed", apiKey: "" });
  const reloaded = new SettingsService({ dataRoot: root, crypto }); await reloaded.load();
  const definition = new ModelStoreService({ settings: reloaded }).getModelSnapshot().definitions[key]!;
  expect(definition.reasoningConfig).toEqual(reasoningConfig);
  expect(definition.capabilities).toMatchObject({ reasoning: true, reasoningEfforts: ["low", "high"], reasoningDefaultEffort: "high", thinkingToggle: true });
  expect(await models.updateModelSettings(key, { reasoningConfig: { ...reasoningConfig, efforts: ["low"] } })).toMatchObject({ ok: false, code: "invalid_model" });
});

it.each(["low", undefined] as const)("encodes custom Chat with selected effort %s, never OpenRouter identity", async (effort) => {
  const { settings } = await fixture();
  await settings.createCustomConnection({ providerId: "openrouter", connectionId: "effort-relay", displayName: "Relay", apiKey: "secret", baseUrl: "https://relay.example/v1", defaultModel: "alias", modelReasoning: { mode: "manual", support: "supported", efforts: ["low", "high"], defaultEffort: "high", allowOff: false } });
  const runtime = new ModelRuntimeService(settings, new ModelStoreService({ settings }));
  const adapter = new DesktopLegacyLlmAdapter(runtime, async () => { throw Error("unused"); });
  try {
    await adapter.dispatch({ request: { model: "openrouter:connection/effort-relay/alias", options: { reasoning: true, ...(effort ? { reasoningEffort: effort } : {}) } }, credential: {}, signal: new AbortController().signal } as unknown as LlmAdapterDispatchInput);
    expect(wire).toHaveBeenLastCalledWith(expect.objectContaining({ providerId: "custom" }));
    const sent = dispatch.mock.calls.at(-1) as unknown as [LlmAdapterDispatchInput];
    expect(sent[0].request.options.reasoningEffort).toBe(effort);
    if (!effort) expect(sent[0].request.options.reasoning).toBeUndefined();
  } finally { await adapter.dispose(); }
});

it("creates several catalog models at once with a default, a host-derived name and reference billing", async () => {
  const { settings } = await fixture();
  const draft = (apiModel: string, enabled = true) => ({ apiModel, enabled, contextWindow: null, maxTokens: null, input: ["text"] as const, reasoningConfig: { mode: "auto" as const }, pricing: null });
  const input = { providerId: "openrouter" as const, protocol: "anthropic-messages" as const, catalogId: "custom", displayName: "", apiKey: "secret", baseUrl: "https://relay.example/v1", authMode: "auto" as const, resolvedAuth: "bearer" as const, billingMode: "reference" as const, pricingMultiplier: 0.3 };
  const snapshot = await settings.createCustomConnection({ ...input, connectionId: "batch-one", initialModels: [draft("claude-opus-5"), draft("claude-sonnet-5"), draft("claude-haiku-4-5", false)], defaultApiModel: "claude-sonnet-5" });
  expect(snapshot.settings.models.connections["batch-one"]).toMatchObject({ displayName: "relay.example", baseUrl: "https://relay.example", defaultModel: "claude-sonnet-5", authMode: "auto", resolvedAuth: "bearer", billingMode: "reference", defaultPricingMultiplier: 0.3 });
  const installed = Object.entries(snapshot.settings.models.installed).filter(([, model]) => model?.connectionId === "batch-one");
  expect(new Set(installed.map(([key]) => key)).size).toBe(3);
  expect(Object.fromEntries(installed.map(([key, model]) => [key.split("/").pop(), model?.enabled]))).toEqual({ "claude-opus-5": true, "claude-sonnet-5": true, "claude-haiku-4-5": false });

  const second = await settings.createCustomConnection({ ...input, connectionId: "batch-two", initialModels: [draft("claude-sonnet-5")] });
  expect(second.settings.models.connections["batch-two"]).toMatchObject({ displayName: "relay.example 2", defaultModel: "claude-sonnet-5" });
  await expect(settings.createCustomConnection({ ...input, connectionId: "batch-bad", initialModels: [draft("a")], defaultApiModel: "b" })).rejects.toThrow("默认模型必须是已选模型之一");
  await expect(settings.createCustomConnection({ ...input, connectionId: "batch-empty", initialModels: [] })).rejects.toThrow("至少选择一个模型");
  await expect(settings.createCustomConnection({ ...input, connectionId: "batch-both", initialModels: [draft("a")], initialModel: draft("a") })).rejects.toThrow("只能传一个");
});

it("prices reference connections from the vendor catalog and never multiplies a model's manual price", async () => {
  const { settings } = await fixture();
  const manual = { currency: "USD" as const, inputCacheMissPerMillion: 4, outputPerMillion: 20, inputCacheHitPerMillion: 0.4, inputCacheWritePerMillion: 5 };
  await settings.createCustomConnection({ providerId: "openrouter", protocol: "anthropic-messages", connectionId: "ref-relay", displayName: "Ref", apiKey: "secret", baseUrl: "https://relay.example", billingMode: "reference", pricingMultiplier: 0.3, initialModels: [
    { apiModel: "claude-sonnet-5", enabled: true, contextWindow: null, maxTokens: null, input: ["text"], reasoningConfig: { mode: "auto" }, pricing: null },
    { apiModel: "claude-manual", enabled: true, contextWindow: null, maxTokens: null, input: ["text"], reasoningConfig: { mode: "auto" }, pricing: manual },
  ] });
  const runtime = new ModelRuntimeService(settings, new ModelStoreService({ settings }));
  const catalogModel = runtime.resolveMainModel("openrouter:connection/ref-relay/claude-sonnet-5");
  if (!catalogModel.ok) throw new Error(catalogModel.message);
  expect(runtime.resolvePricing(catalogModel.model, "claude-sonnet-5")?.rates.input).toBeCloseTo(0.6);
  const manualModel = runtime.resolveMainModel("openrouter:connection/ref-relay/claude-manual");
  if (!manualModel.ok) throw new Error(manualModel.message);
  expect(manualModel.model.definition.pricing?.inputCacheMissPerMillion).toBe(4);
  expect(runtime.resolvePricing(manualModel.model, "claude-manual")).toMatchObject({ source: "configured", rates: { input: 4, output: 20 } });

  await settings.updateCustomConnection({ providerId: "openrouter", connectionId: "ref-relay", displayName: "Ref", apiKey: "", baseUrl: "https://relay.example", billingMode: "token" });
  const tokenModel = runtime.resolveMainModel("openrouter:connection/ref-relay/claude-sonnet-5");
  if (!tokenModel.ok) throw new Error(tokenModel.message);
  expect(runtime.resolvePricing(tokenModel.model, "claude-sonnet-5")).toBeNull();
});

it("reads legacy connections as x-api-key with manual billing and drops invalid auth fields", async () => {
  const { root, settings } = await fixture();
  await settings.createCustomConnection({ providerId: "openrouter", protocol: "anthropic-messages", connectionId: "legacy", displayName: "Legacy", apiKey: "secret", baseUrl: "https://relay.example", defaultModel: "claude-sonnet-5" });
  await settings.createCustomConnection({ providerId: "openrouter", protocol: "anthropic-messages", connectionId: "tampered", displayName: "Tampered", apiKey: "secret", baseUrl: "https://relay.example", defaultModel: "claude-sonnet-5" });
  const raw = JSON.parse(await readFile(join(root, "settings.json"), "utf8"));
  expect(raw.models.connections.legacy).not.toHaveProperty("authMode");
  expect(raw.models.connections.legacy).not.toHaveProperty("billingMode");
  Object.assign(raw.models.connections.tampered, { authMode: "basic", resolvedAuth: "bearer", billingMode: "free" });
  await writeFile(join(root, "settings.json"), JSON.stringify(raw));
  const reloaded = new SettingsService({ dataRoot: root, crypto });
  await reloaded.load();
  expect(reloaded.getV4().settings.models.connections.tampered).not.toHaveProperty("authMode");
  expect(reloaded.getV4().settings.models.connections.tampered).not.toHaveProperty("resolvedAuth");
  expect(reloaded.getV4().settings.models.connections.tampered).not.toHaveProperty("billingMode");
  for (const id of ["legacy", "tampered"]) {
    expect(reloaded.getProviderRuntimeConfigForCredential("openrouter", undefined, id)).toMatchObject({ authScheme: "x-api-key", billingMode: "manual", pricingMultiplier: 1 });
  }
  const runtime = new ModelRuntimeService(reloaded, new ModelStoreService({ settings: reloaded }));
  const legacyModel = runtime.resolveMainModel("openrouter:connection/legacy/claude-sonnet-5");
  if (!legacyModel.ok) throw new Error(legacyModel.message);
  expect(runtime.resolvePricing(legacyModel.model, "claude-sonnet-5")).toBeNull();
});

it("remembers the auth scheme a test resolved and forgets it when the address changes", async () => {
  const { settings } = await fixture();
  const input = { providerId: "openrouter" as const, protocol: "anthropic-messages" as const, connectionId: "auto-relay", displayName: "Auto", apiKey: "secret", baseUrl: "https://relay.example", defaultModel: "claude-sonnet-5", authMode: "auto" as const };
  await settings.createCustomConnection(input);
  expect(settings.getProviderRuntimeConfigForCredential("openrouter", undefined, "auto-relay")).toMatchObject({ authScheme: "x-api-key" });
  await settings.markCustomConnectionResult("auto-relay", { ok: true, checkedAt: "2026-09-26T00:00:00.000Z", message: "ok", resolvedAuth: "bearer" });
  expect(settings.getV4().settings.models.connections["auto-relay"]).toMatchObject({ resolvedAuth: "bearer", lastConnection: { status: "available" } });
  expect(settings.getProviderRuntimeConfigForCredential("openrouter", undefined, "auto-relay")).toMatchObject({ authScheme: "bearer" });

  await settings.updateCustomConnection({ ...input, apiKey: "", displayName: "Renamed" });
  expect(settings.getV4().settings.models.connections["auto-relay"]).toMatchObject({ displayName: "Renamed", resolvedAuth: "bearer", lastConnection: { status: "available" } });
  await settings.updateCustomConnection({ ...input, apiKey: "", baseUrl: "https://other.example" });
  expect(settings.getV4().settings.models.connections["auto-relay"]).not.toHaveProperty("resolvedAuth");
  expect(settings.getV4().settings.models.connections["auto-relay"]?.lastConnection.status).toBe("untested");
  await settings.updateCustomConnection({ ...input, apiKey: "", authMode: "bearer" });
  expect(settings.getProviderRuntimeConfigForCredential("openrouter", undefined, "auto-relay")).toMatchObject({ authScheme: "bearer" });
});

it("dispatches Bearer connections with an Authorization header and no apiKey", async () => {
  const { settings } = await fixture();
  await settings.createCustomConnection({ providerId: "openrouter", protocol: "anthropic-messages", connectionId: "bearer-relay", displayName: "Bearer", apiKey: "bearer-secret", baseUrl: "https://relay.example", defaultModel: "claude-sonnet-5", authMode: "bearer" });
  const runtime = new ModelRuntimeService(settings, new ModelStoreService({ settings }));
  const modelKey = "openrouter:connection/bearer-relay/claude-sonnet-5";
  const resolved = await new DesktopCredentialResolver(runtime).resolve(`desktop:model:${modelKey}`, new AbortController().signal);
  expect(resolved).toMatchObject({ headers: { Authorization: "Bearer bearer-secret" } });
  expect(resolved).not.toHaveProperty("apiKey");
  const adapter = new DesktopLegacyLlmAdapter(runtime, async () => { throw new Error("unused"); });
  try {
    const credential = await new DesktopCredentialResolver(runtime).resolve("desktop:default", new AbortController().signal);
    await adapter.dispatch({ request: { model: modelKey, options: {} }, credential, signal: new AbortController().signal } as unknown as LlmAdapterDispatchInput);
    const sent = (dispatch.mock.lastCall as unknown as [{ credential: Record<string, unknown> }])[0].credential;
    expect(sent).toMatchObject({ headers: { Authorization: "Bearer bearer-secret" }, baseUrl: "https://relay.example" });
    expect(sent).not.toHaveProperty("apiKey");
  } finally { await adapter.dispose(); }
});
