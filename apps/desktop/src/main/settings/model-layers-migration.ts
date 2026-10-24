/**
 * 四层模型迁移，纯函数，每一步只跑一次。
 *
 * layersVersion 0 → 1：
 * - I5：旧的自定义模型只把「和不带修改时算出的值不一样」的字段写进 overrides；手动推理配置转成思考档位修改。
 * - I6：计费模式去掉。reference 下单独填的价格、manual 下填的价格（当时会乘倍率，这里乘好）转成手填价；token 下的价格丢掉，改按参考价 × 倍率。
 * - I7：看图只在白名单模型已安装时迁到用途表，否则跟随会话默认。
 * - 轻量任务和自动审批以前固定不思考，迁成用途表里的「关」档，行为不变。
 * - 探索模型以前还镜像在 subagents.routes.explore 里（只写不清，导致没法改回跟随）：并入 taskBindings 后删除镜像。
 * - 旧目录模型（provider-catalog）自带的字段转成服务商数据；installed.customLabel 转成名称修改。
 * 多 Key（D11）在 sanitize 里直接丢弃，这里不用处理。
 * 旧文件里的看图模型和计费方式不再进设置类型，由 legacyModelHints 在读文件时从原始 JSON 里取出，只给本次迁移用。
 *
 * layersVersion 1 → 2：模型去掉「启用」开关，在列表里就是在用。停用的模型连同定义和修改一起移除，用到它们的用途改为跟随。
 */
import {
  capabilitiesToThinking,
  factsFromDefinition,
  isEmptyFacts,
  pricingToRates,
  resolveEffectiveModel,
  templateForConnection,
  type ModelCatalogSnapshot,
  type ModelDefinition,
  type ModelKey,
  type ModelOverrides,
  type ModelRates,
  type SettingsV4,
} from "@actspace/shared";
import { MODEL_LAYERS_VERSION } from "./defaults";
import { cloneJson } from "./utils";

type LegacyBillingMode = "reference" | "token" | "manual";
export type LegacyModelHints = {
  readonly visionModel: string | null;
  readonly billingModes: Readonly<Record<string, LegacyBillingMode>>;
};
const NO_HINTS: LegacyModelHints = { visionModel: null, billingModes: {} };

/** 从旧设置文件的原始 JSON 取出迁移要用的两项：v2/v3 的 imageInspection、v4 的 media.imageInspection 和各连接的 billingMode。 */
export function legacyModelHints(raw: string | undefined): LegacyModelHints {
  if (!raw) return NO_HINTS;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return NO_HINTS; }
  const root = asRecord(parsed);
  const inspection = asRecord(asRecord(root.media).imageInspection ?? root.imageInspection);
  const billingModes: Record<string, LegacyBillingMode> = {};
  for (const [id, connection] of Object.entries(asRecord(asRecord(root.models).connections))) {
    const mode = asRecord(connection).billingMode;
    if (mode === "reference" || mode === "token" || mode === "manual") billingModes[id] = mode;
  }
  return { visionModel: typeof inspection.modelKey === "string" ? inspection.modelKey : null, billingModes };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function migrateModelLayers(input: SettingsV4, catalog: Pick<ModelCatalogSnapshot, "entries">, hints: LegacyModelHints = NO_HINTS): SettingsV4 | null {
  const version = input.models.layersVersion ?? 0;
  if (version >= MODEL_LAYERS_VERSION) return null;
  const settings = cloneJson(input);
  if (version < 1) migrateToLayers(settings, catalog, hints);
  dropDisabledModels(settings);
  settings.models.layersVersion = MODEL_LAYERS_VERSION;
  return settings;
}

function dropDisabledModels(settings: SettingsV4): void {
  const models = settings.models;
  const disabled = new Set(Object.entries(models.installed).filter(([, installed]) => installed && !installed.enabled).map(([key]) => key));
  if (disabled.size === 0) return;
  for (const key of disabled) {
    const typed = key as ModelKey;
    delete models.installed[typed];
    if (models.overrides) delete models.overrides[typed];
    const source = models.definitions[typed]?.source;
    if (source !== "builtin" && source !== "curated") delete models.definitions[typed];
  }
  for (const field of ["defaultChat", "utility", "autoReview", "explore", "vision"] as const) {
    const bound = models.taskBindings[field];
    if (bound && disabled.has(bound)) models.taskBindings[field] = null;
  }
}

