/**
 * 应用设置（Settings）共享契约。
 *
 * 设计要点：
 * - `AppSettings` 是 renderer 看到的完整视图；供应商 API Key **永不**进入这里，
 *   renderer 只通过 `providers[id].hasApiKey` 得知"是否已在页面配置"。
 * - 供应商 Key 的唯一来源是用户在页面输入、经 Electron safeStorage 加密后单独落
 *   `secrets.json`；不再读取 .env 里的 Key。非敏感项落 `settings.json`。
 * - UI 偏好（主题等）不在这里，走 renderer localStorage。
 */
import type { ModelId } from "./model-config";

export type ProviderId = "deepseek" | "kimi";

export const SETTINGS_PROVIDER_IDS: readonly ProviderId[] = ["deepseek", "kimi"];

export type KairosThinkingMode = "auto" | "on" | "off";

/** Kairos 设置页只允许默认 Flash 与显式 Pro；null 表示 Kairos 默认 Flash。 */
export type KairosModelId = Extract<ModelId, "deepseek-v4-pro">;

export interface ProviderSettingsView {
  /** 用户已在页面配置该供应商密钥（safeStorage 中存在）；决定卡片"已连接/可断开"。 */
  hasApiKey: boolean;
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
}

export interface AppSettings {
  version: 1;
  /** 默认模型；null = 用内置 DEFAULT_MODEL_ID。决定 Composer 初始选中。 */
  defaultModelId: ModelId | null;
  providers: Record<ProviderId, ProviderSettingsView>;
  agent: AgentSettings;
  kairos: KairosSettings;
}

// ─── IPC 输入 / 输出 ───

export type SettingsUpdateInput = Partial<{
  defaultModelId: ModelId | null;
  agent: Partial<AgentSettings>;
  kairos: Partial<KairosSettings>;
}>;

export type AgentSystemPromptFile = {
  path: string;
  content: string;
};

export type WriteAgentSystemPromptInput = {
  content: string;
};

export type SetProviderKeyInput = {
  provider: ProviderId;
  apiKey: string;
};

export type SetProviderKeyResult = {
  ok: boolean;
  /** 仅在失败时给出（如系统密钥串不可用）；不包含任何明文密钥。 */
  error?: string;
};

export type ClearProviderKeyInput = {
  provider: ProviderId;
};

export type ClearProviderKeyResult = {
  ok: boolean;
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
