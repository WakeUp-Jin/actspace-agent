/**
 * Agent 配置构建与实例创建
 *
 * 两步分离：
 * 1. buildAgentConfig() — 纯配置对象（前端参数 + 内部读 env + 模型注册表）
 * 2a. createAgentFromConfig() — 同步入口，构造空会话历史的运行时实例（mock / 内存场景）
 * 2b. createAgentForSession() — async 入口，面向 sessionPath 在构造阶段一次性恢复会话历史
 *
 * Main 进程的真实 Agent Run 走 createAgentForSession：
 *   const config = buildAgentConfig({ model, thinkingEnabled }, workspaceRoot);
 *   const deps = await createAgentForSession(config, { sessionPath });
 *
 * 打开本文件就能看到：前端传了什么，env 补了什么，最终 LLM 收到什么。
 */

import { createHash } from "node:crypto";
import type { ModelDefinition, ModelId, ModelKey, ModelReasoningEffort, ModelSpec } from "@actspace/shared";
import { normalizeModelKey, resolveModelDefinition, resolveModelSpec, MODEL_REGISTRY, PROVIDER_REGISTRY } from "@actspace/shared";
import type {
  LLMConfig,
  LLMService,
  ProviderRuntimeConfig,
  RuntimeInferenceSettings,
} from "../llm/types";
import { LLMServiceError } from "../llm/types";
import { createLLMService } from "../llm/factory";
import { providerDefaultHeaders } from "../llm/provider-adapter";
import type { ImageInspectionRuntimeConfig, ToolManagerConfig } from "../tools/types";
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
export interface FrontendAgentRunInput {
  model?: ModelId;
  modelKey?: ModelKey;
  thinkingEnabled?: boolean;
  reasoningEffort?: ModelReasoningEffort;
  /** 内置 Explore 聚焦子代理模型；null/缺省 = deepseek-v4-flash。来自 settings.agent.exploreModelId。 */
  exploreModelId?: ModelId | null;
}

/** 从 env / 配置文件读取的后端环境配置 */
export interface AgentEnvConfig {
  deepseekApiKey: string;
  deepseekBaseUrl?: string;
  kimiApiKey: string;
  kimiBaseUrl?: string;
  /** 是否配置了任一 web_search provider key（智谱 / Tavily / TinyFish / Exa） */
  hasWebSearchKey: boolean;
  imageGeneration?: { apiKey: string; baseUrl: string; model: string };
  /** 仅当 .env 显式覆盖默认值时有值 */
  temperature?: number;
  /** 仅当 .env 显式覆盖默认值时有值 */
  maxTokens?: number;
  disabledTools: string[];
}

/** 纯配置对象 — 不含任何运行时实例 */
export interface AgentConfig {
  llmConfig: LLMConfig;
  /** Desktop runtime always supplies these fields; optional keeps legacy in-memory callers compatible. */
  modelDefinition?: ModelDefinition;
  modelKey?: ModelKey;
  utilityLlmConfig?: LLMConfig;
  utilityModelKey?: ModelKey;
  exploreLlmConfig?: LLMConfig;
  exploreModelKey?: ModelKey;
  imageInspectionLlmConfig?: LLMConfig;
  imageInspectionToolConfig?: Omit<ImageInspectionRuntimeConfig, "llm">;
  toolManagerConfig: ToolManagerConfig;
  thinkingEnabled: boolean;
  reasoningEffort?: ModelReasoningEffort;
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
  utilityLlm?: LLMService;
  toolManager: ToolManager;
  contextManager: ContextManager;
  thinkingEnabled: boolean;
  reasoningEffort?: ModelReasoningEffort;
  modelSpec: ModelSpec;
  modelDefinition: ModelDefinition;
  modelKey: ModelKey;
  utilityModelKey?: ModelKey;
  exploreModelKey?: ModelKey;
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
  agentRunId?: string;
  /** Browser Bridge Native Host 的稳定 Unix socket。 */
  browserBridgeSocketPath?: string;
  /** 当前 session 的图片生成产物目录。 */
  artifactRoot?: string;
  /** 当前 session 的全部工具产物根目录，供 inspect_image 读取已注册产物。 */
  sessionArtifactRoot?: string;
  /** 当前轮用户显式附加的图片绝对路径。 */
  imageInspectionAllowedPaths?: string[];
  /** 主 Agent 当前使用的完整系统提示词；不传则使用代码默认值。 */
  systemPrompt?: string;
  /** 附加规则/技能等系统级上下文段，例如 AGENTS.md。 */
  systemPromptSegments?: AgentSystemPromptSegment[];
  /** Composer mode applies a hard tool-registration profile for this turn. */
  toolProfile?: import("../tools/types").ToolProfile;
}

