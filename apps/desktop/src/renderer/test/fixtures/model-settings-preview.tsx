/** Explicit development fixture. Never imported by the application entry point. */
import React from "react";
import { createRoot } from "react-dom/client";
import { customModelDraftFromCatalog, findBuiltinCatalogModel, type CustomConnectionInput, type CustomModelDraftInput, type InstalledModelView, type SettingsV4ConnectionSettings } from "@actspace/shared";
import { ProviderSettings } from "../../components/settings/ProviderSettings";
import { PageShell } from "../../components/settings/SettingsPrimitives";
import { TooltipProvider } from "../../components/ui/Tooltip";
import "../../styles/index.css";

const query = new URLSearchParams(location.search);
document.documentElement.dataset.theme = query.get("theme") ?? "light";
// 和设计 demo 的四种场景一一对应：ok 正常、bearer 只认 Bearer、nolist 不提供模型列表、badkey Key 错误。
const scenario = (query.get("scenario") ?? "ok") as "ok" | "bearer" | "nolist" | "badkey";
const RELAY_MODELS = ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5", "claude-opus-4-5", "claude-sonnet-4-5", "relay-claude-thinking", "relay-mirror-sonnet", "glm-4.6", "kimi-k2-turbo"];
const OFFICIAL_MODELS = ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5", "claude-opus-4-5"];
const OPENAI_MODELS = ["gpt-5.1", "gpt-5.1-mini", "gpt-4.1"];
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const now = () => new Date().toISOString();

// 内存里的连接和模型，刷新页面即清空。
const connections: Record<string, SettingsV4ConnectionSettings> = {};
const models: InstalledModelView[] = [];

function installModel(connectionId: string, protocol: SettingsV4ConnectionSettings["protocol"], draft: CustomModelDraftInput) {
  const entry = findBuiltinCatalogModel(draft.apiModel);
  models.push({
    definition: {
      key: `openrouter:connection/${connectionId}/${draft.apiModel}`,
      provider: "openrouter",
      api: protocol ?? "openai-completions",
      apiModel: draft.apiModel,
      label: draft.label ?? entry?.name ?? draft.apiModel,
      source: "custom",
      contextWindow: draft.contextWindow ?? undefined,
      maxTokens: draft.maxTokens ?? undefined,
      thinkingDefault: Boolean(entry?.reasoning),
      reasoningConfig: draft.reasoningConfig,
      capabilities: { input: [...draft.input], toolUse: "declared", reasoning: Boolean(entry?.reasoning), thinkingToggle: Boolean(entry?.reasoning) },
      ...(draft.pricing ? { pricing: draft.pricing } : {}),
    },
    settings: { enabled: draft.enabled, addedAt: now(), connectionId },
    unavailableReasons: {},
  } as InstalledModelView);
}

function createConnection(input: CustomConnectionInput): void {
  const connectionId = input.connectionId ?? `custom-${Math.random().toString(16).slice(2)}`;
  const host = /^https?:\/\/([^/]+)/.exec(input.baseUrl)?.[1] ?? input.baseUrl;
  const initialModels = input.initialModels ?? [];
  connections[connectionId] = {
    connectionId,
    providerId: input.providerId,
    protocol: input.protocol,
    displayName: input.displayName.trim() || host,
    catalogId: input.catalogId,
    baseUrl: input.baseUrl.replace(/\/v1\/?$/, "").replace(/\/+$/, ""),
    enabled: true,
    proxy: input.proxy ?? { enabled: false, url: null },
    lastConnection: { status: input.resolvedAuth ? "available" : "untested", ...(input.resolvedAuth ? { checkedAt: now() } : {}) },
    defaultPricingMultiplier: input.pricingMultiplier ?? 1,
    additionalCredentials: [],
    defaultModel: input.defaultApiModel ?? initialModels[0]?.apiModel ?? null,
    promptCacheMode: input.promptCacheMode,
    ...(input.protocol === "anthropic-messages" ? { authMode: input.authMode ?? "x-api-key", ...(input.resolvedAuth ? { resolvedAuth: input.resolvedAuth } : {}) } : {}),
    billingMode: input.billingMode,
  };
  for (const draft of initialModels) installModel(connectionId, input.protocol, draft);
}

