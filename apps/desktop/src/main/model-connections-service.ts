import { randomUUID } from "node:crypto";
import {
  PROVIDER_TEMPLATES,
  findProviderTemplate,
  isRelayTemplate,
  matchCatalogModel,
  normalizeCustomConnectionAddress,
  normalizeModelKey,
  resolveEffectiveModel,
  sanitizeModelFacts,
  sanitizeModelOverrides,
  templateForConnection,
  type ConnectionCreateInput,
  type ConnectionDraftInput,
  type ConnectionModelInput,
  type ConnectionModelPatch,
  type ConnectionModelView,
  type ConnectionProbeInput,
  type ConnectionProbeResult,
  type ConnectionUpdateInput,
  type ConnectionView,
  type CustomConnectionResolvedAuth,
  type EffectiveModel,
  type LlmProviderId,
  type ModelApi,
  type ModelConnectionsErrorCode,
  type ModelConnectionsResult,
  type ModelConnectionsView,
  type ModelDefinition,
  type ModelFacts,
  type ModelKey,
  type ModelOverrides,
  type ModelPreviewInput,
  type ModelPreviewResult,
  type ProbedModel,
  type ProviderBalanceSnapshot,
  type ProviderProxySettings,
  type ProviderTemplate,
  type PurposeId,
  type PurposesUpdateInput,
  type PurposesView,
  type SettingsV4ConnectionSettings,
  type SettingsV4Models,
  type TaskModelSettings,
} from "@actspace/shared";
import type { ModelStoreService } from "./model-store-service";
import type { ProviderNetworkService } from "./runtime-v2/provider-network-service";
import type { SettingsService } from "./settings-service";
import { ProviderSettingsError } from "./settings/types";
import { normalizeBaseUrl, normalizePricingMultiplier, normalizeProxyUrl } from "./settings/sanitize";

/**
 * 设置 › 模型：连接、连接下的模型、用途表。
 * 有效值统一从 ModelStoreService 的快照读（用户 > 服务商 > 目录），这里只负责读写和组装视图。
 * 内置服务商（DeepSeek / Kimi / OpenRouter）的第一份 Key 落在旧的 `<p>:default` 连接上，其余连接都是自定义连接。
 */
export class ModelConnectionsService {
  constructor(
    private readonly settings: SettingsService,
    private readonly models: ModelStoreService,
    private readonly network: ProviderNetworkService,
  ) {}

  list(): ModelConnectionsView {
    const v4 = this.settings.getV4().settings.models;
    const snapshot = this.models.getModelSnapshot();
    const purposes = this.#purposes();
    const usedBy = new Map<ModelKey, PurposeId[]>();
    for (const [purpose, binding] of Object.entries(purposes) as [PurposeId, PurposesView[PurposeId]][]) {
      if (binding.model) usedBy.set(binding.model, [...(usedBy.get(binding.model) ?? []), purpose]);
    }
    const connections = Object.values(v4.connections)
      .filter((connection) => !isDefaultConnection(connection) || this.settings.hasConnectionKey(connection.connectionId, connection.providerId))
      .map((connection) => {
        const template = templateForConnection(connection);
        const models = Object.entries(v4.installed)
          .filter(([key, installed]) => installed && (installed.connectionId ?? `${key.slice(0, key.indexOf(":"))}:default`) === connection.connectionId)
          .flatMap(([rawKey, installed]): ConnectionModelView[] => {
            const key = rawKey as ModelKey;
            const definition = snapshot.definitions[key];
            if (!definition?.effective || !installed) return [];
            const overrides = v4.overrides?.[key];
            return [{
              key,
              apiModel: definition.apiModel,
              effective: definition.effective,
              overrides: overrides && Object.keys(overrides).length > 0 ? overrides : null,
              usedBy: usedBy.get(key) ?? [],
            }];
          })
          .sort((left, right) => left.effective.label.localeCompare(right.effective.label));
        return this.#connectionView(connection, template, models);
      })
      .sort((left, right) => templateOrder(left.templateId) - templateOrder(right.templateId) || left.label.localeCompare(right.label));
    return { connections, purposes };
  }

