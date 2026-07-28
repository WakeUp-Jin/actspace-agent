import type { ToolDefinitionSpec, ToolRuntimeConfig } from "./types";

export function shouldExposeTool(
  spec: ToolDefinitionSpec,
  runtime: ToolRuntimeConfig,
): boolean {
  if (spec.exposeOnlyTo && spec.exposeOnlyTo !== runtime.primaryProvider) return false;
  // 依赖外部 key 的工具缺 key 就不暴露，避免模型反复调用注定失败的工具。
  // executor 内仍保留缺 key 兜底错误（防御手动构造 ToolManager 时漏传门控）。
  if (spec.requiresKey === "kimi" && !runtime.hasKimiKey) return false;
  if (spec.requiresKey === "webSearch" && !runtime.hasWebSearchKey) return false;
  if (spec.requiresKey === "imageGeneration" && !runtime.hasImageGenerationKey) return false;
  return true;
}
