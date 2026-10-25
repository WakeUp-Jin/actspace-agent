import {
  PURPOSE_IDS,
  findProviderTemplate,
  isRelayTemplate,
  resolveEffectiveModel,
  type ConnectionModelInput,
  type ConnectionProbeResult,
  type ConnectionView,
  type ModelApi,
  type ModelCatalogEntry,
  type ModelConnectionsResult,
  type ModelConnectionsView,
  type ModelFacts,
  type ModelKey,
  type ModelOverrides,
  type PurposesView,
} from "@actspace/shared";
import type { DesktopBridge } from "@actspace/shared/desktop-bridge";

/**
 * 设置 › 模型的有状态 mock：有效值用 shared 的 resolveEffectiveModel 现算，和 main 同一套优先级。
 * 探测按 Key 切场景：含 badkey → 401；含 nolist → 拿不到列表；含 catalog → 退回目录；其余拿到模板的模型列表。
 * 已保存的连接：名称里带「无列表」的中转模拟没开放 /models。
 */

type MockModel = { key: ModelKey; apiModel: string; providerFacts: ModelFacts; overrides: ModelOverrides | null };
type MockConnection = Omit<ConnectionView, "models" | "defaultBaseUrl"> & { models: MockModel[] };

function entry(sourceProviderId: string, apiModel: string, name: string, contextWindow: number, maxOutput: number, rates: [number, number, number | null], reasoning: boolean, image = false): ModelCatalogEntry {
  return {
    source: "models.dev",
    sourceProviderId,
    apiModel,
    name,
    currency: "USD",
    rates: { input: rates[0], output: rates[1], cacheRead: rates[2], cacheWrite: null },
    unsupportedBilling: false,
    contextWindow,
    maxOutput,
    input: image ? ["text", "image"] : ["text"],
    reasoning,
  };
}

const CATALOG = {
  entries: [
    entry("anthropic", "claude-sonnet-4-5", "Claude Sonnet 4.5", 200_000, 64_000, [3, 15, 0.3], true, true),
    entry("anthropic", "claude-haiku-4-5", "Claude Haiku 4.5", 200_000, 64_000, [1, 5, 0.1], true, true),
    entry("anthropic", "claude-opus-4-1", "Claude Opus 4.1", 200_000, 32_000, [15, 75, 1.5], true, true),
    entry("openai", "gpt-5", "GPT-5", 400_000, 128_000, [1.25, 10, 0.125], true, true),
    entry("openai", "gpt-5-mini", "GPT-5 mini", 400_000, 128_000, [0.25, 2, 0.025], true, true),
    entry("deepseek", "deepseek-chat", "DeepSeek V3.2", 128_000, 8_000, [0.28, 0.42, 0.028], false),
    entry("deepseek", "deepseek-reasoner", "DeepSeek V3.2 思考", 128_000, 64_000, [0.28, 0.42, 0.028], true),
    entry("moonshotai-cn", "kimi-k2-0905-preview", "Kimi K2", 256_000, 16_000, [0.6, 2.5, 0.15], false),
    entry("zhipuai", "glm-4.6", "GLM-4.6", 200_000, 128_000, [0.6, 2.2, 0.11], true),
  ],
};

/** 每个模板的 /models 返回什么（中转返回一组混合模型，含一个日期版本和一个目录里没有的）。 */
const PROVIDER_LISTS: Record<string, string[]> = {
  anthropic: ["claude-sonnet-4-5", "claude-haiku-4-5", "claude-opus-4-1"],
  openai: ["gpt-5", "gpt-5-mini"],
  deepseek: ["deepseek-chat", "deepseek-reasoner"],
  kimi: ["kimi-k2-0905-preview"],
  zai: ["glm-4.6"],
  openrouter: ["anthropic/claude-sonnet-4-5", "anthropic/claude-haiku-4-5", "openai/gpt-5", "openai/gpt-5-mini", "google/gemini-2.5-pro", "deepseek/deepseek-chat", "moonshotai/kimi-k2-0905", "z-ai/glm-4.6", "qwen/qwen3-coder-plus"],
  custom: ["claude-sonnet-4-5", "claude-sonnet-4-5-20250929", "gpt-5-mini", "qwen3-coder-plus"],
};

