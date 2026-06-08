/**
 * Kairos 后台 Agent 的模型 / 思考链解析。
 *
 * 模型与思考链来源是桌面端 `settings.json` 的 `kairos` 分区（由调用方读出后作为入参传入）。
 * 不再读取 `KAIROS_MODEL_ID` / `KAIROS_THINKING` env。两者一起翻译成
 * "ModelSpec + thinkingEnabled"，调用方（main/kairos-bootstrap）只关心结构化结果。
 *
 * 设计原则：
 * - 输入永远不抛错：留空 / 非法 modelId 都回落到 Kairos 自己的默认模型。
 * - Kairos 当前允许默认 Flash、显式 Pro 或显式 Kimi K2.6；其它字符串回落默认。
 * - 模型不支持 thinking toggle 时强制忽略 settings.kairos.thinking，避免把"明确禁用"
 *   传给不支持 thinking 参数的模型。
 */
import {
  resolveModelSpec,
  type KairosModelId,
  type KairosThinkingMode,
  type ModelId,
  type ModelSpec,
} from "@actspace/shared";

export const DEFAULT_KAIROS_MODEL_ID: ModelId = "deepseek-v4-flash";

export interface KairosEnvConfig {
  modelSpec: ModelSpec;
  /**
   * - `undefined` → 让 LLM 用 ModelSpec.thinkingDefault；
   * - `true` / `false` → 显式覆盖，仅在 ModelSpec.supportsThinkingToggle 为 true 时生效。
   */
  thinkingEnabled?: boolean;
}

function asKairosModelId(value: string | null | undefined): KairosModelId | undefined {
  if (value === "deepseek-v4-pro" || value === "kimi-k2.6") return value;
  return undefined;
}

/**
 * 把 `settings.kairos.modelId`（可能为 null / 非法字符串）解析为有效 ModelSpec。
 * 非法 / 留空一律回落 `DEFAULT_KAIROS_MODEL_ID`，永不抛错。
 */
export function resolveKairosModelSpec(modelId: string | null): ModelSpec {
  return resolveModelSpec(asKairosModelId(modelId) ?? DEFAULT_KAIROS_MODEL_ID);
}

/**
 * @param modelId 来自 `settings.json` 的 `kairos.modelId`（string | null）。
 * @param thinking 来自 `settings.json` 的 `kairos.thinking`。
 */
export function resolveKairosEnv(
  modelId: string | null,
  thinking: KairosThinkingMode = "auto",
): KairosEnvConfig {
  const modelSpec = resolveKairosModelSpec(modelId);

  let thinkingEnabled: boolean | undefined;
  switch (thinking) {
    case "on":
      thinkingEnabled = true;
      break;
    case "off":
      thinkingEnabled = false;
      break;
    case "auto":
      thinkingEnabled = undefined;
      break;
  }

  if (thinkingEnabled !== undefined && !modelSpec.supportsThinkingToggle) {
    // 模型不支持 thinking 切换：把覆写撤回，避免把"明确禁用"传给 provider。
    thinkingEnabled = undefined;
  }

  return { modelSpec, thinkingEnabled };
}
