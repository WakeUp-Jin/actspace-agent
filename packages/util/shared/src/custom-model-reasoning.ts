import { BUILTIN_MODEL_LIST, CURATED_OPENROUTER_MODEL_LIST, MODEL_REASONING_EFFORTS, type ModelCapabilities, type ModelDefinition, type ModelReasoningEffort } from "./model-config";
import { BUILTIN_MODEL_CATALOG } from "./generated/model-catalog.generated";

export type CustomModelReasoning = {
  mode: "auto" | "manual";
  referenceModel?: string;
  support?: "unknown" | "supported" | "unsupported";
  efforts?: ModelReasoningEffort[];
  defaultEffort?: ModelReasoningEffort;
  allowOff?: boolean;
};
export type ReasoningMatch = { support: "unknown" | "supported" | "unsupported"; efforts: ModelReasoningEffort[]; allowOff: boolean; source: string };

const definitions = [...BUILTIN_MODEL_LIST, ...CURATED_OPENROUTER_MODEL_LIST];
export const REASONING_REFERENCE_MODELS = Array.from(new Set([...definitions.map((m) => m.apiModel), ...BUILTIN_MODEL_CATALOG.entries.map((m) => m.apiModel)])).sort();

export function validateCustomModelReasoning(value: unknown): asserts value is CustomModelReasoning {
  if (!value || typeof value !== "object") throw new Error("推理配置无效。");
  const v = value as CustomModelReasoning;
  if (v.mode !== "auto" && v.mode !== "manual") throw new Error("推理配置来源无效。");
  if (v.referenceModel !== undefined && (typeof v.referenceModel !== "string" || !REASONING_REFERENCE_MODELS.includes(v.referenceModel))) throw new Error("参考模型不存在。");
  if (v.mode === "auto") return;
  if (!["unknown", "supported", "unsupported"].includes(v.support ?? "")) throw new Error("推理支持状态无效。");
  if (!Array.isArray(v.efforts) || v.efforts.some((effort) => !MODEL_REASONING_EFFORTS.includes(effort)) || new Set(v.efforts).size !== v.efforts.length) throw new Error("推理强度无效。");
  if (typeof v.allowOff !== "boolean") throw new Error("推理关闭选项无效。");
  if (v.defaultEffort !== undefined && !v.efforts.includes(v.defaultEffort)) throw new Error("默认强度必须属于支持的档位。");
  if (v.support !== "supported" && (v.efforts.length || v.defaultEffort !== undefined)) throw new Error("未启用推理支持，不能配置强度。");
}

export function resolveCustomModelReasoning(apiModel: string, config: CustomModelReasoning = { mode: "auto" }): ReasoningMatch {
  validateCustomModelReasoning(config);
  if (config.mode === "manual") return { support: config.support!, efforts: [...config.efforts!], allowOff: config.allowOff!, source: "手动配置" };
  const id = config.referenceModel ?? apiModel.trim();
  const detailed = definitions.filter((m) => m.apiModel === id);
  const rows = BUILTIN_MODEL_CATALOG.entries.filter((m) => m.apiModel === id);
  const facts = [...detailed.map((m) => m.capabilities.reasoning), ...rows.map((m) => m.reasoning)];
  if (!facts.length || facts.some((fact) => fact !== facts[0])) return { support: "unknown", efforts: [], allowOff: false, source: facts.length ? "目录声明冲突，请手动配置" : "未匹配到目录模型" };
  const effortSets = detailed.map((m) => m.capabilities.reasoningEfforts).filter((v): v is ModelReasoningEffort[] => Array.isArray(v));
  const efforts = effortSets.length ? effortSets[0].filter((e) => effortSets.every((set) => set.includes(e))) : [];
  return { support: facts[0] ? "supported" : "unsupported", efforts, allowOff: detailed.length > 0 && detailed.every((m) => m.capabilities.thinkingToggle && !m.capabilities.reasoningMandatory), source: `目录匹配：${id}，未经中转验证` };
}

export function applyCustomModelReasoning(model: ModelDefinition, config: CustomModelReasoning): ModelDefinition {
  const match = resolveCustomModelReasoning(model.apiModel, config);
  if (model.api === "anthropic-messages" && match.efforts.some((e) => !["low", "medium", "high", "xhigh", "max"].includes(e))) throw new Error("Anthropic 协议仅支持 low、medium、high、xhigh、max 强度；请手动配置兼容档位。");
  const capabilities: ModelCapabilities = { ...model.capabilities, reasoning: match.support === "supported", thinkingToggle: match.support === "supported" && match.allowOff, reasoningMandatory: match.support === "supported" && !match.allowOff, reasoningEfforts: match.support === "supported" ? match.efforts : undefined, reasoningDefaultEffort: config.mode === "manual" ? config.defaultEffort : undefined };
  return { ...model, reasoningConfig: { ...config, ...(config.efforts ? { efforts: [...config.efforts] } : {}) }, capabilities, thinkingDefault: match.support === "supported" };
}