function migrateToLayers(settings: SettingsV4, catalog: Pick<ModelCatalogSnapshot, "entries">, hints: LegacyModelHints): void {
  const models = settings.models;
  const overrides: Partial<Record<ModelKey, ModelOverrides>> = { ...(models.overrides ?? {}) };
  const modes = new Map<string, "reference" | "token" | "manual">();
  for (const connection of Object.values(models.connections)) {
    const custom = connection.connectionId !== `${connection.providerId}:default`;
    if (custom) modes.set(connection.connectionId, hints.billingModes[connection.connectionId] ?? "manual");
  }

  for (const [rawKey, definition] of Object.entries(models.definitions)) {
    const key = rawKey as ModelKey;
    if (!definition) continue;
    if (definition.source === "provider-catalog") {
      models.definitions[key] = { ...definition, providerFacts: factsFromDefinition(definition) };
      continue;
    }
    if (definition.source !== "custom") continue;
    const installed = models.installed[key];
    const connection = installed ? models.connections[installed.connectionId] : undefined;
    const patch = customModelOverrides(definition, {
      catalog,
      protocol: connection?.protocol ?? definition.api,
      catalogProvider: connection ? templateForConnection(connection).catalogProvider : undefined,
      mode: connection ? modes.get(connection.connectionId) ?? "manual" : "manual",
      multiplier: connection?.defaultPricingMultiplier ?? 1,
    });
    if (!isEmptyFacts(patch)) overrides[key] = { ...patch, ...overrides[key] };
    const { reasoningConfig: _reasoning, ...rest } = definition;
    models.definitions[key] = rest;
  }

  for (const [rawKey, installed] of Object.entries(models.installed)) {
    const key = rawKey as ModelKey;
    if (!installed?.customLabel) continue;
    overrides[key] = { ...overrides[key], label: installed.customLabel };
    delete installed.customLabel;
  }

  const visionKey = hints.visionModel as ModelKey | null;
  models.taskBindings.vision = visionKey && models.installed[visionKey] ? visionKey : null;
  models.taskBindings.thinking = { utility: "off", autoReview: "off", ...models.taskBindings.thinking };
  const mirroredExplore = settings.subagents.routes.explore?.model as ModelKey | undefined;
  if (!models.taskBindings.explore && mirroredExplore && models.installed[mirroredExplore]) models.taskBindings.explore = mirroredExplore;
  delete settings.subagents.routes.explore;
  models.overrides = overrides;
}

function customModelOverrides(definition: ModelDefinition, context: {
  catalog: Pick<ModelCatalogSnapshot, "entries">;
  protocol: ModelDefinition["api"];
  catalogProvider?: string;
  mode: "reference" | "token" | "manual";
  multiplier: number;
}): ModelOverrides {
  const baseline = resolveEffectiveModel({ apiModel: definition.apiModel, protocol: context.protocol, catalog: context.catalog, catalogProvider: context.catalogProvider });
  const patch: ModelOverrides = {};
  if (definition.label && definition.label !== definition.apiModel && definition.label !== baseline.label) patch.label = definition.label;
  if (definition.contextWindow && definition.contextWindow !== baseline.contextWindow) patch.contextWindow = definition.contextWindow;
  if (definition.maxTokens && definition.maxTokens !== baseline.maxOutput) patch.maxOutput = definition.maxTokens;
  const image = definition.capabilities.input.includes("image");
  if (image !== baseline.input.includes("image")) patch.input = image ? ["text", "image"] : ["text"];
  // 自动推理配置本来就是「跟目录走」，新的档位表接手；只有手动配置算用户修改。
  if (definition.reasoningConfig?.mode === "manual") patch.thinking = capabilitiesToThinking(definition.capabilities, definition.thinkingDefault);
  if (definition.pricing && context.mode !== "token") {
    const rates = pricingToRates(definition.pricing);
    const scaled = context.mode === "manual" ? scaleRates(rates, context.multiplier) : rates;
    if (!sameRates(scaled, baseline.rates)) patch.rates = scaled;
  }
  return patch;
}

function scaleRates(rates: ModelRates, factor: number): ModelRates {
  const scale = (value: number) => Number((value * factor).toFixed(8));
  return { input: scale(rates.input), output: scale(rates.output), cacheRead: rates.cacheRead === null ? null : scale(rates.cacheRead), cacheWrite: rates.cacheWrite === null ? null : scale(rates.cacheWrite) };
}

function sameRates(left: ModelRates, right: ModelRates | null): boolean {
  return Boolean(right) && left.input === right!.input && left.output === right!.output && left.cacheRead === right!.cacheRead && left.cacheWrite === right!.cacheWrite;
}