export interface ExplicitAgentRuntimeInput {
  main: { definition: ModelDefinition; runtime: ProviderRuntimeConfig };
  utility?: { definition: ModelDefinition; runtime: ProviderRuntimeConfig };
  explore?: { definition: ModelDefinition; runtime: ProviderRuntimeConfig };
  imageInspection?: { definition: ModelDefinition; runtime: ProviderRuntimeConfig };
  thinkingEnabled?: boolean;
  reasoningEffort?: ModelReasoningEffort;
  inferenceSettings?: RuntimeInferenceSettings;
  toolEnvironment?: {
    hasWebSearchKey: boolean;
    disabledTools: string[];
    hasKimiKey: boolean;
    imageGeneration?: { apiKey: string; baseUrl: string; model: string };
  };
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
    deepseekBaseUrl: env.DEEPSEEK_BASE_URL || undefined,
    kimiApiKey: env.KIMI_API_KEY,
    kimiBaseUrl: env.KIMI_BASE_URL || undefined,
    hasWebSearchKey: Boolean(
      env.ZHIPU_API_KEY || env.TAVILY_API_KEY || env.TINYFISH_API_KEY || env.EXA_API_KEY,
    ),
    ...(env.IMAGE_GENERATION_API_KEY && {
      imageGeneration: {
        apiKey: env.IMAGE_GENERATION_API_KEY,
        baseUrl: env.IMAGE_GENERATION_BASE_URL,
        model: env.IMAGE_GENERATION_MODEL,
      },
    }),
    temperature: env.LLM_TEMPERATURE !== 0 ? env.LLM_TEMPERATURE : undefined,
    maxTokens: env.LLM_MAX_TOKENS !== 8192 ? env.LLM_MAX_TOKENS : undefined,
    disabledTools: env.ACTSPACE_DISABLED_TOOLS,
  };
}

// ─── 内部：LLMConfig 构造 ───

function normalizeRuntimeBaseUrl(baseUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new LLMServiceError("Provider base URL is invalid.", "invalid_request", false);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new LLMServiceError("Provider base URL must use HTTP or HTTPS.", "invalid_request", false);
  }
  if (parsed.username || parsed.password) {
    throw new LLMServiceError("Provider base URL must not contain credentials.", "invalid_request", false);
  }
  return parsed.toString().replace(/\/$/, "");
}

function buildLLMConfigFromRuntimeInternal(
  model: ModelDefinition,
  providerRuntime: ProviderRuntimeConfig,
  inferenceSettings: RuntimeInferenceSettings = {},
  options: { allowMissingApiKey: boolean; useModelMaxTokens: boolean },
): LLMConfig {
  if (!(providerRuntime.provider in PROVIDER_REGISTRY)) {
    throw new LLMServiceError("Provider is not registered.", "invalid_request", false);
  }
  if (model.provider !== providerRuntime.provider) {
    throw new LLMServiceError("Model and provider runtime do not match.", "invalid_request", false);
  }
  const providerSpec = PROVIDER_REGISTRY[providerRuntime.provider];
  if (!providerSpec.supportedApis.includes(model.api)) {
    throw new LLMServiceError("Provider does not support the model API protocol.", "invalid_request", false);
  }
  if (!options.allowMissingApiKey && !providerRuntime.apiKey.trim()) {
    throw new LLMServiceError("Provider API key is not configured.", "auth", false);
  }

  const baseUrl = normalizeRuntimeBaseUrl(providerRuntime.baseUrl);
  return {
    provider: providerRuntime.provider,
    api: model.api,
    ...(providerRuntime.provider === "deepseek" && {
      apiFormat: "openai" as const,
    }),
    apiKey: providerRuntime.apiKey,
    baseUrl,
    model: model.apiModel,
    input: [...model.capabilities.input],
    ...(inferenceSettings.temperature !== undefined && { temperature: inferenceSettings.temperature }),
    ...(inferenceSettings.maxTokens !== undefined
      ? { maxTokens: inferenceSettings.maxTokens }
      : options.useModelMaxTokens && model.maxTokens !== null
        ? { maxTokens: model.maxTokens }
        : {}),
    ...(providerRuntime.transport && { transport: { ...providerRuntime.transport } }),
    defaultHeaders: providerDefaultHeaders(providerRuntime.provider),
  };
}

