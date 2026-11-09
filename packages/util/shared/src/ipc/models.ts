// 模型管理 IPC（`models.*`）：已安装模型视图与「某用途下可用的模型」列表。
// 模型目录本身（`ModelDefinition`、`MODEL_REGISTRY` 等）在 `../model-config`，由根入口直接导出。

import type { ModelDefinition, ModelKey } from "../model-config";
import type { ModelPurpose, ModelUnavailabilityReason } from "../model-resolver";
import type { ProviderId } from "../provider-config";
import type { InstalledModelSettings } from "../settings";

export type InstalledModelView = {
  definition: ModelDefinition;
  settings: InstalledModelSettings;
  unavailableReasons: Partial<Record<ModelPurpose, ModelUnavailabilityReason>>;
};

export type ModelsListUsableInput = { purpose: ModelPurpose };

export type UsableModelView = {
  key: ModelKey;
  label: string;
  provider: ProviderId;
  apiModel: string;
  connectionId?: string;
  connectionLabel?: string;
  contextWindow: number | null;
  thinkingDefault: boolean;
  capabilities: ModelDefinition["capabilities"];
  pricing?: ModelDefinition["pricing"];
};

export type ModelsListUsableResult = { models: UsableModelView[] };
