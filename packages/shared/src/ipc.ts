export type BootstrapState = {
  appVersion: string;
  dataRoot: string;
  sessionRoot: string;
  logRoot: string;
  tmpRoot: string;
  workspaceRoot: string;
};

// ─── 模型注册表 ───

export type ModelId = "deepseek-v4-flash" | "deepseek-v4-pro" | "kimi-k2.6";

export interface ModelSpec {
  id: ModelId;
  label: string;
  provider: "deepseek" | "kimi";
  apiModel: string;
  thinkingDefault: boolean;
  supportsThinkingToggle: boolean;
}

export const MODEL_REGISTRY: Record<ModelId, ModelSpec> = {
  "deepseek-v4-flash": {
    id: "deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
    provider: "deepseek",
    apiModel: "deepseek-v4-flash",
    thinkingDefault: false,
    supportsThinkingToggle: false,
  },
  "deepseek-v4-pro": {
    id: "deepseek-v4-pro",
    label: "DeepSeek V4 Pro",
    provider: "deepseek",
    apiModel: "deepseek-v4-pro",
    thinkingDefault: true,
    supportsThinkingToggle: true,
  },
  "kimi-k2.6": {
    id: "kimi-k2.6",
    label: "Kimi K2.6",
    provider: "kimi",
    apiModel: "kimi-k2.6",
    thinkingDefault: false,
    supportsThinkingToggle: true,
  },
};

export const MODEL_LIST: ModelSpec[] = Object.values(MODEL_REGISTRY);

export const DEFAULT_MODEL_ID: ModelId = "deepseek-v4-flash";

export function resolveModelSpec(modelId?: ModelId): ModelSpec {
  if (modelId && modelId in MODEL_REGISTRY) return MODEL_REGISTRY[modelId];
  return MODEL_REGISTRY[DEFAULT_MODEL_ID];
}

// ─── IPC 输入类型 ───

export type RunTurnInput = {
  sessionId: string;
  turnId: string;
  userInput: string;
  model?: ModelId;
  thinkingEnabled?: boolean;
};

export type SessionListItem = {
  id: string;
  title: string;
  updatedAt: string;
  turnCount: number;
};

export type SessionRecord = {
  meta: import("./session").SessionMeta;
  events: import("./session").SessionEvent[];
  messageBlocks?: import("./session").MessageBlock[];
  contextSnapshot?: import("./session").ContextUsageSnapshot | null;
  diffSummary?: import("./session").SessionDiffSummary;
};

export type SessionGetInput = {
  sessionId: string;
};

export type SessionCreateInput = {
  title?: string;
};

export type AppBootstrapStateInput = {
  appVersion: string;
  dataRoot: string;
  sessionRoot?: string;
  logRoot?: string;
  tmpRoot?: string;
  workspaceRoot?: string;
};

export function createBootstrapState(input: AppBootstrapStateInput): BootstrapState {
  return {
    appVersion: input.appVersion,
    dataRoot: input.dataRoot,
    sessionRoot: input.sessionRoot ?? `${input.dataRoot}/sessions`,
    logRoot: input.logRoot ?? `${input.dataRoot}/logs`,
    tmpRoot: input.tmpRoot ?? `${input.dataRoot}/tmp`,
    workspaceRoot: input.workspaceRoot ?? input.dataRoot
  };
}
