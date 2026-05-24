import type { ToolDefinitionSpec, ToolRuntimeConfig } from "./types";

export function shouldExposeTool(
  spec: ToolDefinitionSpec,
  runtime: ToolRuntimeConfig,
): boolean {
  if (!spec.exposeOnlyTo) return true;
  if (spec.exposeOnlyTo !== runtime.primaryProvider) return false;
  if (spec.exposeOnlyTo === "deepseek") return Boolean(runtime.hasKimiKey);
  return true;
}
