// @vitest-environment node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { BUILTIN_MODEL_CATALOG } from "@actspace/shared/model-catalog-data";
import type { CustomConnectionProbeResult, ModelCatalogEntry, ModelKey } from "@actspace/shared";
import { SettingsService, type SecretCrypto } from "../settings-service";
import { ModelStoreService } from "../model-store-service";
import { ModelRuntimeService } from "../model-runtime-service";
import { ModelConnectionsService } from "../model-connections-service";
import type { ProviderNetworkService } from "../runtime-v2/provider-network-service";
import { thinkingLevelOptions } from "../runtime-v2/legacy-llm-adapter";

const roots: string[] = [];
const crypto: SecretCrypto = { isAvailable: () => true, encrypt: (text) => Buffer.from(text), decrypt: (data) => data.toString() };
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

const entry = (over: Partial<ModelCatalogEntry> & Pick<ModelCatalogEntry, "apiModel" | "sourceProviderId">): ModelCatalogEntry => ({
  source: "models.dev", name: over.apiModel, currency: "USD", unsupportedBilling: false,
  rates: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  contextWindow: 200_000, maxOutput: 64_000, input: ["text", "image"], reasoning: true, ...over,
});
const catalog = {
  ...BUILTIN_MODEL_CATALOG,
  entries: [
    entry({ sourceProviderId: "anthropic", apiModel: "claude-sonnet-5", name: "Claude Sonnet 5" }),
    entry({ sourceProviderId: "openai", apiModel: "gpt-5.5", name: "GPT-5.5", rates: { input: 2, output: 8, cacheRead: 0.2, cacheWrite: null } }),
    entry({ sourceProviderId: "deepseek", apiModel: "deepseek-flash", name: "DeepSeek Flash", input: ["text"] }),
  ],
};

type ProbeReply = Omit<CustomConnectionProbeResult, "checkedAt" | "message"> & { message?: string };
async function fixture(reply: ProbeReply = { ok: true, models: [] }) {
  const root = await mkdtemp(join(tmpdir(), "actspace-model-connections-"));
  roots.push(root);
  const settings = new SettingsService({ dataRoot: root, crypto });
  await settings.load();
  for (const provider of ["deepseek", "kimi", "openrouter"] as const) await settings.clearProviderKey(provider);
  const probe = vi.fn(async () => ({ message: "ok", checkedAt: "2026-10-21T00:00:00.000Z", ...reply }) as CustomConnectionProbeResult);
  const network = { probeCustomConnection: probe, getBalance: vi.fn(async (provider: string, runtime?: { apiKey: string }) => ({ provider, isConfigured: Boolean(runtime), isAvailable: true, generatedAt: "", displayBalance: runtime ? { amount: "1.00", currency: "CNY" } : null })) } as unknown as ProviderNetworkService;
  const models = new ModelStoreService({ settings, catalog: () => catalog });
  const service = new ModelConnectionsService(settings, models, network);
  const runtime = new ModelRuntimeService(settings, models, () => catalog);
  return { root, settings, models, service, runtime, probe, network };
}

