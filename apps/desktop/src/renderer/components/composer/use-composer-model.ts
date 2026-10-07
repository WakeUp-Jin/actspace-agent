import { useEffect, useRef, useState } from "react";
import type { ModelSelectionId, UsableModelView } from "@actspace/shared";
import { DEFAULT_MODEL_ID, MODEL_LIST } from "@actspace/shared";
import { tasksApi } from "../../api/tasks";
import { formatSelectedModelLabel } from "../../model-option-groups";
import type { RunTarget } from "../../target/run-target";
import { useModelCatalog } from "../../target/use-model-catalog";
import type { ModelPickerOptions } from "./ModelPicker";
import { currentModelRuntimeOptions, modelDefaultRuntimeOptions, type ComposerModelOption, type ComposerModelRuntimeOptions } from "./model-options";

const LEGACY_MODEL_OPTIONS: ComposerModelOption[] = MODEL_LIST.map((spec) => ({
  id: spec.id,
  label: spec.label,
  provider: spec.provider,
  apiModel: spec.apiModel,
  thinkingDefault: spec.thinkingDefault,
  supportsThinkingToggle: spec.supportsThinkingToggle,
  reasoningMandatory: false,
}));

export type ComposerModelSource = {
  readonly target: RunTarget;
  readonly sessionId: string | null;
  /** 设置页的可用模型；缺省时用内置模型表（老调用方和测试）。 */
  readonly models?: UsableModelView[];
  readonly defaultModelId?: ModelSelectionId;
  /** 会话级当前模型；提供时由上层持有。 */
  readonly selectedModelId?: ModelSelectionId;
  readonly onSelectedModelChange?: (modelId: ModelSelectionId) => void;
  /** 远端 readiness 是否 ready：远端没就绪时模型不可用，也不下发 configure。 */
  readonly remoteReady: boolean;
  /** 一起下发给 configure 的 Skills。 */
  readonly selectedSkills: readonly string[];
};

/**
 * 09 T30：输入框的模型。本机按设置页的模型表选、带 Thinking / 推理强度等运行时选项；远端读 Host 的模型目录（15）。
 * 选中的模型和运行时选项变化时，给当前会话下发 configure。
 */
export function useComposerModel({ target, sessionId, models, defaultModelId, selectedModelId: controlledSelectedModelId, onSelectedModelChange, remoteReady, selectedSkills }: ComposerModelSource) {
  const isRemoteTarget = target.kind === "remote";
  const modelList: ComposerModelOption[] = models === undefined
    ? LEGACY_MODEL_OPTIONS
    : models.map((model) => ({
        id: model.key,
        label: model.label,
        provider: model.provider,
        apiModel: model.apiModel,
        connectionLabel: model.connectionLabel,
        thinkingDefault: model.thinkingDefault,
        supportsThinkingToggle: model.capabilities.thinkingToggle,
        reasoningEfforts: model.capabilities.reasoningEfforts,
        reasoningDefaultEffort: model.capabilities.reasoningDefaultEffort,
        reasoningMandatory: model.capabilities.reasoningMandatory === true,
      }));
  const [localSelectedModelId, setLocalSelectedModelId] = useState<ModelSelectionId>(controlledSelectedModelId ?? defaultModelId ?? DEFAULT_MODEL_ID);
  const selectedModelId = controlledSelectedModelId ?? localSelectedModelId;
  const [modelRuntimeOptions, setModelRuntimeOptions] = useState<Partial<Record<ModelSelectionId, ComposerModelRuntimeOptions>>>({});
  const userPickedModelRef = useRef(false);
  const selectedModelSpec = modelList.find((spec) => spec.id === selectedModelId);
  const available = isRemoteTarget ? remoteReady : selectedModelSpec !== undefined;
  const runtimeOptions = currentModelRuntimeOptions(selectedModelSpec, modelRuntimeOptions[selectedModelId]);
  const catalog = useModelCatalog(target, sessionId, { models: modelList, defaultModelId, selectedModelId, onSelect: selectLocalModel });
  const pickerOptions: ModelPickerOptions = {
    find: (modelId) => modelList.find((spec) => spec.id === modelId),
    values: modelRuntimeOptions,
    onChange: updateModelRuntimeOptions,
  };

  const configurationKey = JSON.stringify({ model: isRemoteTarget ? catalog.selectedModelId : selectedModelId, thinkingEnabled: runtimeOptions.thinkingEnabled, reasoningEffort: runtimeOptions.reasoningEffort, selectedSkillIds: selectedSkills });
  useEffect(() => {
    if (!sessionId || (isRemoteTarget && !remoteReady)) return;
    void tasksApi.command({ sessionId, op: "configure", configuration: JSON.parse(configurationKey) }).catch(error => console.error("Failed to update execution configuration", error));
  }, [sessionId, configurationKey, isRemoteTarget, remoteReady]);

  // 默认模型可能在 Composer 挂载后才异步到达（settings:get）；只在用户尚未手动
  // 选择过模型时同步，避免覆盖用户当前会话里的临时选择。
  useEffect(() => {
    if (!defaultModelId || controlledSelectedModelId || userPickedModelRef.current) return;
    setLocalSelectedModelId(defaultModelId);
  }, [controlledSelectedModelId, defaultModelId, models]);

  function selectLocalModel(modelId: string) {
    userPickedModelRef.current = true;
    setLocalSelectedModelId(modelId as ModelSelectionId);
    onSelectedModelChange?.(modelId as ModelSelectionId);
  }

  function updateModelRuntimeOptions(
    modelId: ModelSelectionId,
    update: (current: ComposerModelRuntimeOptions) => ComposerModelRuntimeOptions,
  ) {
    const model = modelList.find((candidate) => candidate.id === modelId);
    setModelRuntimeOptions((current) => ({
      ...current,
      [modelId]: update(current[modelId] ?? modelDefaultRuntimeOptions(model)),
    }));
  }

  const remoteSelectedModel = isRemoteTarget
    ? catalog.catalog.groups.flatMap((group) => group.models).find((model) => model.id === catalog.selectedModelId)
    : undefined;
  const displayLabel = isRemoteTarget
    ? remoteSelectedModel?.label ?? (catalog.catalog.groups.length === 0 ? "等待 Host 模型" : catalog.selectedModelId || "选择模型")
    : selectedModelSpec
      ? formatSelectedModelLabel(selectedModelSpec, modelList)
      : modelList.length === 0
        ? "未连接模型"
        : selectedModelId;
  const title = isRemoteTarget
    ? `${target.kind === "remote" ? target.hostName : ""} / ${displayLabel}`
    : selectedModelSpec
      ? `${selectedModelSpec.provider} / ${selectedModelSpec.label} / ${selectedModelSpec.apiModel}`
      : modelList.length === 0
        ? "请先在设置中连接模型服务"
        : selectedModelId;

  return {
    /** 本机选中的模型 id（发送时带上；远端由 Host 侧的选择决定）。 */
    selectedModelId,
    available,
    runtimeOptions,
    catalog: catalog.catalog,
    catalogSelectedModelId: catalog.selectedModelId,
    selectModel: catalog.selectModel,
    /** 远端模型没有运行时选项。 */
    pickerOptions: isRemoteTarget ? undefined : pickerOptions,
    displayLabel,
    title,
  };
}
