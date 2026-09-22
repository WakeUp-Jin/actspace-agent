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

it("keeps an old connection without protocol on Chat when edited, and preserves models referenced by tasks", async () => {
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
  for (const model of models.listUsableModels("chat").filter((model) => ["first", "second"].includes(model.apiModel))) {
    expect(runtime.resolveMainModel(model.key)).toMatchObject({ ok: true, model: { definition: { api: "openai-completions" }, providerRuntime: { apiKey: "old-secret" } } });
  }
  expect(models.listUsableModels("chat").filter((model) => ["first", "second"].includes(model.apiModel))).toHaveLength(2);
  await expect(reloaded.updateCustomConnection({ ...input, protocol: "anthropic-messages" })).rejects.toThrow("协议不可更改");
});

it("rejects an invalid protocol before writing a credential or connection", async () => {
  const { settings } = await fixture();
  await expect(settings.createCustomConnection({ providerId: "openrouter", protocol: "invalid" as ModelApi, connectionId: "bad-relay", displayName: "Bad", apiKey: "secret", baseUrl: "https://bad.example", defaultModel: "model" })).rejects.toThrow("协议无效");
  expect(settings.getV4().settings.models.connections["bad-relay"]).toBeUndefined();
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