  async probe(input: ConnectionProbeInput): Promise<ConnectionProbeResult> {
    const checkedAt = new Date().toISOString();
    const invalid = (message: string): ConnectionProbeResult => ({ ok: false, message, checkedAt, errorKind: "invalid_request", listSource: "none", models: [] });
    let target: { template: ProviderTemplate; protocol: ModelApi; baseUrl: string; apiKey: string; proxyUrl?: string; resolvedAuth?: CustomConnectionResolvedAuth; multiplier: number; connectionId?: string };
    if (input?.kind === "saved") {
      const connection = this.settings.getV4().settings.models.connections[input.connectionId];
      if (!connection) return invalid("连接不存在。");
      const runtime = this.settings.getConnectionRuntimeConfig(connection.providerId, connection.connectionId);
      if ("code" in runtime) return invalid(runtime.message);
      const template = templateForConnection(connection);
      target = {
        template,
        protocol: connectionProtocol(connection, template),
        baseUrl: runtime.baseUrl,
        apiKey: runtime.apiKey,
        ...(runtime.transport ? { proxyUrl: runtime.transport.proxyUrl } : {}),
        ...(connection.resolvedAuth ? { resolvedAuth: connection.resolvedAuth } : {}),
        multiplier: connection.defaultPricingMultiplier ?? 1,
        connectionId: connection.connectionId,
      };
    } else if (input?.kind === "draft") {
      try {
        const draft = this.#draft(input.draft);
        target = { ...draft, multiplier: 1 };
      } catch (error) {
        return invalid(error instanceof Error ? error.message : "连接参数无效。");
      }
    } else {
      return invalid("探测参数无效。");
    }

    const result = await this.network.probeCustomConnection({
      protocol: target.protocol,
      apiKey: target.apiKey,
      baseUrl: target.baseUrl,
      model: "",
      ...(target.protocol === "anthropic-messages" ? { authMode: "auto" as const } : {}),
      ...(target.resolvedAuth ? { resolvedAuth: target.resolvedAuth } : {}),
      ...(target.proxyUrl ? { transport: { proxyUrl: target.proxyUrl } } : {}),
    });
    if (target.connectionId) await this.#markConnection(target.connectionId, result);
    const base = { ok: result.ok, message: result.message, checkedAt: result.checkedAt, ...(result.errorKind ? { errorKind: result.errorKind } : {}), ...(result.statusCode ? { statusCode: result.statusCode } : {}), ...(result.resolvedAuth ? { resolvedAuth: result.resolvedAuth } : {}) };
    if (!result.ok) return { ...base, listSource: "none", models: [] };

    const added = new Set(target.connectionId ? this.#connectionModels(target.connectionId).map((model) => model.apiModel) : []);
    const catalog = this.models.catalog();
    const toProbed = (apiModel: string, providerFacts: ModelFacts): ProbedModel => ({
      apiModel,
      providerFacts,
      effective: resolveEffectiveModel({ apiModel, protocol: target.protocol, catalog, catalogProvider: target.template.catalogProvider, providerFacts, multiplier: target.multiplier }),
      added: added.has(apiModel),
    });
    if (result.models && result.models.length > 0) {
      let rows = result.models;
      // 官方服务的 /models 常带上嵌入、语音、绘图等模型：和目录取交集；交集为空时（目录过旧）保留全部。中转不过滤。
      if (!isRelayTemplate(target.template) && target.template.catalogProvider) {
        const known = rows.filter((row) => matchCatalogModel(catalog, row.id, target.template.catalogProvider)?.exact);
        if (known.length > 0) rows = known;
      }
      return { ...base, listSource: "provider", models: rows.map((row) => toProbed(row.id, { ...(row.label ? { label: row.label } : {}), ...sanitizeModelFacts(row.facts) })) };
    }
    // 服务没提供列表：官方模板退回目录里这家的模型；中转只能手动添加。
    const provider = target.template.catalogProvider;
    if (!provider) return { ...base, listSource: "none", models: [] };
    const fallback = catalog.entries.filter((entry) => entry.sourceProviderId === provider).map((entry) => toProbed(entry.apiModel, {}));
    return { ...base, listSource: fallback.length > 0 ? "catalog" : "none", models: fallback };
  }

  async create(input: ConnectionCreateInput): Promise<ModelConnectionsResult> {
    return this.#run(async () => {
      const draft = this.#draft(input);
      const template = draft.template;
      const multiplier = normalizePricingMultiplier(input.multiplier ?? 1);
      const current = this.settings.getV4().settings.models;
      const legacyProvider = template.legacyProviderId as LlmProviderId | undefined;
      const legacyId = legacyProvider ? `${legacyProvider}:default` : undefined;
      // 内置服务商还没配 Key 时，第一份 Key 落在旧的 `<p>:default` 连接上。
      // 新连接的模型列表从空开始，由用户在「获取可用模型」里挑：先清掉这个连接下预装的内置模型（没有 Key 时它们本来就看不到）。
      const useLegacy = Boolean(legacyProvider && legacyId && !this.settings.hasConnectionKey(legacyId, legacyProvider));
      const providerId: LlmProviderId = legacyProvider ?? "openrouter";
      const connectionId = useLegacy ? legacyId! : uniqueConnectionId(template.id, current);
      const proxy = normalizeProxy(input.proxy);
      const connection: SettingsV4ConnectionSettings = useLegacy
        ? {
            ...requireConnection(current, connectionId),
            enabled: true,
            baseUrl: sameUrl(draft.baseUrl, template.defaultBaseUrl) ? null : draft.baseUrl,
            proxy,
            defaultPricingMultiplier: multiplier,
            lastConnection: { status: "untested" },
          }
        : {
            connectionId,
            providerId,
            catalogId: template.id,
            protocol: draft.protocol,
            displayName: input.label?.trim() || template.label,
            baseUrl: draft.baseUrl,
            proxy,
            enabled: true,
            lastConnection: { status: "untested" },
            defaultPricingMultiplier: multiplier,
            defaultModel: input.models[0]?.apiModel.trim() || null,
            ...(draft.protocol === "anthropic-messages" ? { authMode: "auto" as const, ...(input.resolvedAuth ? { resolvedAuth: input.resolvedAuth } : {}) } : {}),
          };
      await this.settings.applyModelsChange((models) => {
        const cleared = useLegacy ? removeKeysPatch(models, this.#keysOf(models, connectionId)) : {};
        const base: SettingsV4Models = {
          ...models,
          connections: { ...models.connections, [connectionId]: connection },
          installed: Object.fromEntries(Object.entries(models.installed).filter(([key]) => !cleared.installed || !(key in cleared.installed))) as SettingsV4Models["installed"],
        };
        const added = this.#modelsPatch(base, connectionId, input.models ?? []);
        return {
          ...cleared,
          connections: { [connectionId]: connection },
          ...(added.definitions ? { definitions: { ...cleared.definitions, ...added.definitions } } : {}),
          installed: { ...cleared.installed, ...added.installed },
          ...(added.overrides ? { overrides: { ...cleared.overrides, ...added.overrides } } : {}),
        };
      }, { connectionId, providerId, apiKey: draft.apiKey });
      return connectionId;
    });
  }