it("adds a relay with /models facts that beat the catalog, and user changes that beat both", async () => {
  const { root, service, runtime, probe } = await fixture({ ok: true, models: [
    { id: "claude-sonnet-5", facts: { contextWindow: 1_000_000, rates: { input: 2, output: 10, cacheRead: null, cacheWrite: null } } },
    { id: "relay-coder-v2" },
  ] });
  const draft = { templateId: "custom", apiKey: "relay-secret", protocol: "anthropic-messages" as const, baseUrl: "https://relay.example/v1/messages", label: "My Relay" };
  const probed = await service.probe({ kind: "draft", draft });
  // 粘贴的完整接口地址被剥成站点根地址，协议按地址推断。
  expect(probe).toHaveBeenLastCalledWith(expect.objectContaining({ protocol: "anthropic-messages", baseUrl: "https://relay.example", authMode: "auto" }));
  expect(probed).toMatchObject({ ok: true, listSource: "provider" });
  // 中转不和目录取交集：目录里没有的模型也列出来。
  expect(probed.models.map((model) => model.apiModel)).toEqual(["claude-sonnet-5", "relay-coder-v2"]);
  expect(probed.models[0]!.effective).toMatchObject({ contextWindow: 1_000_000, sources: { contextWindow: "provider", maxOutput: "catalog" } });

  const created = await service.create({ ...draft, multiplier: 0.5, resolvedAuth: "bearer", models: probed.models.map((model) => ({ apiModel: model.apiModel, providerFacts: model.providerFacts })) });
  if (!created.ok) throw new Error(created.error.message);
  const connection = created.view.connections.find((item) => item.connectionId === created.connectionId)!;
  expect(connection).toMatchObject({ label: "My Relay", relay: true, templateId: "custom", protocol: "anthropic-messages", baseUrl: "https://relay.example", hasApiKey: true, multiplier: 0.5 });
  const sonnet = connection.models.find((model) => model.apiModel === "claude-sonnet-5")!;
  // 服务商价 × 倍率；未知模型保持未知。
  expect(sonnet.effective.rates).toEqual({ input: 1, output: 5, cacheRead: null, cacheWrite: null });
  expect(connection.models.find((model) => model.apiModel === "relay-coder-v2")!.effective).toMatchObject({ contextWindow: null, rates: null, thinking: null });
  expect(await readFile(join(root, "settings.json"), "utf8")).not.toContain("relay-secret");

  const edited = await service.updateModel({ key: sonnet.key, overrides: { contextWindow: 500_000, rates: { input: 4, output: 20, cacheRead: null, cacheWrite: null } } });
  if (!edited.ok) throw new Error(edited.error.message);
  const after = edited.view.connections[0]!.models.find((model) => model.key === sonnet.key)!;
  expect(after.overrides).toMatchObject({ contextWindow: 500_000 });
  expect(after.effective).toMatchObject({ contextWindow: 500_000, rates: { input: 4 }, ratesScaled: false, sources: { contextWindow: "user", rates: "user" } });

  const resolved = runtime.resolveMainModel(sonnet.key);
  if (!resolved.ok) throw new Error(resolved.message);
  expect(resolved.model).toMatchObject({ definition: { api: "anthropic-messages", contextWindow: 500_000 }, providerRuntime: { apiKey: "relay-secret", baseUrl: "https://relay.example", authScheme: "bearer" } });
  // 手填价不再乘倍率。
  expect(runtime.resolvePricing(resolved.model, "claude-sonnet-5")).toMatchObject({ rates: { input: 4, output: 20 } });

  const reset = await service.updateModel({ key: sonnet.key, overrides: null });
  expect(reset.ok && reset.view.connections[0]!.models.find((model) => model.key === sonnet.key)!.overrides).toBeNull();
});

it("filters an official /models list to the catalog and falls back to catalog models when the list is missing", async () => {
  const { service, probe } = await fixture({ ok: true, models: [{ id: "gpt-5.5" }, { id: "text-embedding-3-large" }] });
  const listed = await service.probe({ kind: "draft", draft: { templateId: "openai", apiKey: "sk-openai" } });
  expect(probe).toHaveBeenLastCalledWith(expect.objectContaining({ protocol: "openai-responses", baseUrl: "https://api.openai.com/v1" }));
  expect(listed.models.map((model) => model.apiModel)).toEqual(["gpt-5.5"]);

  probe.mockResolvedValueOnce({ ok: true, message: "no list", checkedAt: "", statusCode: 404, models: null });
  const fallback = await service.probe({ kind: "draft", draft: { templateId: "anthropic", apiKey: "sk-ant" } });
  expect(fallback).toMatchObject({ ok: true, listSource: "catalog", models: [{ apiModel: "claude-sonnet-5", effective: { sources: { contextWindow: "catalog" } } }] });

  probe.mockResolvedValueOnce({ ok: true, message: "no list", checkedAt: "", statusCode: 404, models: null });
  expect(await service.probe({ kind: "draft", draft: { templateId: "custom", apiKey: "k", baseUrl: "https://relay.example/v1" } })).toMatchObject({ listSource: "none", models: [] });

  probe.mockResolvedValueOnce({ ok: false, message: "bad key", checkedAt: "", errorKind: "auth", statusCode: 401, models: null });
  expect(await service.probe({ kind: "draft", draft: { templateId: "openai", apiKey: "wrong" } })).toMatchObject({ ok: false, errorKind: "auth", listSource: "none" });
  expect(await service.probe({ kind: "draft", draft: { templateId: "openai", apiKey: " " } })).toMatchObject({ ok: false, message: "请输入 API Key。" });
});

