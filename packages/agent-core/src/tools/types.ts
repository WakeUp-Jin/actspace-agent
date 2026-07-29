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
  /** Missing means visible to both real providers. */
  exposeOnlyTo?: "deepseek" | "kimi";
  /**
   * 工具依赖的外部 key；缺失时不注册该工具（见 exposure.ts）。
   * - "kimi"：Kimi provider-native or Kimi-backed capability
   * - "webSearch"：任一搜索 provider key（ZHIPU / TAVILY / TINYFISH / EXA_API_KEY）
   */
  requiresKey?: "kimi" | "webSearch" | "imageGeneration";
  /**
   * 渐进式工具披露。executor 仍正常注册，但 deferred 工具只有在同组 gateway
   * 成功执行并进入下一次 LLM 调用后，才会出现在模型 definitions 中。
   */
  progressiveDisclosure?: {
    group: string;
    role: "gateway" | "deferred";
  };
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
  /** Per ToolManager read_file range cache, used to avoid repeating unchanged reads. */
  readFileCache?: Map<string, ReadFileRangeCacheEntry>;
  signal?: AbortSignal;
  imageGeneration?: ImageGenerationRuntimeConfig;
  artifactRoot?: string;
}

export interface ImageGenerationRuntimeConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface ReadFileRangeCacheEntry {
  size: number;
  mtimeMs: number;
}

export interface ToolRuntimeConfig {
  primaryProvider?: "deepseek" | "kimi" | "openrouter" | "duckcoding" | "mock";
  apiFormat?: "openai" | "anthropic";
  hasKimiKey?: boolean;
  /** 是否配置了任一 web_search provider key（智谱 / Tavily / TinyFish / Exa） */
  hasWebSearchKey?: boolean;
  hasImageGenerationKey?: boolean;
  disabledTools?: string[];
  toolProfile?: ToolProfile;
}

export type ToolProfile = "none" | "read-only" | "full";

/** ToolManager 配置 */
export interface ToolManagerConfig extends ToolRuntimeConfig {
  workspaceRoot: string;
  /** Browser Bridge Native Host 暴露的稳定 Unix socket；缺省时不注册 browser_* 工具。 */
  browserBridgeSocketPath?: string;
  /** Extra absolute roots writable by write_file/edit_file in addition to workspaceRoot. */
  additionalWritableRoots?: string[];
  imageGeneration?: ImageGenerationRuntimeConfig;
  /** 当前 session 的图片生成产物根目录。 */
  artifactRoot?: string;
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
  /**
   * 内置 Explore 聚焦子代理用的便宜模型 service（通常是 flash）。
   * 缺省时 explore 工具回落 `llm`（主模型）。两者都缺时不注册 explore。
   */
  exploreLlm?: LLMService;
  /** 当前模型上下文窗口，供 SubAgent ContextManager 使用 */
  contextWindow?: number;
  /** flash 摘要器；缺省时非 bash 工具退化为确定性头尾截断 */
  summarizer?: Summarizer;
}