  async update(input: ConnectionUpdateInput): Promise<ModelConnectionsResult> {
    return this.#run(async () => {
      const current = this.#connection(input?.connectionId);
      const template = templateForConnection(current);
      const legacy = isDefaultConnection(current);
      const next: SettingsV4ConnectionSettings = { ...current };
      if (input.label !== undefined && !legacy) next.displayName = input.label.trim() || template.label;
      if (input.protocol !== undefined && isRelayTemplate(template) && input.protocol !== connectionProtocol(current, template)) {
        next.protocol = input.protocol;
      }
      if (input.baseUrl !== undefined) {
        const protocol = next.protocol ?? connectionProtocol(current, template);
        const baseUrl = normalizeAddress(input.baseUrl, protocol);
        next.baseUrl = legacy && sameUrl(baseUrl, template.defaultBaseUrl) ? null : baseUrl;
      }
      if (input.proxy !== undefined) next.proxy = normalizeProxy(input.proxy);
      if (input.multiplier !== undefined) next.defaultPricingMultiplier = normalizePricingMultiplier(input.multiplier);
      if (input.enabled !== undefined) next.enabled = input.enabled === true;
      const addressChanged = next.baseUrl !== current.baseUrl || next.protocol !== current.protocol;
      const apiKey = input.apiKey?.trim() || undefined;
      // 地址、协议或 Key 变了，之前测出来的认证方式和连接状态都作废。
      if (addressChanged || apiKey) {
        delete next.resolvedAuth;
        next.lastConnection = { status: "untested" };
        if (next.protocol === "anthropic-messages" && !legacy) next.authMode = "auto";
      }
      const managementKey = input.managementKey === undefined || !(legacy && current.providerId === "openrouter") ? undefined : input.managementKey;
      await this.settings.applyModelsChange((models) => {
        const patch: Partial<SettingsV4Models> = { connections: { [current.connectionId]: next } };
        // 协议变了：这个连接下自定义模型的协议跟着变。
        if (next.protocol !== current.protocol && next.protocol) {
          patch.definitions = Object.fromEntries(this.#keysOf(models, current.connectionId)
            .flatMap((key) => {
              const definition = models.definitions[key];
              return definition?.source === "custom" ? [[key, { ...definition, api: next.protocol! }]] : [];
            }));
        }
        return patch;
      }, apiKey || managementKey !== undefined
        ? { connectionId: current.connectionId, providerId: current.providerId, ...(apiKey ? { apiKey } : {}), ...(managementKey !== undefined ? { managementKey } : {}) }
        : undefined);
      return current.connectionId;
    });
  }

  async remove(input: { connectionId: string }): Promise<ModelConnectionsResult> {
    return this.#run(async () => {
      const current = this.#connection(input?.connectionId);
      const legacy = isDefaultConnection(current);
      await this.settings.applyModelsChange((models) => {
        const keys = this.#keysOf(models, current.connectionId);
        const patch: Partial<SettingsV4Models> = {
          // 内置连接不能真的删掉，只清空 Key 和设置；它的模型一并移出。
          connections: { [current.connectionId]: legacy
            ? { ...current, enabled: true, baseUrl: null, proxy: { enabled: false, url: null }, defaultPricingMultiplier: 1, lastConnection: { status: "untested" } }
            : null as unknown as SettingsV4ConnectionSettings },
          ...removeKeysPatch(models, keys),
        };
        return patch;
      }, { connectionId: current.connectionId, providerId: current.providerId, apiKey: null });
      return undefined;
    });
  }

  async addModels(input: { connectionId: string; models: ConnectionModelInput[] }): Promise<ModelConnectionsResult> {
    return this.#run(async () => {
      const connection = this.#connection(input?.connectionId);
      if (!Array.isArray(input.models) || input.models.length === 0) throw new ModelConnectionsError("invalid_input", "请选择要添加的模型。");
      await this.settings.applyModelsChange((models) => this.#modelsPatch(models, connection.connectionId, input.models));
      return connection.connectionId;
    });
  }

  async updateModel(input: ConnectionModelPatch): Promise<ModelConnectionsResult> {
    return this.#run(async () => {
      const key = this.#installedKey(input?.key);
      await this.settings.applyModelsChange((models) => {
        const patch: Partial<SettingsV4Models> = {};
        if (input.overrides !== undefined) {
          const overrides = input.overrides === null ? {} : sanitizeModelOverrides(input.overrides);
          patch.overrides = { [key]: Object.keys(overrides).length > 0 ? overrides : null } as SettingsV4Models["overrides"];
        }
        return patch;
      });
      return this.#connectionIdOf(key);
    });
  }

  async removeModel(input: { key: ModelKey }): Promise<ModelConnectionsResult> {
    return this.#run(async () => {
      // 内置模型也能移除（只移出列表，定义还在），之后可以从「获取可用模型」再加回来。
      const key = this.#installedKey(input?.key);
      const connectionId = this.#connectionIdOf(key);
      await this.settings.applyModelsChange((models) => removeKeysPatch(models, [key]));
      return connectionId;
    });
  }

  preview(input: ModelPreviewInput): ModelPreviewResult {
    const apiModel = typeof input?.apiModel === "string" ? input.apiModel.trim() : "";
    const connection = input?.connectionId ? this.settings.getV4().settings.models.connections[input.connectionId] : undefined;
    const template = connection ? templateForConnection(connection) : findProviderTemplate(input?.templateId) ?? findProviderTemplate("custom")!;
    const protocol = input?.protocol ?? (connection ? connectionProtocol(connection, template) : template.protocol ?? "openai-completions");
    const existing = connection ? this.#connectionModels(connection.connectionId).find((model) => model.apiModel === apiModel) : undefined;
    const definition = existing ? this.models.getModelSnapshot().definitions[existing.key] : undefined;
    const effective: EffectiveModel = resolveEffectiveModel({
      apiModel,
      protocol,
      catalog: this.models.catalog(),
      catalogProvider: template.catalogProvider,
      providerFacts: definition?.providerFacts,
      overrides: input?.overrides ? sanitizeModelOverrides(input.overrides) : undefined,
      multiplier: input?.multiplier ?? connection?.defaultPricingMultiplier ?? 1,
    });
    return { effective, added: Boolean(existing) };
  }

  async updatePurposes(input: PurposesUpdateInput): Promise<ModelConnectionsResult> {
    return this.#run(async () => {
      const installed = this.settings.getV4().settings.models.installed;
      const bindings: Partial<SettingsV4Models["taskBindings"]> = {};
      const thinking: NonNullable<TaskModelSettings["thinking"]> = { ...this.settings.getModelStorageState().taskModels.thinking };
      for (const [purpose, binding] of Object.entries(input ?? {}) as [PurposeId, PurposesView[PurposeId] | undefined][]) {
        if (!binding || !PURPOSE_BINDING_FIELD[purpose]) continue;
        if (binding.model !== null) {
          const key = normalizeModelKey(binding.model);
          if (!key || !installed[key]) throw new ModelConnectionsError("model_missing", "所选模型不存在。");
          bindings[PURPOSE_BINDING_FIELD[purpose]] = key;
        } else {
          bindings[PURPOSE_BINDING_FIELD[purpose]] = null;
        }
        if (binding.thinking) thinking[purpose] = binding.thinking;
        else delete thinking[purpose];
      }
      await this.settings.applyModelsChange(() => ({ taskBindings: { ...bindings, thinking } as SettingsV4Models["taskBindings"] }));
      return undefined;
    });
  }

  async getBalance(input: { connectionId: string }): Promise<ProviderBalanceSnapshot> {
    const connection = this.#connection(input?.connectionId);
    const kind = templateForConnection(connection).balance;
    if (!kind) throw new Error("这个连接不支持查询余额。");
    const runtime = kind === "openrouter" && isDefaultConnection(connection)
      ? this.settings.getOpenRouterManagementRuntimeConfig()
      : this.settings.getConnectionRuntimeConfig(connection.providerId, connection.connectionId);
    if ("code" in runtime) {
      if (runtime.code === "api_key_missing") return this.network.getBalance(kind, undefined);
      throw new Error(runtime.message);
    }
    return this.network.getBalance(kind, { provider: kind, apiKey: runtime.apiKey, baseUrl: runtime.baseUrl, ...(runtime.transport ? { transport: runtime.transport } : {}) });
  }

  #purposes(): PurposesView {
    const task = this.settings.getModelStorageState().taskModels;
    const thinking = task.thinking ?? {};
    return {
      chat: { model: task.defaultChatModel ?? null, thinking: thinking.chat ?? null },
      utility: { model: task.utilityModel ?? null, thinking: thinking.utility ?? null },
      autoReview: { model: task.autoReviewModel ?? null, thinking: thinking.autoReview ?? null },
      explore: { model: task.exploreModel ?? null, thinking: thinking.explore ?? null },
      vision: { model: task.visionModel ?? null, thinking: thinking.vision ?? null },
    };
  }

  #connectionView(connection: SettingsV4ConnectionSettings, template: ProviderTemplate, models: ConnectionModelView[]): ConnectionView {
    const legacy = isDefaultConnection(connection);
    const relay = isRelayTemplate(template);
    return {
      connectionId: connection.connectionId,
      templateId: relay ? "custom" : template.id,
      label: (!legacy && connection.displayName) || template.label,
      relay,
      protocol: connectionProtocol(connection, template),
      baseUrl: connection.baseUrl ?? template.defaultBaseUrl ?? "",
      defaultBaseUrl: relay ? null : template.defaultBaseUrl ?? null,
      hasApiKey: this.settings.hasConnectionKey(connection.connectionId, connection.providerId),
      enabled: connection.enabled,
      lastConnection: connection.lastConnection,
      multiplier: connection.defaultPricingMultiplier ?? 1,
      proxy: connection.proxy,
      balance: Boolean(template.balance),
      ...(legacy && connection.providerId === "openrouter" ? { hasManagementKey: this.settings.hasOpenRouterManagementKey() } : {}),
      models,
    };
  }

  /** 添加连接时填的内容 → 协议、地址、Key。官方模板固定协议，地址可以改；中转要自己选协议、填地址。 */
  #draft(input: ConnectionDraftInput): { template: ProviderTemplate; protocol: ModelApi; baseUrl: string; apiKey: string; proxyUrl?: string } {
    const template = findProviderTemplate(input?.templateId);
    if (!template || template.hidden) throw new ModelConnectionsError("invalid_input", "服务商模板不存在。");
    const apiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
    if (!apiKey) throw new ModelConnectionsError("invalid_api_key", "请输入 API Key。");
    const relay = isRelayTemplate(template);
    let protocol: ModelApi = relay ? input.protocol ?? "openai-completions" : template.protocol!;
    const rawUrl = input.baseUrl?.trim() || (relay ? "" : template.defaultBaseUrl ?? "");
    let baseUrl: string;
    if (relay) {
      const address = normalizeCustomConnectionAddress(rawUrl, protocol);
      if (!address.ok) throw new ModelConnectionsError("invalid_base_url", "服务地址无效。");
      baseUrl = address.baseUrl;
      // 用户贴了完整接口地址时，按地址推断出的协议为准。
      protocol = address.inferredProtocol ?? protocol;
    } else {
      baseUrl = normalizeAddress(rawUrl, protocol);
    }
    const proxy = normalizeProxy(input.proxy);
    return { template, protocol, baseUrl, apiKey, ...(proxy.enabled && proxy.url ? { proxyUrl: proxy.url } : {}) };
  }

  /** 往连接里加模型。内置服务商的旧连接沿用 `<p>:<apiModel>` 键（内置模型直接装上）；其他连接用连接内的键。 */
  #modelsPatch(models: SettingsV4Models, connectionId: string, inputs: ConnectionModelInput[]): Partial<SettingsV4Models> {
    const connection = models.connections[connectionId];
    if (!connection) throw new ModelConnectionsError("connection_missing", "连接不存在。");
    const template = templateForConnection(connection);
    const protocol = connectionProtocol(connection, template);
    const legacy = isDefaultConnection(connection);
    const builtins = this.models.getModelSnapshot().definitions;
    const definitions: Partial<Record<ModelKey, ModelDefinition>> = {};
    const installed: SettingsV4Models["installed"] = {};
    const overrides: NonNullable<SettingsV4Models["overrides"]> = {};
    const addedAt = new Date().toISOString();
    for (const input of inputs) {
      const apiModel = typeof input?.apiModel === "string" ? input.apiModel.trim() : "";
      if (!apiModel || apiModel.length > 200) throw new ModelConnectionsError("invalid_input", "模型 ID 无效。");
      const key = legacy
        ? normalizeModelKey(`${connection.providerId}:${apiModel}`)
        : normalizeModelKey(`${connection.providerId}:connection/${encodeURIComponent(connectionId)}/${encodeURIComponent(apiModel)}`);
      if (!key) throw new ModelConnectionsError("invalid_input", "模型 ID 无效。");
      if (installed[key]) continue;
      const builtin = builtins[key];
      if (models.installed[key]) {
        // 已经在连接里：只刷新服务商数据，用户修改不动。
        const stored = models.definitions[key];
        const facts = sanitizeModelFacts(input.providerFacts);
        if (stored && Object.keys(facts).length > 0 && stored.source !== "builtin" && stored.source !== "curated") definitions[key] = { ...stored, providerFacts: facts };
        continue;
      }
      if (!(builtin && (builtin.source === "builtin" || builtin.source === "curated"))) {
        const facts = sanitizeModelFacts(input.providerFacts);
        definitions[key] = {
          key,
          provider: connection.providerId,
          api: protocol,
          apiModel,
          label: facts.label ?? apiModel,
          source: legacy ? "provider-catalog" : "custom",
          contextWindow: null,
          maxTokens: null,
          thinkingDefault: false,
          capabilities: { input: ["text"], toolUse: "declared", reasoning: false, thinkingToggle: false },
          ...(Object.keys(facts).length > 0 ? { providerFacts: facts } : {}),
        };
      }
      installed[key] = { enabled: true, addedAt, connectionId };
      const userOverrides = input.overrides ? sanitizeModelOverrides(input.overrides) : {};
      if (Object.keys(userOverrides).length > 0) overrides[key] = userOverrides;
    }
    return {
      ...(Object.keys(definitions).length > 0 ? { definitions } : {}),
      installed,
      ...(Object.keys(overrides).length > 0 ? { overrides } : {}),
    };
  }

  async #markConnection(connectionId: string, result: { ok: boolean; checkedAt: string; errorKind?: ConnectionProbeResult["errorKind"]; message: string; resolvedAuth?: CustomConnectionResolvedAuth }): Promise<void> {
    await this.settings.applyModelsChange((models) => {
      const connection = models.connections[connectionId];
      if (!connection) return {};
      return {
        connections: {
          [connectionId]: {
            ...connection,
            lastConnection: result.ok
              ? { status: "available", checkedAt: result.checkedAt }
              : { status: "unavailable", checkedAt: result.checkedAt, ...(result.errorKind ? { errorKind: result.errorKind } : {}), message: result.message },
            ...(result.ok && result.resolvedAuth ? { resolvedAuth: result.resolvedAuth } : {}),
          },
        },
      };
    }).catch(() => undefined);
  }

  #connection(connectionId: string | undefined): SettingsV4ConnectionSettings {
    const connection = typeof connectionId === "string" ? this.settings.getV4().settings.models.connections[connectionId] : undefined;
    if (!connection) throw new ModelConnectionsError("connection_missing", "连接不存在。");
    return connection;
  }

  #installedKey(raw: unknown): ModelKey {
    const key = normalizeModelKey(raw);
    if (!key || !this.settings.getV4().settings.models.installed[key]) throw new ModelConnectionsError("model_missing", "模型不存在。");
    return key;
  }

  #connectionIdOf(key: ModelKey): string {
    return this.settings.getV4().settings.models.installed[key]?.connectionId ?? `${key.slice(0, key.indexOf(":"))}:default`;
  }

  #keysOf(models: SettingsV4Models, connectionId: string): ModelKey[] {
    return (Object.keys(models.installed) as ModelKey[])
      .filter((key) => (models.installed[key]?.connectionId ?? `${key.slice(0, key.indexOf(":"))}:default`) === connectionId);
  }

  #connectionModels(connectionId: string): { key: ModelKey; apiModel: string }[] {
    const models = this.settings.getV4().settings.models;
    const definitions = this.models.getModelSnapshot().definitions;
    return this.#keysOf(models, connectionId).flatMap((key) => definitions[key] ? [{ key, apiModel: definitions[key]!.apiModel }] : []);
  }

  async #run(action: () => Promise<string | undefined>): Promise<ModelConnectionsResult> {
    try {
      const connectionId = await action();
      return { ok: true, view: this.list(), ...(connectionId ? { connectionId } : {}) };
    } catch (error) {
      if (error instanceof ModelConnectionsError) return { ok: false, error: { code: error.code, message: error.message } };
      if (error instanceof ProviderSettingsError) {
        const code: ModelConnectionsErrorCode = error.code === "invalid_api_key" || error.code === "invalid_base_url" || error.code === "invalid_proxy_url" || error.code === "secret_storage_unavailable" ? error.code : "write_failed";
        return { ok: false, error: { code, message: error.message } };
      }
      return { ok: false, error: { code: "write_failed", message: error instanceof Error ? error.message : "保存失败。" } };
    }
  }
}

