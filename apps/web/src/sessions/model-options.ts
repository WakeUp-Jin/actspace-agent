import { resolveCustomModelReasoning, type ModelReasoningEffort } from "@actspace/shared";
import { BUILTIN_MODEL_CATALOG } from "@actspace/shared/model-catalog-data";
import type { HostModel } from "../connection/connection-store";

const EFFORT_LABELS: Record<ModelReasoningEffort, string> = { minimal: "Minimal", low: "Low", medium: "Medium", high: "High", xhigh: "Extra High", max: "Max", ultra: "Ultra" };
export const effortLabel = (effort: string): string => EFFORT_LABELS[effort as ModelReasoningEffort] ?? effort;

/** Host 的模型 id 是 `<provider>/<model>`；目录按 model 部分（apiModel）查。不在目录或不支持推理时返回 []。 */
export function effortOptionsFor(modelId: string): ModelReasoningEffort[] {
  const apiModel = modelId.slice(modelId.indexOf("/") + 1);
  const entry = BUILTIN_MODEL_CATALOG.entries.find(item => item.apiModel === apiModel);
  if (!entry || !entry.reasoning) return [];
  return resolveCustomModelReasoning(apiModel).efforts;
}

export type ModelGroup = { readonly provider: string; readonly models: readonly HostModel[] };
/** 按供应商分组，保持 Host 给出的顺序。 */
export function groupModels(models: readonly HostModel[]): ModelGroup[] {
  const groups = new Map<string, HostModel[]>();
  for (const model of models) groups.set(model.provider, [...(groups.get(model.provider) ?? []), model]);
  return [...groups].map(([provider, items]) => ({ provider, models: items }));
}

export function modelShortName(modelId: string, models: readonly HostModel[]): string {
  return models.find(model => model.id === modelId)?.name ?? modelId.slice(modelId.indexOf("/") + 1);
}
