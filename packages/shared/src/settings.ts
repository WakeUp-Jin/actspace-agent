/**
 * 应用设置（Settings）共享契约。
 *
 * 设计要点：
 * - `AppSettings` 是 renderer 看到的完整视图；供应商 API Key **永不**进入这里，
 *   renderer 只通过 `providers[id].hasApiKey` 得知"是否已在页面配置"。
 * - 供应商 Key 的唯一来源是用户在页面输入，并单独落入 main-only、0600 权限的
 *   `secrets.json`；不再读取 .env 里的 Key。非敏感项落 `settings.json`。
 * - UI 偏好（主题等）不在这里，走 renderer localStorage。
 */
import type { ModelDefinition, ModelId, ModelKey } from "./model-config";
import type { ProviderId as LlmProviderId } from "./provider-config";
import type { ImageInspectionModelKey } from "./image-inspection-config";

/** Settings v1 仍只包含两家 LLM provider；Plan 2 迁移后改用完整 ProviderId。 */
export type LegacySettingsProviderId = Extract<LlmProviderId, "deepseek" | "kimi">;
/** @deprecated Plan 2 前保持当前 settings/renderer 的两供应商语义。 */
export type ProviderId = LegacySettingsProviderId;

export const SETTINGS_PROVIDER_IDS: readonly LegacySettingsProviderId[] = ["deepseek", "kimi"];

/** 网络搜索供应商（web_search 工具）。zhipu = 国内通道；其余为国际通道候选。 */
export type SearchProviderId = "zhipu" | "tavily" | "tinyfish" | "exa";

export const SEARCH_PROVIDER_IDS: readonly SearchProviderId[] = [
  "zhipu",
  "tavily",
  "tinyfish",
  "exa",
];

export const DEFAULT_IMAGE_GENERATION_BASE_URL = "https://www.duckcoding.ai/v1";
export const DEFAULT_IMAGE_GENERATION_MODEL = "gpt-image-2";
export type ImageGenerationSecretId = "image-generation";

export interface ImageGenerationSettingsView {
  hasApiKey: boolean;
  baseUrl: string;
  model: string;
}

export interface ImageInspectionSettings {
  modelKey: ImageInspectionModelKey;
  /** 缺省使用 provider 默认 Key；有值时选择该 provider 下已保存的额外 Key。 */
  credentialId?: string;
}

/** 可在设置页保存本地凭据的全部供应商（LLM + 搜索 + 图片生成）。 */
export type SecretProviderId = LlmProviderId | SearchProviderId | ImageGenerationSecretId;

export type KairosThinkingMode = "auto" | "on" | "off";

/**
 * Kairos 设置页允许的显式模型；null 表示 Kairos 默认 Flash。
 * 当前允许显式 DeepSeek V4 Pro 或 Kimi（Kimi 偏贵，建议配合额度护栏）。
 */
export type KairosModelId = Extract<ModelId, "deepseek-v4-pro" | "kimi-k2.6" | "kimi-k2.7-code">;

export interface ProviderSettingsView {
  /** 用户已在页面配置该供应商密钥；决定卡片"已连接/可断开"。 */
  hasApiKey: boolean;
  /** OpenRouter 可选 Management Key，仅用于账户 credits 余额查询。 */
  hasManagementKey?: boolean;
  /** Settings v2：供应商是否允许参与新请求。v1 读取时缺省为 true。 */
  enabled?: boolean;
  /** Settings v2：用户覆盖的 Base URL；null 表示 Provider Registry 默认值。 */
  baseUrl?: string | null;
  /** Settings v2：非敏感、无认证信息的服务商级代理配置。 */
  proxy?: ProviderProxySettings;
  /** Settings v2：最近一次显式连接测试结果。 */
  lastConnection?: ProviderConnectionState;
  installedModelCount?: number;
  enabledModelCount?: number;
  /** 默认 Key 的价格倍率；旧数据和未配置值按 1 处理。 */
  defaultPricingMultiplier?: number;
  /** 额外 Key 的脱敏视图，不包含密钥明文或密文。 */
  additionalCredentials?: ProviderCredentialView[];
}