class ModelConnectionsError extends Error {
  constructor(readonly code: ModelConnectionsErrorCode, message: string) {
    super(message);
  }
}

const PURPOSE_BINDING_FIELD: Record<PurposeId, keyof Omit<SettingsV4Models["taskBindings"], "thinking">> = {
  chat: "defaultChat",
  utility: "utility",
  autoReview: "autoReview",
  explore: "explore",
  vision: "vision",
};

function requireConnection(models: SettingsV4Models, connectionId: string): SettingsV4ConnectionSettings {
  const connection = models.connections[connectionId];
  if (!connection) throw new ModelConnectionsError("connection_missing", "连接不存在。");
  return connection;
}

function isDefaultConnection(connection: Pick<SettingsV4ConnectionSettings, "connectionId" | "providerId">): boolean {
  return connection.connectionId === `${connection.providerId}:default`;
}

function connectionProtocol(connection: SettingsV4ConnectionSettings, template: ProviderTemplate): ModelApi {
  if (isDefaultConnection(connection)) return template.protocol ?? "openai-completions";
  return connection.protocol ?? template.protocol ?? "openai-completions";
}

function templateOrder(templateId: string): number {
  const index = PROVIDER_TEMPLATES.findIndex((template) => template.id === templateId);
  return index < 0 ? PROVIDER_TEMPLATES.length : index;
}

