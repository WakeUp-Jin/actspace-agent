/**
 * Agent 配置构建与实例创建
 *
 * 两步分离：
 * 1. buildAgentConfig() — 纯配置对象（前端参数 + 内部读 env + 模型注册表）
 * 2a. createAgentFromConfig() — 同步入口，构造空会话历史的运行时实例（mock / 内存场景）
 * 2b. createAgentForSession() — async 入口，面向 sessionPath 在构造阶段一次性恢复会话历史
 *
 * Main 进程的真实 turn 走 createAgentForSession：
 *   const config = buildAgentConfig({ model, thinkingEnabled }, workspaceRoot);
 *   const deps = await createAgentForSession(config, { sessionPath });
 *
 * 打开本文件就能看到：前端传了什么，env 补了什么，最终 LLM 收到什么。
 */

import type { ModelId, ModelSpec } from "@actspace/shared";
import { resolveModelSpec, MODEL_REGISTRY } from "@actspace/shared";
import type { LLMConfig, LLMService } from "../llm/types";
import { createLLMService } from "../llm/factory";
import type { ToolManagerConfig } from "../tools/types";
import type { ApprovalGate } from "../tools/scheduler";
import { ToolManager } from "../tools/manager";
import { createToolManager } from "../tools/index";
import { ContextManager } from "../context/manager";
import { SystemPromptContext } from "../context/modules/system-prompt";
import type { PromptSegment } from "../context/types";
import { MAIN_AGENT_SYSTEM_PROMPT } from "../prompt/main-agent";
import { createSummarizer, type Summarizer } from "../context/compression/summarizer";
import { env } from "../env";

// ─── 类型定义 ───

/** 前端收集并传递过来的字段 —— 只有这些是前端负责的 */
export interface FrontendTurnInput {
  model?: ModelId;
  thinkingEnabled?: boolean;
  /** 内置 Explore 聚焦子代理模型；null/缺省 = deepseek-v4-flash。来自 settings.agent.exploreModelId。 */
  exploreModelId?: ModelId | null;
}

/** 从 env / 配置文件读取的后端环境配置 */
export interface AgentEnvConfig {
  deepseekApiKey: string;
  deepseekApiFormat: "openai" | "anthropic";
  deepseekBaseUrl?: string;
  deepseekAnthropicBaseUrl?: string;
  kimiApiKey: string;
  kimiBaseUrl?: string;
  /** 是否配置了任一 web_search provider key（智谱 / Tavily / TinyFish / Exa） */
  hasWebSearchKey: boolean;
  /** 仅当 .env 显式覆盖默认值时有值 */
  temperature?: number;
  /** 仅当 .env 显式覆盖默认值时有值 */
  maxTokens?: number;
  disabledTools: string[];
}

/** 纯配置对象 — 不含任何运行时实例 */
export interface AgentConfig {
  llmConfig: LLMConfig;
  toolManagerConfig: ToolManagerConfig;
  thinkingEnabled: boolean;
  modelSpec: ModelSpec;
  /** 主 Agent 当前使用的完整系统提示词。 */
  systemPrompt: string;
  /** 附加规则/技能等系统级上下文段。 */
  systemPromptSegments?: AgentSystemPromptSegment[];
  /** 内置 Explore 聚焦子代理模型；null/缺省 = deepseek-v4-flash。 */
  exploreModelId?: ModelId | null;
}

export type AgentSystemPromptSegment = Omit<PromptSegment, "enabled" | "stability"> & {
  enabled?: boolean;
  stability?: number;
};

/** 运行时实例集合 */
export interface AgentDeps {
  llm: LLMService;
  toolManager: ToolManager;
  contextManager: ContextManager;
  thinkingEnabled: boolean;
  modelSpec: ModelSpec;
  /** flash 摘要器；无 DeepSeek key 时为 undefined（工具/历史侧走确定性兜底） */
  summarizer?: Summarizer;
}

/** buildAgentConfig 的运行环境补充字段（落盘目录与会话 id） */
export interface AgentRuntimeContext {
  /** bash 大输出落盘根目录（通常是 <userData>/tmp） */
  tmpRoot?: string;
  /** 当前会话 id，用于 bash 落盘文件分目录与历史压缩 ref */
  sessionId?: string;
  /** write_file/edit_file 除 workspaceRoot 外可写入的绝对目录。 */
  additionalWritableRoots?: string[];
  /** 当前主 Agent turn id，用于 SubAgent transcript 关联 */
  turnId?: string;
  /** 主 Agent 当前使用的完整系统提示词；不传则使用代码默认值。 */
  systemPrompt?: string;
  /** 附加规则/技能等系统级上下文段，例如 AGENTS.md。 */
  systemPromptSegments?: AgentSystemPromptSegment[];
}

// ─── 内部：env 读取 ───

/**
 * 从 env proxy 读取所有后端环境配置。
 *
 * temperature / maxTokens 仅在用户显式配置了非默认值时传递，
 * 否则由各 LLM Service 和 API 端使用自身默认值。
 */