/** Build a service config from an explicit provider runtime. New desktop paths use this API. */
export function buildLLMConfigFromRuntime(
  model: ModelDefinition,
  providerRuntime: ProviderRuntimeConfig,
  inferenceSettings: RuntimeInferenceSettings = {},
): LLMConfig {
  return buildLLMConfigFromRuntimeInternal(model, providerRuntime, inferenceSettings, {
    allowMissingApiKey: false,
    useModelMaxTokens: true,
  });
}

/**
 * 纯函数：从 ModelSpec + AgentEnvConfig 构造 LLMConfig。
 *
 * - provider / model 来自 ModelSpec（由前端选择的 ModelId 解析而来）
 * - apiKey / baseUrl 来自 AgentEnvConfig（从 .env 读取）
 * - temperature / maxTokens 来自 AgentEnvConfig（仅在显式覆盖时传递）
 */
export function buildLLMConfig(spec: ModelSpec, envConfig: AgentEnvConfig): LLMConfig {
  const api = spec.provider === "deepseek" ? "openai-completions" : spec.api;
  const apiKeyMap = {
    deepseek: envConfig.deepseekApiKey,
    kimi: envConfig.kimiApiKey,
  };
  const baseUrlMap = {
    deepseek: envConfig.deepseekBaseUrl ?? "https://api.deepseek.com",
    kimi: envConfig.kimiBaseUrl ?? "https://api.moonshot.cn/v1",
  };
  const builtinDefinition = resolveModelDefinition(spec.id);
  if (!builtinDefinition) {
    throw new LLMServiceError("Legacy model is not registered.", "invalid_request", false);
  }
  const model: ModelDefinition = { ...builtinDefinition, api };
  return buildLLMConfigFromRuntimeInternal(
    model,
    {
      provider: spec.provider,
      apiKey: apiKeyMap[spec.provider],
      baseUrl: baseUrlMap[spec.provider],
    },
    { temperature: envConfig.temperature, maxTokens: envConfig.maxTokens },
    { allowMissingApiKey: true, useModelMaxTokens: false },
  );
}

// ─── 公开 API ───

/**
 * 第一步：构建 Agent 配置。
 *
 * 调用方只传前端收集的参数 + workspaceRoot，env 读取在内部完成。
 */
