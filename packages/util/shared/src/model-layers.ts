import type { ModelCatalogEntry, ModelCatalogSnapshot } from "./model-catalog";
import { findCatalogEntry, matchCatalogModel } from "./model-catalog-match";
import type { ModelApi, ModelCapabilities, ModelDefinition, ModelInputKind, ModelPricing, ModelReasoningEffort } from "./model-config";
import { cloneThinking, isThinkingLevel, normalizeThinking, thinkingProfileFor, type ModelThinking, type ThinkingLevel } from "./model-thinking-profiles";
import { CNY_PER_USD } from "./usage-cost";

/**
 * 模型四层里的最后一层：每个字段的有效值 = 用户修改 > 服务商数据 > 模型目录 > 未知。
 * 「服务商数据」指连接 /models 返回的字段，或内置模型自带的定义。
 * 价格：非手填的价格都算参考价，乘连接倍率；手填价格是实际价格，不乘。
 */

/** USD / 百万 token；cacheRead / cacheWrite 为 null 表示不知道（不是免费）。 */
export type ModelRates = { input: number; output: number; cacheRead: number | null; cacheWrite: number | null };
export type ModelFacts = {
  label?: string;
  contextWindow?: number | null;
  maxOutput?: number | null;
  input?: ModelInputKind[];
  thinking?: ModelThinking;
  rates?: ModelRates;
  /** 阶梯价或按次收费：基础单价不能代表真实花费。 */
  ratesUnsupported?: boolean;
};
/** 用户修改。canonical：把这个模型当作某个目录模型（存目录 apiModel）。 */
export type ModelOverrides = ModelFacts & { canonical?: string };
export type FactSource = "user" | "provider" | "catalog" | "unknown";
export type EffectiveField = "label" | "contextWindow" | "maxOutput" | "input" | "thinking" | "rates";

export type EffectiveModel = {
  label: string;
  contextWindow: number | null;
  maxOutput: number | null;
  input: ModelInputKind[];
  /** null = 不知道能不能思考；{levels:[]} = 明确不支持。 */
  thinking: ModelThinking | null;
  /** 已经乘过倍率（如果需要）的最终单价。 */
  rates: ModelRates | null;
  ratesUnsupported: boolean;
  /** rates 是否乘了倍率（参考价为 true，手填价为 false）。 */
  ratesScaled: boolean;
  multiplier: number;
  sources: Record<EffectiveField, FactSource>;
  /** 命中的目录模型；exact=false 只是「像是 X 的日期版本」的建议，没有参与取值。 */
  catalog: { apiModel: string; name: string; exact: boolean } | null;
  /** 沿用了 overrides.canonical 指定的目录模型。 */
  aliased: boolean;
};

export type ResolveEffectiveInput = {
  apiModel: string;
  protocol: ModelApi;
  catalog: Pick<ModelCatalogSnapshot, "entries">;
  /** 连接模板对应的目录 provider，用来在多个同名目录条目里优先选官方那条。 */
  catalogProvider?: string | null;
  providerFacts?: ModelFacts;
  overrides?: ModelOverrides;
  multiplier?: number;
};

export function catalogFacts(entry: ModelCatalogEntry, protocol: ModelApi): ModelFacts {
  const { input, output, cacheRead, cacheWrite } = entry.rates;
  return {
    label: entry.name.replace(/\s*\(latest\)$/i, ""),
    contextWindow: entry.contextWindow,
    maxOutput: entry.maxOutput,
    input: entry.input.includes("image") ? ["text", "image"] : ["text"],
    thinking: entry.reasoning ? thinkingProfileFor(entry.apiModel, protocol) : { levels: [] },
    ...(input !== null && output !== null ? { rates: { input, output, cacheRead, cacheWrite } } : {}),
    ratesUnsupported: entry.unsupportedBilling,
  };
}

export function resolveEffectiveModel(input: ResolveEffectiveInput): EffectiveModel {
  const overrides = input.overrides ?? {};
  const provider = input.providerFacts ?? {};
  const multiplier = Number.isFinite(input.multiplier) && input.multiplier! >= 0 ? input.multiplier! : 1;
  const aliasedEntry = overrides.canonical ? findCatalogEntry(input.catalog, overrides.canonical, input.catalogProvider) : null;
  const match = aliasedEntry ? { entry: aliasedEntry, exact: true } : matchCatalogModel(input.catalog, input.apiModel, input.catalogProvider);
  const catalog = match?.exact ? catalogFacts(match.entry, input.protocol) : {};
  const sources = {} as Record<EffectiveField, FactSource>;
  const pick = <K extends EffectiveField>(field: K): ModelFacts[K] | undefined => {
    for (const [source, facts] of [["user", overrides], ["provider", provider], ["catalog", catalog]] as const) {
      const value = facts[field];
      if (value !== undefined && value !== null) { sources[field] = source; return value; }
    }
    sources[field] = "unknown";
    return undefined;
  };
  const label = pick("label");
  const contextWindow = pick("contextWindow");
  const maxOutput = pick("maxOutput");
  const inputKinds = pick("input");
  const thinking = pick("thinking");
  const rates = pick("rates");
  const ratesScaled = sources.rates === "provider" || sources.rates === "catalog";
  const ratesUnsupported = sources.rates === "user" ? false
    : Boolean(sources.rates === "provider" ? provider.ratesUnsupported : catalog.ratesUnsupported);
  return {
    label: label ?? input.apiModel,
    contextWindow: contextWindow ?? null,
    maxOutput: maxOutput ?? null,
    input: inputKinds ? [...inputKinds] : ["text"],
    thinking: thinking ? normalizeThinking(thinking) : null,
    rates: rates ? scaleRates(rates, ratesScaled ? multiplier : 1) : null,
    ratesUnsupported,
    ratesScaled,
    multiplier,
    sources,
    catalog: match ? { apiModel: match.entry.apiModel, name: catalogFacts(match.entry, input.protocol).label!, exact: match.exact } : null,
    aliased: Boolean(aliasedEntry),
  };
}

