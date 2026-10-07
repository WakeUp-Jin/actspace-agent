/** custom connection 的校验、地址规范化、认证方式推导和模型补丁。 */
import { applyCustomModelReasoning, validateCustomModelReasoning } from "@actspace/shared";
import {
  buildCustomModelDefinition,
  isProviderId,
  isConnectionProtocol,
  normalizeCustomConnectionAddress,
  type CustomConnectionAuthMode,
  type CustomConnectionInput,
  type CustomConnectionPromptCacheMode,
  type CustomConnectionResolvedAuth,
  type ModelApi,
  type ModelKey,
  type SettingsV4ConnectionSettings,
  type SettingsV4Models,
} from "@actspace/shared";
import { normalizePricingMultiplier } from "./sanitize";
import { ProviderSettingsError } from "./types";

export const CUSTOM_CONNECTION_ADDRESS_ERRORS = {
  empty: "服务地址不能为空。",
  invalid: "服务地址格式无效。",
  scheme: "服务地址仅支持 HTTP(S)。",
  credentials: "服务地址不能包含用户名或密码。",
} as const;

export function normalizeCustomConnectionBaseUrl(value: string, protocol: ModelApi): string {
  const result = normalizeCustomConnectionAddress(value, protocol);
  if ("reason" in result) throw new ProviderSettingsError(CUSTOM_CONNECTION_ADDRESS_ERRORS[result.reason], "invalid_base_url");
  // 渲染层会按地址自动切换协议；到这里还不一致说明地址和协议对不上，保存了也请求不通。
  if (result.inferredProtocol && result.inferredProtocol !== protocol) {
    throw new ProviderSettingsError("服务地址和所选协议不一致。", "invalid_base_url");
  }
  return result.baseUrl;
}

export function resolvePromptCacheMode(protocol: ModelApi, value?: CustomConnectionPromptCacheMode): CustomConnectionPromptCacheMode {
  if (protocol !== "anthropic-messages") return "off";
  return value === "off" ? "off" : "short";
}

export function validateCustomConnection(input: CustomConnectionInput, options: { requireModel?: boolean } = { requireModel: true }): void {
  if (input.modelReasoning !== undefined) validateCustomModelReasoning(input.modelReasoning);
  if (!isProviderId(input.providerId) || (input.protocol !== undefined && !isConnectionProtocol(input.protocol))) {
    throw new ProviderSettingsError("连接协议无效。", "write_failed");
  }
  if (!input.apiKey?.trim()) throw new ProviderSettingsError("请输入 API Key。", "write_failed");
  if (input.authMode !== undefined && !isCustomConnectionAuthMode(input.authMode)) throw new ProviderSettingsError("认证方式无效。", "write_failed");
  if (input.resolvedAuth !== undefined && !isResolvedAuth(input.resolvedAuth)) throw new ProviderSettingsError("认证方式无效。", "write_failed");
  if (input.billingMode !== undefined && !["reference", "token", "manual"].includes(input.billingMode)) throw new ProviderSettingsError("计费方式无效。", "write_failed");
  if (input.pricingMultiplier !== undefined) normalizePricingMultiplier(input.pricingMultiplier);
  if (input.initialModels !== undefined) {
    if (input.initialModel !== undefined) throw new ProviderSettingsError("initialModel 和 initialModels 只能传一个。", "write_failed");
    if (input.initialModels.length === 0 || input.initialModels.length > 200) throw new ProviderSettingsError("请至少选择一个模型。", "write_failed");
    const ids = input.initialModels.map((model) => model.apiModel.trim());
    if (new Set(ids).size !== ids.length) throw new ProviderSettingsError("模型 ID 重复。", "write_failed");
    if (input.defaultApiModel !== undefined && !ids.includes(input.defaultApiModel.trim())) throw new ProviderSettingsError("默认模型必须是已选模型之一。", "write_failed");
  }
  const defaultModel = customConnectionDefaultModel(input);
  if (options.requireModel !== false && (!defaultModel?.trim() || defaultModel.trim().length > 200)) {
    throw new ProviderSettingsError("请输入有效的默认模型 ID（最多 200 字符）。", "write_failed");
  }
}