export function buildAgentConfig(
  frontendInput: FrontendAgentRunInput,
  workspaceRoot: string,
  approvalGate?: ApprovalGate,
  runtimeContext?: AgentRuntimeContext,
): AgentConfig {
  const envConfig = resolveAgentEnvConfig();
  const modelSpec = resolveModelSpec(frontendInput.model);
  const modelDefinition = resolveModelDefinition(modelSpec.id)!;
  const modelKey = normalizeModelKey(modelSpec.id)!;
  const thinkingEnabled = frontendInput.thinkingEnabled ?? modelSpec.thinkingDefault;
  const reasoningEffort = thinkingEnabled
    ? resolveReasoningEffort(modelDefinition, frontendInput.reasoningEffort)
    : undefined;
  const llmConfig = buildLLMConfig(modelSpec, envConfig);
  const toolManagerConfig: ToolManagerConfig = {
    workspaceRoot,
    primaryProvider: modelSpec.provider,
    apiFormat: llmConfig.apiFormat,
    hasKimiKey: Boolean(envConfig.kimiApiKey),
    hasWebSearchKey: envConfig.hasWebSearchKey,
    hasImageGenerationKey: Boolean(envConfig.imageGeneration?.apiKey),
    imageGeneration: envConfig.imageGeneration,
    disabledTools: envConfig.disabledTools,
    toolProfile: runtimeContext?.toolProfile,
    approvalGate,
    tmpRoot: runtimeContext?.tmpRoot,
    sessionId: runtimeContext?.sessionId,
    additionalWritableRoots: runtimeContext?.additionalWritableRoots,
    agentRunId: runtimeContext?.agentRunId,
    browserBridgeSocketPath: runtimeContext?.browserBridgeSocketPath,
    artifactRoot: runtimeContext?.artifactRoot,
  };
  return {
    llmConfig,
    modelDefinition,
    modelKey,
    toolManagerConfig,
    thinkingEnabled,
    ...(reasoningEffort && { reasoningEffort }),
    modelSpec,
    systemPrompt: runtimeContext?.systemPrompt ?? MAIN_AGENT_SYSTEM_PROMPT,
    systemPromptSegments: runtimeContext?.systemPromptSegments ?? [],
    exploreModelId: frontendInput.exploreModelId ?? null,
  };
}