export function resolveAgentEnvConfig(): AgentEnvConfig {
  return {
    deepseekApiKey: env.DEEPSEEK_API_KEY,
    deepseekApiFormat: env.DEEPSEEK_API_FORMAT,
    deepseekBaseUrl: env.DEEPSEEK_BASE_URL || undefined,
    deepseekAnthropicBaseUrl: env.DEEPSEEK_ANTHROPIC_BASE_URL || undefined,
    kimiApiKey: env.KIMI_API_KEY,
    kimiBaseUrl: env.KIMI_BASE_URL || undefined,
    hasWebSearchKey: Boolean(
      env.ZHIPU_API_KEY || env.TAVILY_API_KEY || env.TINYFISH_API_KEY || env.EXA_API_KEY,
    ),
    temperature: env.LLM_TEMPERATURE !== 0 ? env.LLM_TEMPERATURE : undefined,
    maxTokens: env.LLM_MAX_TOKENS !== 8192 ? env.LLM_MAX_TOKENS : undefined,
    disabledTools: env.ACTSPACE_DISABLED_TOOLS,
  };
}

// ─── 内部：LLMConfig 构造 ───

/**
 * 纯函数：从 ModelSpec + AgentEnvConfig 构造 LLMConfig。
 *
 * - provider / model 来自 ModelSpec（由前端选择的 ModelId 解析而来）
 * - apiKey / baseUrl 来自 AgentEnvConfig（从 .env 读取）
 * - temperature / maxTokens 来自 AgentEnvConfig（仅在显式覆盖时传递）
 */
export function buildLLMConfig(spec: ModelSpec, envConfig: AgentEnvConfig): LLMConfig {
  const api = spec.provider === "deepseek"
    ? envConfig.deepseekApiFormat === "anthropic"
      ? "anthropic-messages"
      : "openai-completions"
    : spec.api;
  const apiKeyMap: Record<string, string> = {
    deepseek: envConfig.deepseekApiKey,
    kimi: envConfig.kimiApiKey,
  };
  const baseUrlMap: Record<string, string | undefined> = {
    deepseek: envConfig.deepseekApiFormat === "anthropic"
      ? envConfig.deepseekAnthropicBaseUrl
      : envConfig.deepseekBaseUrl,
    kimi: envConfig.kimiBaseUrl,
  };

  return {
    api,
    provider: spec.provider,
    ...(spec.provider === "deepseek" && { apiFormat: envConfig.deepseekApiFormat }),
    apiKey: apiKeyMap[spec.provider] ?? "",
    baseUrl: baseUrlMap[spec.provider] || undefined,
    model: spec.apiModel,
    input: spec.input,
    ...(envConfig.temperature !== undefined && { temperature: envConfig.temperature }),
    ...(envConfig.maxTokens !== undefined && { maxTokens: envConfig.maxTokens }),
  };
}

// ─── 公开 API ───

/**
 * 第一步：构建 Agent 配置。
 *
 * 调用方只传前端收集的参数 + workspaceRoot，env 读取在内部完成。
 */
export function buildAgentConfig(
  frontendInput: FrontendTurnInput,
  workspaceRoot: string,
  approvalGate?: ApprovalGate,
  runtimeContext?: AgentRuntimeContext,
): AgentConfig {
  const envConfig = resolveAgentEnvConfig();
  const modelSpec = resolveModelSpec(frontendInput.model);
  const thinkingEnabled = frontendInput.thinkingEnabled ?? modelSpec.thinkingDefault;
  const llmConfig = buildLLMConfig(modelSpec, envConfig);
  const toolManagerConfig: ToolManagerConfig = {
    workspaceRoot,
    primaryProvider: modelSpec.provider,
    apiFormat: llmConfig.apiFormat,
    hasKimiKey: Boolean(envConfig.kimiApiKey),
    hasWebSearchKey: envConfig.hasWebSearchKey,
    disabledTools: envConfig.disabledTools,
    approvalGate,
    tmpRoot: runtimeContext?.tmpRoot,
    sessionId: runtimeContext?.sessionId,
    additionalWritableRoots: runtimeContext?.additionalWritableRoots,
    turnId: runtimeContext?.turnId,
  };
  return {
    llmConfig,
    toolManagerConfig,
    thinkingEnabled,
    modelSpec,
    systemPrompt: runtimeContext?.systemPrompt ?? MAIN_AGENT_SYSTEM_PROMPT,
    systemPromptSegments: runtimeContext?.systemPromptSegments ?? [],
    exploreModelId: frontendInput.exploreModelId ?? null,
  };
}

/**
 * 构造 flash `summarizer`（deepseek-v4-flash）。
 *
 * 复用 buildLLMConfig + createLLMService，仅在存在 DeepSeek key 时构造；
 * 否则返回 undefined，调用方退化为确定性截断/丢弃，见 context-compression.md。
 */
