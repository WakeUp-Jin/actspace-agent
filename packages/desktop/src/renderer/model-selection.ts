import {
  DEFAULT_MODEL_ID,
  normalizeModelKey,
  type AppSettings,
  type ModelSelectionId,
  type UsableModelView,
} from "@actspace/shared";

export function resolvePreferredChatModel(
  settings: Pick<AppSettings, "taskModels" | "defaultModelId">,
  usableModels: UsableModelView[],
): ModelSelectionId {
  const configured = settings.taskModels?.defaultChatModel ?? settings.defaultModelId;
  if (configured) return normalizeModelKey(configured) ?? configured;

  const legacyDefault = normalizeModelKey(DEFAULT_MODEL_ID) ?? DEFAULT_MODEL_ID;
  if (usableModels.some((model) => model.key === legacyDefault)) return legacyDefault;
  return usableModels[0]?.key ?? legacyDefault;
}