/** OpenRouter 的 /models 自带名称、上下文和价格。 */
const OPENROUTER_FACTS: Record<string, ModelFacts> = {
  "google/gemini-2.5-pro": { label: "Gemini 2.5 Pro", contextWindow: 1_048_576, rates: { input: 1.25, output: 10, cacheRead: null, cacheWrite: null } },
  "moonshotai/kimi-k2-0905": { label: "Kimi K2 0905", contextWindow: 262_144, rates: { input: 0.6, output: 2.5, cacheRead: null, cacheWrite: null } },
  "qwen/qwen3-coder-plus": { label: "Qwen3 Coder Plus", contextWindow: 1_000_000, rates: { input: 1, output: 5, cacheRead: null, cacheWrite: null } },
};

const keyFor = (connectionId: string, apiModel: string) => `${connectionId.split(":")[0]}:connection/${encodeURIComponent(connectionId)}/${encodeURIComponent(apiModel)}` as ModelKey;
const checkedAt = () => new Date().toISOString();

function seed(): { connections: MockConnection[]; purposes: PurposesView } {
  const relay = "custom:relay-1";
  const model = (connectionId: string, apiModel: string, patch: Partial<MockModel> = {}): MockModel =>
    ({ key: keyFor(connectionId, apiModel), apiModel, providerFacts: {}, overrides: null, ...patch });
  const connections: MockConnection[] = [
    {
      connectionId: "deepseek:default",
      templateId: "deepseek",
      label: "DeepSeek",
      relay: false,
      protocol: "openai-completions",
      baseUrl: "https://api.deepseek.com",
      hasApiKey: true,
      enabled: true,
      lastConnection: { status: "available", checkedAt: checkedAt() },
      multiplier: 1,
      proxy: { enabled: false, url: null },
      balance: true,
      models: [
        model("deepseek:default", "deepseek-chat"),
        model("deepseek:default", "deepseek-reasoner"),
      ],
    },
    {
      connectionId: relay,
      templateId: "custom",
      label: "Claude 中转",
      relay: true,
      protocol: "anthropic-messages",
      baseUrl: "https://relay.example.com",
      hasApiKey: true,
      enabled: true,
      lastConnection: { status: "available", checkedAt: checkedAt() },
      multiplier: 0.6,
      proxy: { enabled: false, url: null },
      balance: false,
      models: [
        model(relay, "claude-sonnet-4-5"),
        model(relay, "claude-haiku-4-5", { overrides: { thinking: { levels: ["off", "high"], default: "off" } } }),
        model(relay, "claude-sonnet-4-5-20250929"),
        model(relay, "qwen3-coder-plus"),
      ],
    },
    {
      connectionId: "openrouter:default",
      templateId: "openrouter",
      label: "OpenRouter",
      relay: false,
      protocol: "openai-completions",
      baseUrl: "https://openrouter.ai/api/v1",
      hasApiKey: false,
      enabled: true,
      lastConnection: { status: "untested" },
      multiplier: 1,
      proxy: { enabled: false, url: null },
      balance: true,
      hasManagementKey: false,
      models: [],
    },
  ];
  return {
    connections,
    purposes: {
      chat: { model: keyFor(relay, "claude-sonnet-4-5"), thinking: null },
      utility: { model: keyFor("deepseek:default", "deepseek-chat"), thinking: null },
      autoReview: { model: null, thinking: "off" },
      explore: { model: keyFor(relay, "claude-haiku-4-5"), thinking: null },
      vision: { model: null, thinking: null },
    },
  };
}

function effectiveFor(connection: Pick<MockConnection, "templateId" | "protocol" | "multiplier">, apiModel: string, providerFacts: ModelFacts = {}, overrides?: ModelOverrides | null) {
  return resolveEffectiveModel({
    apiModel,
    protocol: connection.protocol,
    catalog: CATALOG,
    catalogProvider: findProviderTemplate(connection.templateId)?.catalogProvider ?? null,
    providerFacts,
    ...(overrides ? { overrides } : {}),
    multiplier: connection.multiplier,
  });
}

