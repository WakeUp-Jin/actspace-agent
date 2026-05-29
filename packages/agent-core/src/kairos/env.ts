/**
 * Kairos 后台 Agent 的 env 解析。
 *
 * 把"KAIROS_MODEL_ID（字符串）+ KAIROS_THINKING（auto/true/false）"
 * 这两条 raw env 翻译成"ModelSpec + thinkingEnabled"——
 * 调用方（main/kairos-bootstrap）只关心结构化结果。
 *
 * 设计原则：
 * - 输入永远不抛错：留空 / 非法 modelId 都回落到 Kairos 自己的默认模型。
 * - 模型不支持 thinking toggle 时强制忽略 KAIROS_THINKING，避免把"明确禁用"
 *   传给不支持 thinking 参数的模型。
 */
import { env } from "../env";
import { MODEL_REGISTRY, resolveModelSpec, type ModelId, type ModelSpec } from "@actspace/shared";

export const DEFAULT_KAIROS_MODEL_ID: ModelId = "deepseek-v4-flash";

export interface KairosEnvConfig {
  modelSpec: ModelSpec;
  /**
   * - `undefined` → 让 LLM 用 ModelSpec.thinkingDefault；
   * - `true` / `false` → 显式覆盖，仅在 ModelSpec.supportsThinkingToggle 为 true 时生效。
   */
  thinkingEnabled?: boolean;
}

function asModelId(value: string): ModelId | undefined {
  if (!value) return undefined;
  return value in MODEL_REGISTRY ? (value as ModelId) : undefined;
}

export function resolveKairosEnv(): KairosEnvConfig {
  const modelSpec = resolveModelSpec(asModelId(env.KAIROS_MODEL_ID) ?? DEFAULT_KAIROS_MODEL_ID);

  let thinkingEnabled: boolean | undefined;
  switch (env.KAIROS_THINKING) {
    case "true":
      thinkingEnabled = true;
      break;
    case "false":
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