export function createSummarizerForAgent(
  envConfig: AgentEnvConfig = resolveAgentEnvConfig(),
): Summarizer | undefined {
  if (!envConfig.deepseekApiKey) return undefined;
  const flashSpec = MODEL_REGISTRY["deepseek-v4-flash"];
  const flashLLMConfig = buildLLMConfig(flashSpec, envConfig);
  return createSummarizer(createLLMService(flashLLMConfig));
}

/**
 * 构造内置 Explore 聚焦子代理用的便宜模型 service。
 *
 * 默认 `deepseek-v4-flash`，可由 `exploreModelId` 覆盖。复用 buildLLMConfig + createLLMService。
 * 缺对应供应商 key 时返回 undefined，调用方（createToolManager）回落主模型，保证功能不因缺 key 失效。
 */
export function createExploreLLMService(
  exploreModelId?: ModelId | null,
  envConfig: AgentEnvConfig = resolveAgentEnvConfig(),
): LLMService | undefined {
  const spec = MODEL_REGISTRY[exploreModelId ?? "deepseek-v4-flash"] ?? MODEL_REGISTRY["deepseek-v4-flash"];
  const hasKey = spec.provider === "kimi" ? Boolean(envConfig.kimiApiKey) : Boolean(envConfig.deepseekApiKey);
  if (!hasKey) return undefined;
  return createLLMService(buildLLMConfig(spec, envConfig));
}

/**
 * 构造会话标题生成用的便宜模型 service（固定 deepseek-v4-flash）。
 *
 * 与 summarizer 同源（buildLLMConfig + createLLMService），仅在存在 DeepSeek key 时构造；
 * 否则返回 undefined，调用方跳过自动标题、保留 "New chat"。
 */
export function createTitlerLLMService(
  envConfig: AgentEnvConfig = resolveAgentEnvConfig(),
): LLMService | undefined {
  if (!envConfig.deepseekApiKey) return undefined;
  return createLLMService(buildLLMConfig(MODEL_REGISTRY["deepseek-v4-flash"], envConfig));
}

/**
 * 第二步（同步入口）：根据配置创建运行时实例，会话历史为空。
 *
 * 主要供 mock / 单元测试 / 纯内存场景使用。Main 进程的真实 turn 应走
 * `createAgentForSession`，让 ConversationContext 在构造阶段一次性吃完 session 历史。
 */
export function createAgentFromConfig(config: AgentConfig): AgentDeps {
  const llm = createLLMService(config.llmConfig);
  const summarizer = createSummarizerForAgent();
  const exploreLlm = createExploreLLMService(config.exploreModelId);
  const toolManager = createToolManager({
    ...config.toolManagerConfig,
    llm,
    exploreLlm,
    contextWindow: config.modelSpec.contextWindow,
    summarizer,
  });
  const systemPromptModule = new SystemPromptContext(config.systemPrompt);
  registerSystemPromptSegments(systemPromptModule, config.systemPromptSegments);
  const contextManager = new ContextManager({
    systemPromptModule,
    config: { contextWindow: config.modelSpec.contextWindow },
  });
  return {
    llm,
    toolManager,
    contextManager,
    thinkingEnabled: config.thinkingEnabled,
    modelSpec: config.modelSpec,
    summarizer,
  };
}

/**
 * 第二步（async 入口）：面向某个 session 构造运行时实例。
 *
 * 会话历史在 `ContextManager.createForSession` 内部一次性从 `session.jsonl` 恢复，
 * 与 SystemPromptContext 在构造时吃 corePrompt 的机制对齐——上下文模块统一是
 * "构造时吃数据、运行期只读内存"，所以 `contextManager.getContext()` 仍同步可用。
 *
 * 调用方只需透传 sessionPath，不感知"读盘 + 转换 + 灌 message"细节。
 */
export async function createAgentForSession(
  config: AgentConfig,
  options: { sessionPath?: string } = {},
): Promise<AgentDeps> {
  const llm = createLLMService(config.llmConfig);
  const summarizer = createSummarizerForAgent();
  const exploreLlm = createExploreLLMService(config.exploreModelId);
  const toolManager = createToolManager({
    ...config.toolManagerConfig,
    llm,
    exploreLlm,
    contextWindow: config.modelSpec.contextWindow,
    summarizer,
  });
  const systemPromptModule = new SystemPromptContext(config.systemPrompt);
  registerSystemPromptSegments(systemPromptModule, config.systemPromptSegments);
  const contextManager = await ContextManager.createForSession({
    systemPromptModule,
    sessionPath: options.sessionPath,
    config: { contextWindow: config.modelSpec.contextWindow },
  });
  return {
    llm,
    toolManager,
    contextManager,
    thinkingEnabled: config.thinkingEnabled,
    modelSpec: config.modelSpec,
    summarizer,
  };
}

function registerSystemPromptSegments(
  systemPromptModule: SystemPromptContext,
  segments: AgentSystemPromptSegment[] | undefined,
): void {
  for (const segment of segments ?? []) {
    systemPromptModule.registerSegment(segment);
  }
}