export type CredentialStorageIssueCode = "read_failed" | "invalid_format" | "migration_failed";

export type CredentialStorageView =
  | { status: "ready" }
  | { status: "unavailable"; code: CredentialStorageIssueCode; message: string };

export type ProviderConnectionStatus = "untested" | "available" | "unavailable";
export type ProviderConnectionErrorKind =
  | "proxy"
  | "network"
  | "timeout"
  | "auth"
  | "rate_limit"
  | "insufficient_balance"
  | "invalid_request"
  | "server";

export interface ProviderProxySettings {
  enabled: boolean;
  url: string | null;
}

export interface ProviderConnectionState {
  status: ProviderConnectionStatus;
  checkedAt?: string;
  errorKind?: ProviderConnectionErrorKind;
  message?: string;
}

export interface ProviderConnectionSettings {
  enabled: boolean;
  baseUrl: string | null;
  proxy: ProviderProxySettings;
  lastConnection: ProviderConnectionState;
  defaultPricingMultiplier: number;
  additionalCredentials: ProviderCredentialSettings[];
}

export interface ProviderCredentialSettings {
  id: string;
  label: string;
  pricingMultiplier: number;
  lastConnection: ProviderConnectionState;
}

export interface ProviderCredentialView extends ProviderCredentialSettings {
  hasApiKey: boolean;
}

export interface InstalledModelSettings {
  enabled: boolean;
  addedAt: string;
  customLabel?: string;
  /** 缺省使用 provider 默认 Key；有值时引用同 provider 下已保存的额外 Key。 */
  credentialId?: string;
}

export interface TaskModelSettings {
  defaultChatModel: ModelKey | null;
  utilityModel: ModelKey | null;
  exploreModel: ModelKey | null;
}

export interface AgentSettings {
  /** 主 Agent 系统提示词文件路径；正文由 main 进程单独读写，不长期存入 settings.json。 */
  systemPromptPath: string;
  /** 主 Agent 采样温度；null = 用各 LLM service 默认。范围 0–2。 */
  temperature: number | null;
  /** 主 Agent 最大输出 token；null = 用默认。 */
  maxTokens: number | null;
  /** 被禁用的工具名列表（由工具开关派生），写入 ACTSPACE_DISABLED_TOOLS。 */
  disabledTools: string[];
  /** 「自动审查」开关 → ACTSPACE_BASH_ALWAYS_ASK：每条 bash 命令执行前都要确认。 */
  bashAlwaysAsk: boolean;
  /**
   * 内置 Explore 聚焦子代理模型。
   *
   * null = 默认 `deepseek-v4-flash`（便宜、快）；显式值覆盖为指定模型。
   * 缺 DeepSeek key 时运行时回落主模型，见 docs/design-docs/collaboration/agent-explore-subagent.md。
   */
  exploreModelId: ModelId | null;
}

export interface KairosSettings {
  /**
   * Kairos 自主模式模型。
   *
   * null = Kairos 默认模型 deepseek-v4-flash；显式值当前只允许 deepseek-v4-pro。
   * 这是设置页与运行时的唯一真来源，持久化在 settings.json。
   */
  modelId: KairosModelId | null;
  /**
   * 思考链覆写。
   */
  thinking: KairosThinkingMode;
  /**
   * Kairos 的 Skill 白名单（按 Skill name）。
   *
   * 与主 Agent 的黑名单语义相反：默认空数组 = Kairos 一个 Skill 都不加载，
   * 只有显式列入的 Skill 才会进 Kairos 的 catalog 段并把 Skill 目录并入 allowedRoots。
   * 变更后 main 会重建 Kairos controller 使其生效。
   */
  enabledSkills: string[];
}

