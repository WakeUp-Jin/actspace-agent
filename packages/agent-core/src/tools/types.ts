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
import type { Summarizer } from "../context/compression/summarizer";
import type { LLMService } from "../llm/types";

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
  runtime?: ToolExecutorRuntime,
) => Promise<ToolResult>;

export interface ToolExecutorRuntime {
  /** Extra absolute roots writable by file tools in addition to workspaceRoot. */
  additionalWritableRoots?: string[];
}

export interface ToolRuntimeConfig {
  primaryProvider?: "deepseek" | "kimi" | "mock";
  apiFormat?: "openai" | "anthropic";
  hasKimiKey?: boolean;
  disabledTools?: string[];
}

/** ToolManager 配置 */
export interface ToolManagerConfig extends ToolRuntimeConfig {
  workspaceRoot: string;
  /** Extra absolute roots writable by write_file/edit_file in addition to workspaceRoot. */
  additionalWritableRoots?: string[];
  /** 硬截断阈值（字符数），默认 2000。通用工具（web/generic）的 flash 摘要触发阈值。 */
  truncateThreshold?: number;
  /** 读取类工具（read/grep/glob/directory_list）的摘要触发阈值，默认 20000 */
  readTruncateThreshold?: number;
  /** 非 bash 工具送 flash 前的头尾截断上限（字符数），默认 100000 */
  absoluteMaxChars?: number;
  /** bash 落盘/头部阈值（字符数），默认 4000 */
  bashInlineThreshold?: number;
  /** bash 流式写盘硬上限（字节），默认 5MB */
  bashDiskCap?: number;
  /** 审核网关，提供后 ask 权限会异步等待用户决策 */
  approvalGate?: ApprovalGate;
  /** bash 大输出落盘根目录（通常是 <userData>/tmp）。缺省时 bash 不落盘、仅头部截断。 */
  tmpRoot?: string;
  /** 当前会话 id，用于 bash 落盘文件分目录 */
  sessionId?: string;
  /** 当前主 Agent turn id，用于 SubAgent transcript 关联 */
  turnId?: string;
  /** 主 Agent LLM service；存在时注册 Agent 工具供 SubAgent run 复用同一模型配置 */
  llm?: LLMService;
  /** 当前模型上下文窗口，供 SubAgent ContextManager 使用 */
  contextWindow?: number;
  /** flash 摘要器；缺省时非 bash 工具退化为确定性头尾截断 */
  summarizer?: Summarizer;
}
