/**
 * 把非敏感的工具偏好同步到 process.env（仍有读 env 的兼容路径）。凭据一律不进 env：LLM 与搜索 Key 都由
 * `ModelRuntimeService.getToolEnvironment()` 直接注给 Desktop 的工具端口；子进程 env 见 `@actspace/shared` 的
 * `toolChildEnv` / `hostChildEnv`。拆分时原样搬迁，以后退役。
 */
import type { PersistedSettingsV3 } from "./types";

export function setOrDeleteEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

/** 只同步偏好；历史上写过 env 的凭据键在这里清掉，避免旧进程状态残留。 */
export function applyToEnv(settings: PersistedSettingsV3, reloadEnv: () => void): void {
  for (const key of ["DEEPSEEK_API_KEY", "KIMI_API_KEY", "ZHIPU_API_KEY", "TAVILY_API_KEY", "TINYFISH_API_KEY", "EXA_API_KEY"]) delete process.env[key];
  process.env.IMAGE_GENERATION_BASE_URL = settings.imageGeneration.baseUrl;
  process.env.IMAGE_GENERATION_MODEL = settings.imageGeneration.model;
  process.env.ACTSPACE_DISABLED_TOOLS = settings.agent.disabledTools.join(",");
  process.env.ACTSPACE_BASH_ALWAYS_ASK = settings.agent.bashAlwaysAsk ? "1" : "0";
  setOrDeleteEnv("LLM_TEMPERATURE", settings.agent.temperature === null ? undefined : String(settings.agent.temperature));
  setOrDeleteEnv("LLM_MAX_TOKENS", settings.agent.maxTokens === null ? undefined : String(settings.agent.maxTokens));
  reloadEnv();
}