function scaleRates(rates: ModelRates, factor: number): ModelRates {
  const scale = (value: number) => Number((value * factor).toFixed(8));
  return {
    input: scale(rates.input),
    output: scale(rates.output),
    cacheRead: rates.cacheRead === null ? null : scale(rates.cacheRead),
    cacheWrite: rates.cacheWrite === null ? null : scale(rates.cacheWrite),
  };
}

/**
 * 把思考档位映射回运行时和对话框已经在用的 ModelCapabilities 字段，对话框因此不用改。
 * 映射表见 docs/exec-plans/completed/20261021-model-provider-redesign.md「数据设计」。
 */
export function thinkingToCapabilities(thinking: ModelThinking | null): {
  thinkingDefault: boolean;
  capabilities: Pick<ModelCapabilities, "reasoning" | "thinkingToggle" | "reasoningEfforts" | "reasoningDefaultEffort" | "reasoningMandatory">;
} {
  if (!thinking || !thinking.levels.length) {
    return { thinkingDefault: false, capabilities: { reasoning: false, thinkingToggle: false } };
  }
  const { levels, default: def } = normalizeThinking(thinking);
  const canOff = levels.includes("off");
  const efforts = levels.filter((level): level is Exclude<ThinkingLevel, "off"> => level !== "off") as ModelReasoningEffort[];
  const onDefault = (def && def !== "off" ? def : efforts.includes("medium") ? "medium" : efforts[Math.floor(efforts.length / 2)]) as ModelReasoningEffort;
  const multi = efforts.length >= 2;
  return {
    thinkingDefault: canOff ? def !== "off" : true,
    capabilities: {
      reasoning: true,
      thinkingToggle: canOff,
      reasoningMandatory: !canOff,
      ...(multi ? { reasoningEfforts: efforts, reasoningDefaultEffort: onDefault } : {}),
    },
  };
}

/** ModelCapabilities → 思考档位；用于把内置定义、旧的自定义模型读成服务商数据。 */
export function capabilitiesToThinking(capabilities: ModelCapabilities, thinkingDefault: boolean): ModelThinking {
  if (!capabilities.reasoning) return { levels: [] };
  const efforts = (capabilities.reasoningEfforts ?? []).filter((effort): effort is Exclude<ThinkingLevel, "off"> =>
    effort === "low" || effort === "medium" || effort === "high" || effort === "xhigh" || effort === "max");
  const on: ThinkingLevel[] = efforts.length ? efforts : ["high"];
  const canOff = capabilities.thinkingToggle && !capabilities.reasoningMandatory;
  const onDefault = capabilities.reasoningDefaultEffort && on.includes(capabilities.reasoningDefaultEffort as ThinkingLevel)
    ? capabilities.reasoningDefaultEffort as ThinkingLevel
    : on.includes("high") ? "high" : on[0];
  return normalizeThinking({
    levels: canOff ? ["off", ...on] : on,
    default: canOff && !thinkingDefault ? "off" : onDefault,
  });
}

/** 有效单价 → 旧的 ModelPricing 形状（缓存价未知时按未命中价估算，只用于展示兼容字段）。 */
export function ratesToPricing(rates: ModelRates): ModelPricing {
  return {
    currency: "USD",
    inputCacheMissPerMillion: rates.input,
    inputCacheHitPerMillion: rates.cacheRead ?? rates.input,
    ...(rates.cacheWrite !== null ? { inputCacheWritePerMillion: rates.cacheWrite } : {}),
    outputPerMillion: rates.output,
  };
}

/** 旧的 ModelPricing（可能是 CNY）→ USD 单价。 */
export function pricingToRates(pricing: ModelPricing): ModelRates {
  const factor = pricing.currency === "CNY" ? 1 / CNY_PER_USD : 1;
  const usd = (value: number) => Number((value * factor).toFixed(8));
  return {
    input: usd(pricing.inputCacheMissPerMillion),
    output: usd(pricing.outputPerMillion),
    cacheRead: usd(pricing.inputCacheHitPerMillion),
    cacheWrite: pricing.inputCacheWritePerMillion === undefined ? null : usd(pricing.inputCacheWritePerMillion),
  };
}