export function customConnectionDefaultModel(input: CustomConnectionInput): string | null | undefined {
  if (input.initialModels) return input.defaultApiModel ?? input.initialModels[0]?.apiModel;
  return input.initialModel?.apiModel ?? input.defaultModel;
}

export function isCustomConnectionAuthMode(value: unknown): value is CustomConnectionAuthMode {
  return value === "auto" || value === "x-api-key" || value === "bearer";
}

export function isResolvedAuth(value: unknown): value is CustomConnectionResolvedAuth {
  return value === "x-api-key" || value === "bearer";
}

/** 认证方式只对 Anthropic 协议有意义；OpenAI 协议固定 Bearer，不存这两个字段。 */
export function connectionAuthFields(protocol: ModelApi, authMode?: CustomConnectionAuthMode, resolvedAuth?: CustomConnectionResolvedAuth): Pick<SettingsV4ConnectionSettings, "authMode" | "resolvedAuth"> {
  if (protocol !== "anthropic-messages" || !authMode) return {};
  return { authMode, ...(authMode === "auto" && resolvedAuth ? { resolvedAuth } : {}) };
}

export function withoutConnectionAuth(connection: SettingsV4ConnectionSettings): SettingsV4ConnectionSettings {
  const { authMode: _authMode, resolvedAuth: _resolvedAuth, ...rest } = connection;
  return rest;
}

export function resolveAuthScheme(connection: SettingsV4ConnectionSettings): CustomConnectionResolvedAuth {
  if (connection.authMode === "bearer") return "bearer";
  if (connection.authMode === "auto") return connection.resolvedAuth ?? "x-api-key";
  return "x-api-key";
}

/** 名称为空时取域名；和已有连接重名时加「 2」「 3」。 */
export function uniqueConnectionName(name: string, connections: Record<string, SettingsV4ConnectionSettings>): string {
  const taken = new Set(Object.values(connections).map((connection) => connection.displayName));
  if (!taken.has(name)) return name;
  for (let index = 2; ; index += 1) if (!taken.has(`${name} ${index}`)) return `${name} ${index}`;
}

/** Separate keys for identical upstream model IDs on different connections. */
export function connectionModelPatch(input: CustomConnectionInput, connectionId: string, protocol: ModelApi, models: SettingsV4Models): Pick<SettingsV4Models, "definitions" | "installed"> {
  if (input.initialModels) {
    const addedAt = new Date().toISOString();
    const defaultApiModel = customConnectionDefaultModel(input)?.trim();
    const patch: Pick<SettingsV4Models, "definitions" | "installed"> = { definitions: {}, installed: {} };
    for (const model of input.initialModels) {
      const definition = buildCustomModelDefinition(model, { providerId: input.providerId, protocol, connectionId });
      patch.definitions[definition.key] = definition;
      patch.installed[definition.key] = { enabled: model.enabled || definition.apiModel === defaultApiModel, addedAt, connectionId };
    }
    return patch;
  }
  const apiModel = (input.initialModel?.apiModel ?? input.defaultModel)!.trim();
  const key: ModelKey = `${input.providerId}:connection/${encodeURIComponent(connectionId)}/${encodeURIComponent(apiModel)}`;
  const previous = models.definitions[key];
  if (input.initialModel) {
    const definition = buildCustomModelDefinition({ ...input.initialModel, enabled: true }, { providerId: input.providerId, protocol, connectionId });
    return {
      definitions: { [key]: definition },
      installed: { [key]: { enabled: true, addedAt: models.installed[key]?.addedAt ?? new Date().toISOString(), connectionId } },
    };
  }
  return {
    definitions: { [key]: applyCustomModelReasoning({
      ...previous,
      key, provider: input.providerId, api: protocol, apiModel,
      label: `${input.displayName.trim() || connectionId} · ${apiModel}`,
      source: "custom" as const, contextWindow: previous?.contextWindow ?? null, maxTokens: previous?.maxTokens ?? null,
      thinkingDefault: previous?.thinkingDefault ?? false,
      capabilities: previous?.capabilities ?? { input: ["text"], toolUse: "declared", reasoning: false, thinkingToggle: false },
    }, input.modelReasoning ?? previous?.reasoningConfig ?? { mode: "auto" }) },
    installed: { [key]: { enabled: true, addedAt: new Date().toISOString(), ...models.installed[key], connectionId } },
  };
}