it("puts the first DeepSeek key on the built-in connection with an empty model list and a second key on its own connection", async () => {
  const { settings, service, runtime } = await fixture();
  expect(service.list().connections).toEqual([]);
  const first = await service.create({ templateId: "deepseek", apiKey: "ds-one", models: [] });
  if (!first.ok) throw new Error(first.error.message);
  expect(first.connectionId).toBe("deepseek:default");
  expect(settings.getStoredKey("deepseek")).toBe("ds-one");
  const builtin = first.view.connections[0]!;
  expect(builtin).toMatchObject({ templateId: "deepseek", label: "DeepSeek", balance: true, relay: false, defaultBaseUrl: "https://api.deepseek.com" });
  // 新连接从空列表开始：预装的内置模型被清掉，由用户自己挑。
  expect(builtin.models).toEqual([]);
  const added = await service.addModels({ connectionId: "deepseek:default", models: [{ apiModel: "deepseek-flash" }] });
  if (!added.ok) throw new Error(added.error.message);
  const flash = added.view.connections[0]!.models.find((model) => model.key === "deepseek:deepseek-flash")!;
  expect(flash).toBeDefined();
  expect(runtime.resolveMainModel("deepseek:deepseek-flash")).toMatchObject({ ok: true, model: { providerRuntime: { apiKey: "ds-one" } } });

  const second = await service.create({ templateId: "deepseek", apiKey: "ds-two", label: "DeepSeek 团队", models: [{ apiModel: "deepseek-flash" }] });
  if (!second.ok) throw new Error(second.error.message);
  expect(second.connectionId).toMatch(/^deepseek-/);
  const team = second.view.connections.find((item) => item.connectionId === second.connectionId)!;
  expect(team).toMatchObject({ label: "DeepSeek 团队", templateId: "deepseek", balance: true });
  const teamFlash = team.models[0]!;
  expect(runtime.resolveMainModel(teamFlash.key)).toMatchObject({ ok: true, model: { providerRuntime: { apiKey: "ds-two", baseUrl: "https://api.deepseek.com" } } });
  await expect(service.getBalance({ connectionId: second.connectionId! })).resolves.toMatchObject({ isConfigured: true });

  // 内置模型也能移除，定义保留，之后可以再加回来。
  const removed = await service.removeModel({ key: flash.key });
  if (!removed.ok) throw new Error(removed.error.message);
  expect(removed.view.connections.find((item) => item.connectionId === "deepseek:default")!.models).toEqual([]);
  expect(settings.getV4().settings.models.installed[flash.key]).toBeUndefined();
  const back = await service.addModels({ connectionId: "deepseek:default", models: [{ apiModel: "deepseek-flash" }] });
  expect(back.ok && back.view.connections.find((item) => item.connectionId === "deepseek:default")!.models.map((model) => model.key)).toEqual([flash.key]);
});

it("removes models and connections together with their purpose bindings and keys", async () => {
  const { settings, service } = await fixture({ ok: true, models: [{ id: "relay-a" }, { id: "relay-b" }] });
  const created = await service.create({ templateId: "custom", apiKey: "relay-secret", baseUrl: "https://relay.example/v1", models: [{ apiModel: "relay-a" }, { apiModel: "relay-b" }] });
  if (!created.ok) throw new Error(created.error.message);
  const [a, b] = created.view.connections[0]!.models;
  const bound = await service.updatePurposes({ utility: { model: a!.key, thinking: "high" }, explore: { model: b!.key, thinking: null } });
  if (!bound.ok) throw new Error(bound.error.message);
  expect(bound.view.purposes).toMatchObject({ utility: { model: a!.key, thinking: "high" }, explore: { model: b!.key, thinking: null } });
  expect(bound.view.connections[0]!.models.find((model) => model.key === a!.key)!.usedBy).toEqual(["utility"]);
  expect(await service.updatePurposes({ vision: { model: "openrouter:missing" as ModelKey, thinking: null } })).toMatchObject({ ok: false, error: { code: "model_missing" } });

  const removed = await service.removeModel({ key: a!.key });
  if (!removed.ok) throw new Error(removed.error.message);
  expect(removed.view.purposes.utility).toEqual({ model: null, thinking: "high" });
  expect(settings.getV4().settings.models.definitions[a!.key]).toBeUndefined();

  const gone = await service.remove({ connectionId: created.connectionId! });
  if (!gone.ok) throw new Error(gone.error.message);
  expect(gone.view.connections).toEqual([]);
  expect(gone.view.purposes.explore.model).toBeNull();
  expect(settings.getV4().settings.models.installed[b!.key]).toBeUndefined();
  expect(settings.hasConnectionKey(created.connectionId!, "openrouter")).toBe(false);
});