export function createModelConnectionsMock(): Partial<DesktopBridge["modelConnections"]> {
  const state = seed();
  let nextId = 2;

  const view = (): ModelConnectionsView => ({
    purposes: structuredClone(state.purposes),
    connections: state.connections.map(({ models, ...connection }) => ({
      ...structuredClone(connection),
      defaultBaseUrl: findProviderTemplate(connection.templateId)?.defaultBaseUrl ?? null,
      models: models.map((model) => ({
        key: model.key,
        apiModel: model.apiModel,
        effective: effectiveFor(connection, model.apiModel, model.providerFacts, model.overrides),
        overrides: model.overrides ? structuredClone(model.overrides) : null,
        usedBy: PURPOSE_IDS.filter((purpose) => state.purposes[purpose].model === model.key),
      })),
    })),
  });
  const ok = (connectionId?: string): ModelConnectionsResult => ({ ok: true, view: view(), ...(connectionId ? { connectionId } : {}) });
  const fail = (message: string): ModelConnectionsResult => ({ ok: false, error: { code: "invalid_input", message } });
  const find = (connectionId: string) => state.connections.find((item) => item.connectionId === connectionId);
  const findModel = (key: ModelKey) => {
    for (const connection of state.connections) {
      const model = connection.models.find((item) => item.key === key);
      if (model) return { connection, model };
    }
    return null;
  };
  const clearPurposes = (keys: readonly ModelKey[]) => {
    for (const purpose of PURPOSE_IDS) if (state.purposes[purpose].model && keys.includes(state.purposes[purpose].model!)) state.purposes[purpose] = { model: null, thinking: state.purposes[purpose].thinking };
  };
  const addModels = (connection: MockConnection, models: readonly ConnectionModelInput[]) => {
    for (const input of models) {
      const existing = connection.models.find((model) => model.apiModel === input.apiModel);
      if (existing) {
        if (input.providerFacts && Object.keys(input.providerFacts).length > 0) existing.providerFacts = structuredClone(input.providerFacts);
        continue;
      }
      connection.models.push({
        key: keyFor(connection.connectionId, input.apiModel),
        apiModel: input.apiModel,
        providerFacts: structuredClone(input.providerFacts ?? {}),
        overrides: input.overrides ? structuredClone(input.overrides) : null,
      });
    }
  };

  const probe = (templateId: string, protocol: ModelApi, multiplier: number, apiKey: string, existing?: MockConnection): ConnectionProbeResult => {
    const base = { checkedAt: checkedAt() };
    if (apiKey.includes("badkey")) return { ...base, ok: false, message: "API Key 无效（401）。检查 Key 是否复制完整。", errorKind: "auth", statusCode: 401, listSource: "none", models: [] };
    const scope = { templateId, protocol, multiplier };
    const listed = (ids: readonly string[], source: "provider" | "catalog"): ConnectionProbeResult => ({
      ...base,
      ok: true,
      message: "连接成功",
      listSource: source,
      models: ids.map((apiModel) => {
        const providerFacts = source === "provider" ? OPENROUTER_FACTS[apiModel] ?? {} : {};
        return { apiModel, providerFacts, effective: effectiveFor(scope, apiModel, providerFacts), added: Boolean(existing?.models.some((model) => model.apiModel === apiModel)) };
      }),
    });
    if (apiKey.includes("nolist")) return { ...base, ok: true, message: "连接成功", listSource: "none", models: [] };
    const catalogProvider = findProviderTemplate(templateId)?.catalogProvider;
    if (apiKey.includes("catalog") && catalogProvider) return listed(CATALOG.entries.filter((item) => item.sourceProviderId === catalogProvider).map((item) => item.apiModel), "catalog");
    return listed(PROVIDER_LISTS[templateId] ?? PROVIDER_LISTS.custom, "provider");
  };

  return {
    list: async () => view(),
    probe: async (input) => {
      if (input.kind === "draft") {
        const template = findProviderTemplate(input.draft.templateId);
        return probe(input.draft.templateId, input.draft.protocol ?? template?.protocol ?? "openai-completions", 1, input.draft.apiKey);
      }
      const connection = find(input.connectionId);
      if (!connection) return { ok: false, message: "连接不存在。", checkedAt: checkedAt(), listSource: "none", models: [] };
      const result = probe(connection.templateId, connection.protocol, connection.multiplier, connection.hasApiKey ? (connection.label.includes("无列表") ? "nolist" : "saved") : "badkey", connection);
      connection.lastConnection = result.ok ? { status: "available", checkedAt: result.checkedAt } : { status: "unavailable", checkedAt: result.checkedAt, errorKind: result.errorKind, message: result.message };
      return result;
    },
    create: async (input) => {
      const template = findProviderTemplate(input.templateId);
      if (!template) return fail("未知的模板。");
      const relay = isRelayTemplate(template);
      const connectionId = relay ? `custom:relay-${nextId++}` : `${template.id}:default`;
      // 内置连接还没填 Key 时只是个空位，填 Key 等于第一次添加。
      const placeholder = find(connectionId);
      if (placeholder?.hasApiKey) return { ok: false, error: { code: "connection_exists", message: `${template.label} 已经添加过了。` } };
      if (placeholder) state.connections = state.connections.filter((item) => item !== placeholder);
      const connection: MockConnection = {
        connectionId,
        templateId: template.id,
        label: input.label ?? (relay ? `自定义中转 ${nextId - 1}` : template.label),
        relay,
        protocol: input.protocol ?? template.protocol ?? "openai-completions",
        baseUrl: input.baseUrl?.trim() || template.defaultBaseUrl || "",
        hasApiKey: Boolean(input.apiKey),
        enabled: true,
        lastConnection: { status: "available", checkedAt: checkedAt() },
        multiplier: input.multiplier ?? 1,
        proxy: input.proxy ?? { enabled: false, url: null },
        balance: Boolean(template.balance),
        ...(template.balance === "openrouter" ? { hasManagementKey: false } : {}),
        models: [],
      };
      addModels(connection, input.models);
      state.connections.push(connection);
      return ok(connectionId);
    },
    update: async ({ connectionId, apiKey, managementKey, ...patch }) => {
      const connection = find(connectionId);
      if (!connection) return fail("连接不存在。");
      Object.assign(connection, Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)));
      if (apiKey) connection.hasApiKey = true;
      if (managementKey !== undefined && connection.hasManagementKey !== undefined) connection.hasManagementKey = Boolean(managementKey);
      return ok(connectionId);
    },
    remove: async ({ connectionId }) => {
      const connection = find(connectionId);
      if (!connection) return fail("连接不存在。");
      clearPurposes(connection.models.map((model) => model.key));
      state.connections = state.connections.filter((item) => item !== connection);
      return ok();
    },
    addModels: async ({ connectionId, models }) => {
      const connection = find(connectionId);
      if (!connection) return fail("连接不存在。");
      addModels(connection, models);
      return ok(connectionId);
    },
    updateModel: async ({ key, overrides }) => {
      const found = findModel(key);
      if (!found) return fail("模型不存在。");
      found.model.overrides = overrides && Object.keys(overrides).length > 0 ? structuredClone(overrides) : null;
      return ok();
    },
    removeModel: async ({ key }) => {
      const found = findModel(key);
      if (!found) return fail("模型不存在。");
      found.connection.models = found.connection.models.filter((model) => model !== found.model);
      clearPurposes([key]);
      return ok();
    },
    preview: async ({ apiModel, connectionId, templateId, protocol, multiplier, overrides }) => {
      const connection = connectionId ? find(connectionId) : undefined;
      const template = findProviderTemplate(templateId);
      const scope = connection ?? { templateId: templateId ?? "custom", protocol: protocol ?? template?.protocol ?? "openai-completions", multiplier: multiplier ?? 1 };
      return { effective: effectiveFor(scope, apiModel, {}, overrides), added: Boolean(connection?.models.some((model) => model.apiModel === apiModel)) };
    },
    updatePurposes: async (patch) => {
      for (const purpose of PURPOSE_IDS) if (patch[purpose]) state.purposes[purpose] = structuredClone(patch[purpose]!);
      return ok();
    },
    getBalance: async ({ connectionId }) => {
      const connection = find(connectionId);
      const provider = connection?.templateId === "kimi" ? "kimi" : connection?.templateId === "openrouter" ? "openrouter" : "deepseek";
      return { provider, isConfigured: Boolean(connection?.hasApiKey), isAvailable: true, generatedAt: checkedAt(), displayBalance: provider === "openrouter" ? { amount: "12.40", currency: "USD" } : { amount: "86.52", currency: "CNY" } };
    },
  };
}