if (query.get("seed") === "1") {
  createConnection({ providerId: "openrouter", connectionId: "relay", protocol: "anthropic-messages", displayName: "", apiKey: "fixture", baseUrl: "https://relay.example.com", catalogId: "custom", authMode: "auto", resolvedAuth: "bearer", billingMode: "reference", pricingMultiplier: 0.3, promptCacheMode: "short", initialModels: ["claude-opus-5", "claude-sonnet-5", "relay-claude-thinking"].map((id) => ({ ...customModelDraftFromCatalog(id), enabled: id !== "relay-claude-thinking" })), defaultApiModel: "claude-sonnet-5" });
  createConnection({ providerId: "openrouter", connectionId: "official", protocol: "anthropic-messages", displayName: "Anthropic", apiKey: "fixture", baseUrl: "https://api.anthropic.com", catalogId: "anthropic", authMode: "x-api-key", billingMode: "reference", pricingMultiplier: 1, promptCacheMode: "short", initialModels: OFFICIAL_MODELS.slice(0, 2).map(customModelDraftFromCatalog), defaultApiModel: "claude-sonnet-5" });
}

const snapshot = () => ({ revision: 1, settings: { models: { connections: { ...connections } } } });
const ok = <T,>(value: T) => ({ ok: true as const, ...value });
const failAuth = { ok: false, errorKind: "auth" as const, statusCode: 401, message: "请检查 API Key 是否正确。", checkedAt: now(), models: null };

