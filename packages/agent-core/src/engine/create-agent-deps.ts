/**
 * Agent 配置构建与实例创建
 *
 * 两步分离：
 * 1. buildAgentConfig() — 纯配置对象（前端参数 + 内部读 env + 模型注册表）
 * 2. createAgentFromConfig() — 根据配置创建运行时实例
 *
 * 调用方（main/agent-turn.ts）只需两行：
 *   const config = buildAgentConfig({ model, thinkingEnabled }, workspaceRoot);
 *   const deps = createAgentFromConfig(config);
 *
 * 打开本文件就能看到：前端传了什么，env 补了什么，最终 LLM 收到什么。
 */

import type { ModelId, ModelSpec } from "@actspace/shared";
import { resolveModelSpec } from "@actspace/shared";
import type { LLMConfig, LLMService } from "../llm/types";
import { createLLMService } from "../llm/factory";
import type { ToolManagerConfig } from "../tools/types";
import { ToolManager } from "../tools/manager";
import { createToolManager } from "../tools/index";
import { ContextManager } from "../context/manager";
import { SystemPromptContext } from "../context/modules/system-prompt";
import { MAIN_AGENT_SYSTEM_PROMPT } from "../prompt/main-agent";
import { env } from "../env";

// ─── 类型定义 ───

/** 前端收集并传递过来的字段 —— 只有这些是前端负责的 */
export interface FrontendTurnInput {
  model?: ModelId;
  thinkingEnabled?: boolean;
}

/** 从 env / 配置文件读取的后端环境配置 */
export interface AgentEnvConfig {
  deepseekApiKey: string;
  deepseekBaseUrl?: string;
  kimiApiKey: string;
  kimiBaseUrl?: string;
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
}

/** 运行时实例集合 */
export interface AgentDeps {
  llm: LLMService;
  toolManager: ToolManager;
  contextManager: ContextManager;
  thinkingEnabled: boolean;
  modelSpec: ModelSpec;
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
  const apiKeyMap: Record<string, string> = {
    deepseek: envConfig.deepseekApiKey,
    kimi: envConfig.kimiApiKey,
  };
  const baseUrlMap: Record<string, string | undefined> = {
    deepseek: envConfig.deepseekBaseUrl,
    kimi: envConfig.kimiBaseUrl,
  };

  return {
    provider: spec.provider,
    apiKey: apiKeyMap[spec.provider] ?? "",
    baseUrl: baseUrlMap[spec.provider] || undefined,
    model: spec.apiModel,
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
): AgentConfig {
  const envConfig = resolveAgentEnvConfig();
  const modelSpec = resolveModelSpec(frontendInput.model);
  const thinkingEnabled = frontendInput.thinkingEnabled ?? modelSpec.thinkingDefault;
  const llmConfig = buildLLMConfig(modelSpec, envConfig);
  const toolManagerConfig: ToolManagerConfig = {
    workspaceRoot,
    primaryProvider: modelSpec.provider,
    hasKimiKey: Boolean(envConfig.kimiApiKey),
    disabledTools: envConfig.disabledTools,
  };
  return { llmConfig, toolManagerConfig, thinkingEnabled, modelSpec };
}

/**
 * 第二步：根据配置创建运行时实例。
 *
 * 打开这个函数就能看到 Agent 初始化了哪些组件。
 */
export function createAgentFromConfig(config: AgentConfig): AgentDeps {
  const llm = createLLMService(config.llmConfig);
  const toolManager = createToolManager(config.toolManagerConfig);
  const systemPromptModule = new SystemPromptContext(MAIN_AGENT_SYSTEM_PROMPT);
  const contextManager = new ContextManager({ systemPromptModule });
  return {
    llm,
    toolManager,
    contextManager,
    thinkingEnabled: config.thinkingEnabled,
    modelSpec: config.modelSpec,
  };
}