it("updates a connection and forgets the tested auth when the address changes", async () => {
  const { settings, service } = await fixture({ ok: true, resolvedAuth: "bearer", models: [{ id: "claude-sonnet-5" }] });
  const created = await service.create({ templateId: "custom", protocol: "anthropic-messages", apiKey: "k", baseUrl: "https://relay.example", models: [{ apiModel: "claude-sonnet-5" }] });
  if (!created.ok) throw new Error(created.error.message);
  const id = created.connectionId!;
  await service.probe({ kind: "saved", connectionId: id });
  expect(settings.getV4().settings.models.connections[id]).toMatchObject({ resolvedAuth: "bearer", lastConnection: { status: "available" } });
  const moved = await service.update({ connectionId: id, baseUrl: "https://other.example", multiplier: 2, protocol: "openai-completions" });
  if (!moved.ok) throw new Error(moved.error.message);
  expect(settings.getV4().settings.models.connections[id]).not.toHaveProperty("resolvedAuth");
  expect(moved.view.connections[0]).toMatchObject({ baseUrl: "https://other.example", multiplier: 2, protocol: "openai-completions", lastConnection: { status: "untested" } });
  expect(settings.getV4().settings.models.definitions[moved.view.connections[0]!.models[0]!.key]).toMatchObject({ api: "openai-completions" });

  // 再次添加已有的模型：只刷新服务商数据；新模型直接在用。
  const refreshed = await service.addModels({ connectionId: id, models: [
    { apiModel: "claude-sonnet-5", providerFacts: { contextWindow: 900_000 } },
    { apiModel: "relay-new" },
  ] });
  if (!refreshed.ok) throw new Error(refreshed.error.message);
  const rows = refreshed.view.connections[0]!.models;
  expect(rows.find((model) => model.apiModel === "claude-sonnet-5")).toMatchObject({ effective: { contextWindow: 900_000, sources: { contextWindow: "provider" } } });
  expect(settings.getV4().settings.models.installed[rows.find((model) => model.apiModel === "relay-new")!.key]).toMatchObject({ enabled: true });
  expect(await service.update({ connectionId: id, baseUrl: "ftp://bad" })).toMatchObject({ ok: false, error: { code: "invalid_base_url" } });
});

it("previews a model for a draft connection without saving it", async () => {
  const { service, settings } = await fixture();
  expect(service.preview({ apiModel: "claude-sonnet-5", templateId: "custom", protocol: "anthropic-messages", multiplier: 0.5 })).toMatchObject({ added: false, effective: { contextWindow: 200_000, rates: { input: 1.5 } } });
  expect(service.preview({ apiModel: "claude-sonnet-5", templateId: "anthropic", overrides: { label: "Sonnet" } }).effective).toMatchObject({ label: "Sonnet", sources: { label: "user" } });
  expect(Object.keys(settings.getV4().settings.models.connections).filter((id) => !id.endsWith(":default"))).toEqual([]);
});

it("resolves vision from the purpose table, then the chat model, then the first model that can see images", async () => {
  const { service, runtime, settings } = await fixture({ ok: true, models: [
    { id: "text-only", facts: { input: ["text"] } },
    { id: "seeing", facts: { input: ["text", "image"] } },
  ] });
  expect(runtime.resolveImageInspectionModel()).toMatchObject({ ok: false });
  const created = await service.create({ templateId: "custom", apiKey: "k", baseUrl: "https://relay.example/v1", models: [{ apiModel: "text-only", providerFacts: { input: ["text"] } }, { apiModel: "seeing", providerFacts: { input: ["text", "image"] } }] });
  if (!created.ok) throw new Error(created.error.message);
  const keys = Object.fromEntries(created.view.connections[0]!.models.map((model) => [model.apiModel, model.key]));
  await service.updatePurposes({ chat: { model: keys["text-only"]!, thinking: null } });
  expect(runtime.resolveImageInspectionModel()).toMatchObject({ ok: true, model: { key: keys.seeing, source: "fallback" } });
  await service.updatePurposes({ chat: { model: keys.seeing!, thinking: null } });
  expect(runtime.resolveImageInspectionModel()).toMatchObject({ ok: true, model: { key: keys.seeing } });
  await service.updatePurposes({ vision: { model: keys["text-only"]!, thinking: "off" } });
  // 用途表指定了不能看图的模型：明确报错，不悄悄换模型。
  expect(runtime.resolveImageInspectionModel()).toMatchObject({ ok: false });
  expect(runtime.purposeThinking("vision")).toBe("off");
  expect(settings.getModelStorageState().taskModels.thinking).toMatchObject({ utility: "off", autoReview: "off", vision: "off" });
});

it("maps purpose thinking levels to request options only for levels the model declares", () => {
  expect(thinkingLevelOptions("off", undefined)).toEqual({ reasoning: false });
  expect(thinkingLevelOptions("high", { input: ["text"], toolUse: "declared", reasoning: true, thinkingToggle: true, reasoningEfforts: ["low", "high"] })).toEqual({ reasoning: true, reasoningEffort: "high" });
  expect(thinkingLevelOptions("max", { input: ["text"], toolUse: "declared", reasoning: true, thinkingToggle: true })).toEqual({ reasoning: true });
});