export interface PluginsSettings {
  /**
   * 本机 actspace-plugins 仓库的绝对路径（用户 clone 下来的插件源码仓库）。
   * 设置后插件可以「编译并安装」一键完成 cargo build → 安装 → 启动；null = 未设置，
   * 仍可退回手动选择二进制安装。
   */
  repoRoot: string | null;
  /** fs-watch 文件监听插件（设计文档 agent-plugins-fs-watch.md）。 */
  fsWatch: {
    /** 总开关：开 = app 启动时自动拉起插件进程并守护；关 = 停止进程。 */
    enabled: boolean;
  };
}

export interface SkillsSettings {
  /**
   * 主 Agent 的 Skill 黑名单（按 Skill name）。
   * 默认空数组 = 全部已发现 Skill 进主 Agent catalog；列入即从 catalog 剔除。
   */
  disabled: string[];
}

export const DEFAULT_QUICK_OPEN_ACCELERATOR = "CommandOrControl+Shift+Space";

export type QuickOpenTarget =
  | { kind: "automatic" }
  | { kind: "workspace"; workspaceId: string }
  | { kind: "session"; sessionId: string };

export interface QuickOpenShortcutSettings {
  enabled: boolean;
  accelerator: string;
  target: QuickOpenTarget;
}

export interface ShortcutsSettings {
  quickOpen: QuickOpenShortcutSettings;
}

export interface AppSettingsV1 {
  version: 1;
  /** 默认模型；null = 用内置 DEFAULT_MODEL_ID。决定 Composer 初始选中。 */
  defaultModelId: ModelId | null;
  providers: Record<LegacySettingsProviderId, ProviderSettingsView>;
  /** 网络搜索供应商的密钥状态（web_search 工具）。 */
  searchProviders: Record<SearchProviderId, ProviderSettingsView>;
  agent: AgentSettings;
  kairos: KairosSettings;
  plugins: PluginsSettings;
  skills: SkillsSettings;
}

export type AgentSettingsV2 = Omit<AgentSettings, "exploreModelId">;
export type KairosSettingsV2 = Omit<KairosSettings, "modelId"> & { modelId: ModelKey | null };

export interface AppSettingsV2 {
  version: 2;
  providers: Record<LlmProviderId, ProviderSettingsView>;
  installedModels: Partial<Record<ModelKey, InstalledModelSettings>>;
  customModels: Partial<Record<ModelKey, ModelDefinition>>;
  taskModels: TaskModelSettings;
  /** 网络搜索供应商继续独立于 LLM Provider Registry。 */
  searchProviders: Record<SearchProviderId, ProviderSettingsView>;
  /** OpenAI-compatible 图片生成连接；与 LLM/search provider 布局保持独立。 */
  imageGeneration: ImageGenerationSettingsView;
  /** inspect_image 使用的视觉模型与已有 provider 凭据引用。 */
  imageInspection: ImageInspectionSettings;
  agent: AgentSettingsV2;
  kairos: KairosSettingsV2;
  plugins: PluginsSettings;
  skills: SkillsSettings;
  shortcuts: ShortcutsSettings;
}

/**
 * Settings v2 迁移期 renderer 视图。
 *
 * settings.json 已使用纯 v2 结构；旧字段只为 Plan 4/5 尚未迁移的消费方并行保留，
 * 不再作为持久化事实来源。消费方迁移完成后删除该兼容层并直接使用 AppSettingsV2。
 */
