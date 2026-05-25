/**
 * 工具模块级类型
 *
 * ToolDefinitionSpec：definition.ts 导出的静态声明
 * ToolExecutorFn：executor.ts 导出的执行函数
 *
 * InternalTool/ToolResult/ToolHandler 等核心类型来自 ../internal-tools.ts（计划 A 产物）
 */

import type { ToolParameterSchema, ToolResult } from "../internal-tools";
import type { ToolPreviewKind } from "@actspace/shared";

/** definition.ts 导出的静态声明——不含任何运行时依赖 */
export interface ToolDefinitionSpec {
  name: string;
  description: string;
  parameters: ToolParameterSchema;
  isReadOnly: boolean;
  category: string;
  previewKind: ToolPreviewKind;
  /** Missing means visible to both real providers. DeepSeek-only tools require a Kimi key. */
  exposeOnlyTo?: "deepseek" | "kimi";
}

/** executor.ts 导出的执行函数签名 */
export type ToolExecutorFn = (
  args: Record<string, unknown>,
  workspaceRoot: string,
) => Promise<ToolResult>;

export interface ToolRuntimeConfig {
  primaryProvider?: "deepseek" | "kimi" | "mock";
  hasKimiKey?: boolean;
}

/** ToolManager 配置 */
export interface ToolManagerConfig extends ToolRuntimeConfig {
  workspaceRoot: string;
  /** 硬截断阈值（字符数），默认 2000 */
  truncateThreshold?: number;
}