export function cloneFacts<T extends ModelFacts>(facts: T): T {
  return {
    ...facts,
    ...(facts.input ? { input: [...facts.input] } : {}),
    ...(facts.thinking ? { thinking: cloneThinking(facts.thinking) } : {}),
    ...(facts.rates ? { rates: { ...facts.rates } } : {}),
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const positiveInt = (value: unknown, max: number): number | undefined =>
  typeof value === "number" && Number.isInteger(value) && value > 0 && value <= max ? value : undefined;
const price = (value: unknown): number | undefined => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100_000 ? value : undefined;

/** 从磁盘或 renderer 来的 facts：只保留合法字段。 */
export function sanitizeModelFacts(value: unknown): ModelFacts {
  if (!isRecord(value)) return {};
  const facts: ModelFacts = {};
  if (typeof value.label === "string" && value.label.trim()) facts.label = value.label.trim().slice(0, 120);
  const context = positiveInt(value.contextWindow, 100_000_000);
  if (context) facts.contextWindow = context;
  const output = positiveInt(value.maxOutput, 100_000_000);
  if (output) facts.maxOutput = output;
  if (Array.isArray(value.input)) facts.input = value.input.includes("image") ? ["text", "image"] : ["text"];
  if (isRecord(value.thinking) && Array.isArray(value.thinking.levels)) {
    const levels = value.thinking.levels.filter(isThinkingLevel);
    facts.thinking = normalizeThinking({ levels, ...(isThinkingLevel(value.thinking.default) ? { default: value.thinking.default } : {}) });
  }
  if (isRecord(value.rates)) {
    const input = price(value.rates.input);
    const output = price(value.rates.output);
    if (input !== undefined && output !== undefined) {
      facts.rates = { input, output, cacheRead: price(value.rates.cacheRead) ?? null, cacheWrite: price(value.rates.cacheWrite) ?? null };
    }
  }
  if (typeof value.ratesUnsupported === "boolean") facts.ratesUnsupported = value.ratesUnsupported;
  return facts;
}

export function sanitizeModelOverrides(value: unknown): ModelOverrides {
  const overrides: ModelOverrides = sanitizeModelFacts(value);
  delete overrides.ratesUnsupported;
  if (isRecord(value) && typeof value.canonical === "string" && value.canonical.trim()) overrides.canonical = value.canonical.trim().slice(0, 200);
  return overrides;
}

export function isEmptyFacts(facts: ModelFacts | ModelOverrides | undefined | null): boolean {
  return !facts || Object.keys(facts).length === 0;
}

/** 内置 / 精选 / 旧目录模型自带的定义 → 服务商数据层。 */
export function factsFromDefinition(definition: ModelDefinition): ModelFacts {
  return {
    label: definition.label,
    ...(definition.contextWindow ? { contextWindow: definition.contextWindow } : {}),
    ...(definition.maxTokens ? { maxOutput: definition.maxTokens } : {}),
    input: definition.capabilities.input.includes("image") ? ["text", "image"] : ["text"],
    thinking: capabilitiesToThinking(definition.capabilities, definition.thinkingDefault),
    ...(definition.pricing ? { rates: pricingToRates(definition.pricing), ratesUnsupported: definition.pricing.reasoningPerMillion !== undefined } : {}),
  };
}

/** 服务商数据层：内置定义自带，其余来自连接 /models。 */
export function providerFactsOf(definition: ModelDefinition): ModelFacts | undefined {
  return definition.source === "builtin" || definition.source === "curated" ? factsFromDefinition(definition) : definition.providerFacts;
}

/**
 * 把有效值写回 definition：运行时、对话框、用量都读这一份。
 * 内置模型的思考字段只有在用户改过时才重写，避免丢掉 reasoningEfforts:null 这类内置细节。
 */
export function applyEffectiveToDefinition(definition: ModelDefinition, effective: EffectiveModel, protocol: ModelApi): ModelDefinition {
  const builtin = definition.source === "builtin" || definition.source === "curated";
  const keepThinking = builtin && effective.sources.thinking === "provider";
  const thinking = thinkingToCapabilities(effective.thinking);
  const { pricing: _pricing, ...rest } = definition;
  return {
    ...rest,
    effective,
    api: protocol,
    label: effective.label,
    contextWindow: effective.contextWindow,
    maxTokens: effective.maxOutput,
    thinkingDefault: keepThinking ? definition.thinkingDefault : thinking.thinkingDefault,
    capabilities: keepThinking
      ? { ...definition.capabilities, input: [...effective.input] }
      : {
          input: [...effective.input],
          toolUse: definition.capabilities.toolUse,
          ...thinking.capabilities,
        },
    ...(effective.rates ? { pricing: ratesToPricing(effective.rates) } : {}),
  };
}
