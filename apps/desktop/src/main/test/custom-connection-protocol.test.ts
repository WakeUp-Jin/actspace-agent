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
import { ModelConnectionsService } from "../model-connections-service";
import type { ProviderNetworkService } from "../runtime-v2/provider-network-service";

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
/** 设置 › 模型的新写入入口；这些用例不走网络。 */
function connectionsService(settings: SettingsService) {
  return new ModelConnectionsService(settings, new ModelStoreService({ settings }), {} as ProviderNetworkService);
}

it("persists a model's thinking override across reload and connection rename", async () => {
  const { root, settings } = await fixture();
  const service = connectionsService(settings);
  const created = await service.create({ templateId: "custom", apiKey: "secret", baseUrl: "https://relay.example/v1", label: "Relay", models: [{ apiModel: "gpt-6-astra" }] });
  if (!created.ok) throw new Error(created.error.message);
  const key = created.view.connections[0]!.models[0]!.key;
  const thinking = { levels: ["off", "low", "high"] as const, default: "high" as const };
  expect(await service.updateModel({ key, overrides: { thinking: { levels: [...thinking.levels], default: thinking.default } } })).toMatchObject({ ok: true });
  expect(await service.update({ connectionId: created.connectionId!, label: "Renamed" })).toMatchObject({ ok: true });
  const reloaded = new SettingsService({ dataRoot: root, crypto }); await reloaded.load();
  const definition = new ModelStoreService({ settings: reloaded }).getModelSnapshot().definitions[key]!;
  expect(definition.effective).toMatchObject({ thinking: { levels: ["off", "low", "high"], default: "high" }, sources: { thinking: "user" } });
  expect(definition.capabilities).toMatchObject({ reasoning: true, reasoningEfforts: ["low", "high"], reasoningDefaultEffort: "high", thinkingToggle: true });
});

it.each(["low", undefined] as const)("encodes custom Chat with selected effort %s, never OpenRouter identity", async (effort) => {
  const { settings } = await fixture();
  const service = connectionsService(settings);
  const created = await service.create({ templateId: "custom", protocol: "openai-completions", apiKey: "secret", baseUrl: "https://relay.example/v1", label: "Relay", models: [{ apiModel: "alias" }] });
  if (!created.ok) throw new Error(created.error.message);
  const key = created.view.connections[0]!.models[0]!.key;
  expect(await service.updateModel({ key, overrides: { thinking: { levels: ["off", "low", "high"], default: "high" } } })).toMatchObject({ ok: true });
  const runtime = new ModelRuntimeService(settings, new ModelStoreService({ settings }));
  const adapter = new DesktopLegacyLlmAdapter(runtime, async () => { throw Error("unused"); });
  try {
    await adapter.dispatch({ request: { model: key, options: { reasoning: true, ...(effort ? { reasoningEffort: effort } : {}) } }, credential: {}, signal: new AbortController().signal } as unknown as LlmAdapterDispatchInput);
    expect(wire).toHaveBeenLastCalledWith(expect.objectContaining({ providerId: "custom" }));
    const sent = dispatch.mock.calls.at(-1) as unknown as [LlmAdapterDispatchInput];
    expect(sent[0].request.options.reasoningEffort).toBe(effort);
    if (!effort) expect(sent[0].request.options.reasoning).toBeUndefined();
  } finally { await adapter.dispose(); }
});

it("prices catalog matches at the reference rate times the multiplier and never multiplies a model's own price", async () => {
  const { settings } = await fixture();
  const created = await connectionsService(settings).create({ templateId: "custom", protocol: "anthropic-messages", apiKey: "secret", baseUrl: "https://relay.example", multiplier: 0.3, models: [
    { apiModel: "claude-sonnet-5" },
    { apiModel: "claude-manual", overrides: { rates: { input: 4, output: 20, cacheRead: 0.4, cacheWrite: 5 } } },
  ] });
  if (!created.ok) throw new Error(created.error.message);
  const keys = Object.fromEntries(created.view.connections[0]!.models.map((model) => [model.apiModel, model.key]));
  const runtime = new ModelRuntimeService(settings, new ModelStoreService({ settings }));
  const catalogModel = runtime.resolveMainModel(keys["claude-sonnet-5"]!);
  if (!catalogModel.ok) throw new Error(catalogModel.message);
  expect(runtime.resolvePricing(catalogModel.model, "claude-sonnet-5")?.rates.input).toBeCloseTo(0.6);
  const manualModel = runtime.resolveMainModel(keys["claude-manual"]!);
  if (!manualModel.ok) throw new Error(manualModel.message);
  expect(manualModel.model.definition.pricing?.inputCacheMissPerMillion).toBe(4);
  expect(runtime.resolvePricing(manualModel.model, "claude-manual")).toMatchObject({ source: "configured", rates: { input: 4, output: 20 } });
});

it.each(["openai-completions", "anthropic-messages"] as const)("binds mode cache retention and honors connection opt-out (%s)", async (api) => {
  for (const promptCacheMode of [undefined, "off"] as const) {
    const resolution = { ok: true as const, model: { key: "fixture", definition: { api, provider: "openrouter", apiModel: "anthropic/claude-fixture", contextWindow: 1_000_000 }, providerRuntime: { baseUrl: "https://openrouter.ai/api/v1", promptCacheMode } } };
    const adapter = new DesktopLegacyLlmAdapter({ resolveMainModel: () => resolution, resolveImageInspectionModel: () => resolution, getToolEnvironment: () => ({ searchCredentials: {} }) }, async () => { throw Error("unused"); });
    try {
      for (const cacheRetention of ["long", "short", "none"] as const) {
        await adapter.dispatch({ request: { model: "fixture", options: { cacheRetention } }, credential: {}, signal: new AbortController().signal } as unknown as LlmAdapterDispatchInput);
        expect(wire).toHaveBeenLastCalledWith(expect.objectContaining({ cacheRetention: promptCacheMode === "off" ? "none" : cacheRetention }));
      }
    } finally { await adapter.dispose(); }
  }
});