/** Desktop/main entrypoint: all LLM credentials and model choices are explicit. */
export function buildAgentConfigFromRuntime(
  input: ExplicitAgentRuntimeInput,
  workspaceRoot: string,
  approvalGate?: ApprovalGate,
  runtimeContext?: AgentRuntimeContext,
): AgentConfig {
  const envConfig = resolveAgentEnvConfig();
  const toolEnvironment = input.toolEnvironment ?? {
    hasWebSearchKey: envConfig.hasWebSearchKey,
    disabledTools: envConfig.disabledTools,
    hasKimiKey: Boolean(envConfig.kimiApiKey),
    imageGeneration: envConfig.imageGeneration,
  };
  const thinkingEnabled = input.main.definition.capabilities.reasoningMandatory
    ? true
    : input.thinkingEnabled ?? input.main.definition.thinkingDefault;
  const reasoningEffort = thinkingEnabled
    ? resolveReasoningEffort(input.main.definition, input.reasoningEffort)
    : undefined;
  const mainDefinition = applyRequestModelVariant(input.main.definition, reasoningEffort);
  const mainConfig = buildLLMConfigFromRuntime(mainDefinition, input.main.runtime, input.inferenceSettings);
  if (mainDefinition.api === "openai-responses" && runtimeContext?.sessionId) {
    mainConfig.promptCacheKey = createPromptCacheKey(runtimeContext.sessionId);
  }
  const utilityConfig = input.utility
    ? buildLLMConfigFromRuntime(input.utility.definition, input.utility.runtime, input.inferenceSettings)
    : undefined;
  const exploreConfig = input.explore
    ? buildLLMConfigFromRuntime(input.explore.definition, input.explore.runtime, input.inferenceSettings)
    : undefined;
  const imageInspectionEnabled = Boolean(
    input.imageInspection && !mainDefinition.capabilities.input.includes("image"),
  );
  const imageInspectionConfig = imageInspectionEnabled
    ? buildLLMConfigFromRuntime(input.imageInspection!.definition, input.imageInspection!.runtime)
    : undefined;
  if (imageInspectionConfig) imageInspectionConfig.maxRetries = 0;
  const modelSpec = modelDefinitionToCompatSpec(mainDefinition);
  return {
    llmConfig: mainConfig,
    modelDefinition: mainDefinition,
    modelKey: input.main.definition.key,
    ...(utilityConfig && { utilityLlmConfig: utilityConfig, utilityModelKey: input.utility!.definition.key }),
    ...(exploreConfig && { exploreLlmConfig: exploreConfig, exploreModelKey: input.explore!.definition.key }),
    ...(imageInspectionConfig && {
      imageInspectionLlmConfig: imageInspectionConfig,
      imageInspectionToolConfig: {
        provider: input.imageInspection!.definition.provider as "kimi" | "openrouter",
        model: input.imageInspection!.definition.apiModel,
        modelLabel: input.imageInspection!.definition.label,
        allowedImagePaths: [...(runtimeContext?.imageInspectionAllowedPaths ?? [])],
        artifactRoot: runtimeContext?.sessionArtifactRoot,
      },
    }),
    toolManagerConfig: {
      workspaceRoot,
      primaryProvider: input.main.definition.provider,
      apiFormat: mainConfig.apiFormat,
      hasKimiKey: toolEnvironment.hasKimiKey,
      hasWebSearchKey: toolEnvironment.hasWebSearchKey,
      hasImageGenerationKey: Boolean(toolEnvironment.imageGeneration?.apiKey),
      imageGeneration: toolEnvironment.imageGeneration,
      disabledTools: toolEnvironment.disabledTools,
      toolProfile: runtimeContext?.toolProfile,
      approvalGate,
      tmpRoot: runtimeContext?.tmpRoot,
      sessionId: runtimeContext?.sessionId,
      additionalWritableRoots: runtimeContext?.additionalWritableRoots,
      agentRunId: runtimeContext?.agentRunId,
      browserBridgeSocketPath: runtimeContext?.browserBridgeSocketPath,
      artifactRoot: runtimeContext?.artifactRoot,
    },
    thinkingEnabled,
    ...(reasoningEffort && { reasoningEffort }),
    modelSpec,
    systemPrompt: runtimeContext?.systemPrompt ?? MAIN_AGENT_SYSTEM_PROMPT,
    systemPromptSegments: runtimeContext?.systemPromptSegments ?? [],
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
  const { modelDefinition, modelKey } = resolveConfigModelIdentity(config);
  const llm = createLLMService(config.llmConfig);
  const utilityLlm = config.utilityLlmConfig ? createLLMService(config.utilityLlmConfig) : undefined;
  const summarizer = utilityLlm ? createSummarizer(utilityLlm) : createSummarizerForAgent();
  const exploreLlm = config.exploreLlmConfig ? createLLMService(config.exploreLlmConfig) : createExploreLLMService(config.exploreModelId);
  const imageInspectionLlm = config.imageInspectionLlmConfig ? createLLMService(config.imageInspectionLlmConfig) : undefined;
  const toolManager = createToolManager({
    ...config.toolManagerConfig,
    llm,
    exploreLlm,
    ...(imageInspectionLlm && config.imageInspectionToolConfig && {
      imageInspection: { ...config.imageInspectionToolConfig, llm: imageInspectionLlm },
    }),
    contextWindow: modelDefinition.contextWindow ?? config.modelSpec.contextWindow,
    summarizer,
  });
  const systemPromptModule = new SystemPromptContext(config.systemPrompt);
  registerSystemPromptSegments(systemPromptModule, config.systemPromptSegments);
  const contextManager = new ContextManager({
    systemPromptModule,
    config: { contextWindow: modelDefinition.contextWindow ?? config.modelSpec.contextWindow },
  });
  return {
    llm,
    utilityLlm,
    toolManager,
    contextManager,
    thinkingEnabled: config.thinkingEnabled,
    reasoningEffort: config.reasoningEffort,
    modelSpec: config.modelSpec,
    modelDefinition,
    modelKey,
    utilityModelKey: config.utilityModelKey,
    exploreModelKey: config.exploreModelKey,
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
  const { modelDefinition, modelKey } = resolveConfigModelIdentity(config);
  const llm = createLLMService(config.llmConfig);
  const utilityLlm = config.utilityLlmConfig ? createLLMService(config.utilityLlmConfig) : undefined;
  const summarizer = utilityLlm ? createSummarizer(utilityLlm) : createSummarizerForAgent();
  const exploreLlm = config.exploreLlmConfig ? createLLMService(config.exploreLlmConfig) : createExploreLLMService(config.exploreModelId);
  const imageInspectionLlm = config.imageInspectionLlmConfig ? createLLMService(config.imageInspectionLlmConfig) : undefined;
  const toolManager = createToolManager({
    ...config.toolManagerConfig,
    llm,
    exploreLlm,
    ...(imageInspectionLlm && config.imageInspectionToolConfig && {
      imageInspection: { ...config.imageInspectionToolConfig, llm: imageInspectionLlm },
    }),
    contextWindow: modelDefinition.contextWindow ?? config.modelSpec.contextWindow,
    summarizer,
  });
  const systemPromptModule = new SystemPromptContext(config.systemPrompt);
  registerSystemPromptSegments(systemPromptModule, config.systemPromptSegments);
  const contextManager = await ContextManager.createForSession({
    systemPromptModule,
    sessionPath: options.sessionPath,
    config: { contextWindow: modelDefinition.contextWindow ?? config.modelSpec.contextWindow },
  });
  return {
    llm,
    utilityLlm,
    toolManager,
    contextManager,
    thinkingEnabled: config.thinkingEnabled,
    reasoningEffort: config.reasoningEffort,
    modelSpec: config.modelSpec,
    modelDefinition,
    modelKey,
    utilityModelKey: config.utilityModelKey,
    exploreModelKey: config.exploreModelKey,
    summarizer,
  };
}

function resolveReasoningEffort(
  definition: ModelDefinition,
  requested?: ModelReasoningEffort,
): ModelReasoningEffort | undefined {
  if (!definition.capabilities.reasoning) return undefined;
  const supported = definition.capabilities.reasoningEfforts;
  const fallback = definition.capabilities.reasoningDefaultEffort;
  const candidate = requested ?? fallback;
  if (!candidate) return undefined;
  if (supported === null || supported?.includes(candidate)) return candidate;
  return undefined;
}

function applyRequestModelVariant(
  definition: ModelDefinition,
  effort?: ModelReasoningEffort,
): ModelDefinition {
  if (!effort) return definition;
  const requestModel = definition.requestModelByReasoningEffort?.[effort]?.trim();
  if (!requestModel || requestModel === definition.apiModel) return definition;
  return { ...definition, apiModel: requestModel };
}

function createPromptCacheKey(sessionId: string): string {
  const digest = createHash("sha256").update(sessionId).digest("hex").slice(0, 48);
  return `actspace:${digest}`;
}

function resolveConfigModelIdentity(config: AgentConfig): {
  modelDefinition: ModelDefinition;
  modelKey: ModelKey;
} {
  const modelDefinition = config.modelDefinition ?? resolveModelDefinition(config.modelSpec.id);
  if (!modelDefinition) {
    throw new LLMServiceError("Agent model is not registered.", "invalid_request", false);
  }
  return {
    modelDefinition,
    modelKey: config.modelKey ?? modelDefinition.key,
  };
}

function modelDefinitionToCompatSpec(definition: ModelDefinition): ModelSpec {
  return {
    id: definition.apiModel as ModelId,
    label: definition.label,
    api: definition.api,
    provider: definition.provider as ModelSpec["provider"],
    apiModel: definition.apiModel,
    defaultBaseUrl: PROVIDER_REGISTRY[definition.provider].defaultBaseUrl,
    thinkingDefault: definition.thinkingDefault,
    supportsThinkingToggle: definition.capabilities.thinkingToggle,
    reasoning: definition.capabilities.reasoning,
    ...(definition.capabilities.reasoningEfforts && { reasoningEfforts: [...definition.capabilities.reasoningEfforts] }),
    ...(definition.capabilities.reasoningDefaultEffort && { reasoningDefaultEffort: definition.capabilities.reasoningDefaultEffort }),
    input: [...definition.capabilities.input],
    contextWindow: definition.contextWindow ?? 128_000,
    maxTokens: definition.maxTokens ?? 8192,
    visibility: "public",
    ...(definition.pricing && { pricing: { ...definition.pricing } }),
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
