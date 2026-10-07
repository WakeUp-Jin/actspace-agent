import { MODEL_REASONING_EFFORTS } from "@actspace/shared";
import type { LlmProviderId, ModelReasoningEffort, ModelSelectionId } from "@actspace/shared";

/** 输入框里一个可选模型：展示信息加上它支持的运行时选项（Thinking、推理强度）。 */
export type ComposerModelOption = {
  id: ModelSelectionId;
  label: string;
  provider: LlmProviderId;
  apiModel: string;
  connectionLabel?: string;
  thinkingDefault: boolean;
  supportsThinkingToggle: boolean;
  reasoningEfforts?: ModelReasoningEffort[] | null;
  reasoningDefaultEffort?: ModelReasoningEffort;
  reasoningMandatory: boolean;
};

export type ComposerModelRuntimeOptions = {
  thinkingEnabled: boolean;
  reasoningEffort?: ModelReasoningEffort;
};

const REASONING_EFFORT_LABELS: Record<ModelReasoningEffort, string> = {
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra High",
  max: "Max",
  ultra: "Ultra",
};

export function isModelEditable(model: ComposerModelOption): boolean {
  return model.supportsThinkingToggle || model.reasoningEfforts !== undefined;
}

export function modelDefaultRuntimeOptions(model: ComposerModelOption | undefined): ComposerModelRuntimeOptions {
  return {
    thinkingEnabled: model?.reasoningMandatory || model?.thinkingDefault || false,
    ...(model?.reasoningDefaultEffort && {
      reasoningEffort: model.reasoningDefaultEffort,
    }),
  };
}

export function currentModelRuntimeOptions(model: ComposerModelOption | undefined, saved?: ComposerModelRuntimeOptions): ComposerModelRuntimeOptions {
  if (!saved) return modelDefaultRuntimeOptions(model);
  const thinkingEnabled = Boolean(model?.reasoningMandatory || ((model && isModelEditable(model)) && saved.thinkingEnabled));
  return { thinkingEnabled, ...(thinkingEnabled && saved.reasoningEffort && modelReasoningEfforts(model).includes(saved.reasoningEffort) ? { reasoningEffort: saved.reasoningEffort } : {}) };
}

export function reasoningEffortLabel(effort: ModelReasoningEffort): string {
  return REASONING_EFFORT_LABELS[effort];
}

export function modelReasoningEfforts(model: ComposerModelOption | undefined): ModelReasoningEffort[] {
  if (model?.reasoningEfforts === null) return [...MODEL_REASONING_EFFORTS];
  return model?.reasoningEfforts ?? [];
}