export interface AppSettings extends Omit<AppSettingsV1, "version" | "providers"> {
  /** 生产返回 2；测试/旧 renderer fixture 在 Plan 5 前仍允许 1。 */
  version: 1 | 2;
  providers: Record<LegacySettingsProviderId, ProviderSettingsView> &
    Partial<Record<Exclude<LlmProviderId, LegacySettingsProviderId>, ProviderSettingsView>>;
  installedModels?: Partial<Record<ModelKey, InstalledModelSettings>>;
  customModels?: Partial<Record<ModelKey, ModelDefinition>>;
  taskModels?: TaskModelSettings;
  /** v2 Kairos ModelKey；旧 `kairos.modelId` 仍供当前消费方过渡读取。 */
  kairosModelKey?: ModelKey | null;
  /** 迁移期可选，旧测试 fixture 缺失时 renderer 使用内置默认值。 */
  imageGeneration?: ImageGenerationSettingsView;
  /** 旧测试 fixture 缺失时 renderer 使用内置默认值。 */
  imageInspection?: ImageInspectionSettings;
  /** 旧测试 fixture 缺失时 renderer 使用内置快捷键默认值。 */
  shortcuts?: ShortcutsSettings;
}

// ─── IPC 输入 / 输出 ───

export type SettingsUpdateInput = Partial<{
  defaultModelId: ModelId | null;
  agent: Partial<AgentSettings>;
  kairos: Partial<KairosSettings>;
  plugins: Partial<PluginsSettings>;
  skills: Partial<SkillsSettings>;
  imageInspection: ImageInspectionSettings;
}>;

export type SettingsV2UpdateInput = Partial<{
  providers: Partial<Record<LlmProviderId, Partial<ProviderConnectionSettings>>>;
  installedModels: Partial<Record<ModelKey, Partial<InstalledModelSettings>>>;
  customModels: Partial<Record<ModelKey, ModelDefinition | null>>;
  taskModels: Partial<TaskModelSettings>;
  agent: Partial<AgentSettingsV2>;
  kairos: Partial<KairosSettingsV2>;
  plugins: Partial<PluginsSettings>;
  skills: Partial<SkillsSettings>;
}>;

export type QuickOpenShortcutUpdateInput = Partial<{
  enabled: boolean;
  accelerator: string;
  target: QuickOpenTarget;
}>;

export type QuickOpenShortcutStatus = {
  registered: boolean;
  accelerator: string;
  error?: string;
};

export type QuickOpenShortcutUpdateResult =
  | { ok: true; settings: AppSettings; status: QuickOpenShortcutStatus }
  | { ok: false; settings: AppSettings; status: QuickOpenShortcutStatus; error: string };

export type QuickOpenRequest = {
  requestId: string;
};

export type AgentSystemPromptFile = {
  path: string;
  content: string;
};

export type WriteAgentSystemPromptInput = {
  content: string;
};

export type SetProviderKeyInput = {
  provider: SecretProviderId;
  apiKey: string;
};

export type SetProviderKeyResult = {
  ok: boolean;
  /** 仅在失败时给出（如凭据文件不可写）；不包含任何明文密钥。 */
  error?: string;
};

export type ClearProviderKeyInput = {
  provider: SecretProviderId;
};

export type ClearProviderKeyResult = {
  ok: boolean;
};

export type UpdateImageGenerationSettingsInput = {
  /** 缺省表示保留现有密钥；空白字符串视为无效输入。 */
  apiKey?: string;
  baseUrl: string;
  model: string;
};

export type UpdateImageGenerationSettingsResult = {
  ok: boolean;
  settings?: ImageGenerationSettingsView;
  error?: string;
};

export type TestConnectionInput = {
  provider: ProviderId;
};

export type TestConnectionResult = {
  ok: boolean;
  /** 面向用户的脱敏提示文案，绝不包含明文密钥。 */
  message: string;
  detail?: string;
};

/**
 * 搜索供应商用量查询结果。
 * 目前只有 Tavily 提供公开的用量接口（GET /usage）；TinyFish 搜索免费（限速），
 * 智谱 / Exa 无公开用量 API，UI 侧展示静态计费说明。
 */
export type SearchUsageResult = {
  ok: boolean;
  tavily?: {
    /** 当前计费周期已用 credits（账户级） */
    planUsage: number;
    /** 当前套餐 credits 上限；null = 无限制 */
    planLimit: number | null;
  };
  /** 查询失败时的脱敏提示。 */
  error?: string;
};
