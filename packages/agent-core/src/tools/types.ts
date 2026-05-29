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
import type { ApprovalGate } from "./scheduler";

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
  /**
   * 工具参数 → 路径数组的提取 hook，给 Kairos 路径访问控制用。
   * 主 Agent 调用路径不会读取这个字段；Kairos 调用时 scheduler 会优先使用本 hook，
   * 缺省时退回到 kairos/guard/extract-paths.ts 的中心化兜底。
   * 详见 docs/exec-plans/active/kairos_config_and_tool_guard.md §5/§6。
   */
  extractPaths?: (args: Record<string, unknown>) => string[];
}

/** executor.ts 导出的执行函数签名 */
export type ToolExecutorFn = (
  args: Record<string, unknown>,
  workspaceRoot: string,
) => Promise<ToolResult>;

export interface ToolRuntimeConfig {
  primaryProvider?: "deepseek" | "kimi" | "mock";
  apiFormat?: "openai" | "anthropic";
  hasKimiKey?: boolean;
  disabledTools?: string[];
}

/** ToolManager 配置 */
export interface ToolManagerConfig extends ToolRuntimeConfig {
  workspaceRoot: string;
  /** 硬截断阈值（字符数），默认 2000 */
  truncateThreshold?: number;
  /** 审核网关，提供后 ask 权限会异步等待用户决策 */
  approvalGate?: ApprovalGate;
}