window.actspace = {
  listProviders: async () => {
    if (query.get("loading") === "1") await new Promise(() => {});
    return {
    providers: Object.fromEntries(["deepseek", "kimi", "openrouter"].map((id) => [id, {
      hasApiKey: query.get("empty") !== "1" && id === "deepseek", baseUrl: null, proxy: { enabled: false, url: null }, installedModelCount: 2, enabledModelCount: 2,
    }])),
    credentialStorage: { status: "ready" },
    };
  },
  // Fixture saves always fail visibly; this preview cannot persist credentials.
  connectProvider: async () => ({ ok: false, error: { message: "预览样例：不会保存凭据。" } }),
  updateProvider: async () => ({ ok: false, error: { message: "预览样例：不会保存凭据。" } }),
  getSettingsV4: async () => snapshot(),
  probeCustomConnection: async (input: { kind: "draft"; protocol: string; baseUrl: string; authMode: string } | { kind: "saved"; connectionId: string }) => {
    await wait(700);
    const draft = input.kind === "draft" ? input : { ...connections[input.connectionId]!, kind: "saved" as const, authMode: connections[input.connectionId]!.authMode ?? "x-api-key" };
    if (scenario === "badkey") return failAuth;
    const official = draft.baseUrl.includes("api.anthropic.com");
    if (official) return { ok: true, message: "ok", checkedAt: now(), resolvedAuth: "x-api-key", models: OFFICIAL_MODELS.map((id) => ({ id })) };
    if (draft.protocol !== "anthropic-messages") return { ok: true, message: "ok", checkedAt: now(), models: scenario === "nolist" ? null : OPENAI_MODELS.map((id) => ({ id })) };
    if (scenario === "bearer" && draft.authMode === "x-api-key") return failAuth;
    const resolvedAuth = scenario === "bearer" || draft.authMode === "bearer" ? "bearer" : "x-api-key";
    return { ok: true, message: "ok", checkedAt: now(), resolvedAuth, models: scenario === "nolist" ? null : RELAY_MODELS.map((id) => ({ id })) };
  },
  createCustomConnection: async (input: CustomConnectionInput) => { await wait(300); createConnection(input); return snapshot(); },
  updateCustomConnection: async (input: Partial<CustomConnectionInput> & { connectionId: string }) => {
    const current = connections[input.connectionId]!;
    connections[input.connectionId] = {
      ...current,
      ...(input.displayName?.trim() ? { displayName: input.displayName.trim() } : {}),
      ...(input.baseUrl ? { baseUrl: input.baseUrl.replace(/\/v1\/?$/, "").replace(/\/+$/, "") } : {}),
      ...(input.authMode ? { authMode: input.authMode, resolvedAuth: undefined } : {}),
      ...(input.proxy ? { proxy: input.proxy } : {}),
      ...(input.promptCacheMode ? { promptCacheMode: input.promptCacheMode } : {}),
      ...(input.billingMode ? { billingMode: input.billingMode } : {}),
      ...(input.pricingMultiplier !== undefined ? { defaultPricingMultiplier: input.pricingMultiplier } : {}),
    };
    return snapshot();
  },
  testCustomConnection: async ({ connectionId }: { connectionId: string }) => {
    await wait(700);
    const connection = connections[connectionId]!;
    const failed = scenario === "badkey" || (scenario === "bearer" && connection.authMode === "x-api-key");
    connection.lastConnection = failed ? { status: "unavailable", checkedAt: now(), errorKind: "auth", message: "认证失败（HTTP 401）：请检查 API Key 是否正确。" } : { status: "available", checkedAt: now() };
    if (!failed && connection.authMode === "auto") connection.resolvedAuth = scenario === "bearer" ? "bearer" : "x-api-key";
    return failed ? { ok: false, message: connection.lastConnection.message, checkedAt: now(), errorKind: "auth" } : { ok: true, message: "ok", checkedAt: now() };
  },
  removeCustomConnection: async ({ connectionId }: { connectionId: string }) => { delete connections[connectionId]; return snapshot(); },
  listInstalledModels: async () => ({ models: [...models] }),
  addCustomModel: async (input: CustomModelDraftInput & { connectionId: string; setAsConnectionDefault: boolean }) => {
    installModel(input.connectionId, connections[input.connectionId]?.protocol, input);
    if (input.setAsConnectionDefault) connections[input.connectionId]!.defaultModel = input.apiModel;
    return ok({ model: models.at(-1) });
  },
  editCustomModel: async (input: Omit<CustomModelDraftInput, "apiModel"> & { modelKey: string }) => {
    const model = models.find((item) => item.definition.key === input.modelKey)!;
    model.definition = { ...model.definition, label: input.label ?? model.definition.apiModel, contextWindow: input.contextWindow ?? undefined, maxTokens: input.maxTokens ?? undefined, reasoningConfig: input.reasoningConfig, pricing: input.pricing ?? undefined } as InstalledModelView["definition"];
    return ok({ model });
  },
  updateModel: async ({ modelKey, enabled }: { modelKey: string; enabled: boolean }) => {
    const model = models.find((item) => item.definition.key === modelKey)!;
    model.settings = { ...model.settings, enabled };
    return ok({ model });
  },
  removeModel: async ({ modelKey }: { modelKey: string }) => {
    models.splice(models.findIndex((item) => item.definition.key === modelKey), 1);
    return ok({});
  },
  setCustomConnectionDefaultModel: async ({ connectionId, modelKey }: { connectionId: string; modelKey: string }) => {
    connections[connectionId]!.defaultModel = models.find((item) => item.definition.key === modelKey)!.definition.apiModel;
    return ok({});
  },
} as unknown as NonNullable<typeof window.actspace>;

createRoot(document.getElementById("root")!).render(
  <TooltipProvider delayDuration={350}>
  <div className="mx-auto min-h-screen bg-app-bg" style={{ width: query.get("width") === "375" ? 375 : "100%", maxWidth: "100%" }}>
    <p className="px-4 py-2 text-[12px] text-text-muted">开发预览 · 固定样例 · 场景 {scenario} · 数据只在内存里，不连接服务</p>
    <PageShell title="模型" description="模型连接、API Key 与模型目录管理。"><ProviderSettings /></PageShell>
  </div>
  </TooltipProvider>,
);