function uniqueConnectionId(templateId: string, models: SettingsV4Models): string {
  for (;;) {
    const id = `${templateId}-${randomUUID().slice(0, 8)}`;
    if (!models.connections[id]) return id;
  }
}

function normalizeAddress(raw: string, protocol: ModelApi): string {
  const address = normalizeCustomConnectionAddress(raw, protocol);
  if (!address.ok) throw new ModelConnectionsError("invalid_base_url", "服务地址无效。");
  try {
    return normalizeBaseUrl(address.baseUrl);
  } catch {
    throw new ModelConnectionsError("invalid_base_url", "服务地址无效。");
  }
}

function normalizeProxy(input: ProviderProxySettings | undefined): ProviderProxySettings {
  if (!input?.enabled) return { enabled: false, url: input?.url?.trim() || null };
  try {
    return { enabled: true, url: normalizeProxyUrl(input.url ?? "") };
  } catch {
    throw new ModelConnectionsError("invalid_proxy_url", "代理地址无效。");
  }
}

function sameUrl(left: string, right: string | undefined): boolean {
  return Boolean(right) && left.replace(/\/+$/, "") === right!.replace(/\/+$/, "");
}

/** 移除一批模型：定义、安装、用户修改一起删；用到它们的用途改回「跟随」。 */
function removeKeysPatch(models: SettingsV4Models, keys: ModelKey[]): Partial<SettingsV4Models> {
  if (keys.length === 0) return {};
  const removed = new Set<string>(keys);
  const nulls = Object.fromEntries(keys.map((key) => [key, null]));
  const bindings = models.taskBindings;
  const cleared = Object.fromEntries((["defaultChat", "utility", "autoReview", "explore", "vision"] as const)
    .filter((field) => bindings[field] && removed.has(bindings[field]!))
    .map((field) => [field, null]));
  return {
    definitions: Object.fromEntries(keys.filter((key) => models.definitions[key]?.source !== "builtin" && models.definitions[key]?.source !== "curated").map((key) => [key, null])) as SettingsV4Models["definitions"],
    installed: nulls as SettingsV4Models["installed"],
    overrides: nulls as SettingsV4Models["overrides"],
    ...(Object.keys(cleared).length > 0 ? { taskBindings: cleared as SettingsV4Models["taskBindings"] } : {}),
  };
}
