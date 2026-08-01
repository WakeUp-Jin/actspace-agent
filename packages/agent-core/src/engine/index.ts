/**
 * 执行引擎统一导出
 */

// 类型
export type {
  ToolExecutionMode,
  AgentEvent,
  AgentEventSink,
  AgentLoopConfig,
  AgentLoopResult,
  LLMRetryConfig,
} from "./types";

// 核心循环
export { runAgentLoop } from "./loop";

// Agent 入口类
export { Agent } from "./agent";
export type { AgentOptions } from "./agent";

// IPC 桥接
export { runAgentWithBridge, createContextState, buildContextEntries } from "./bridge";
export type {
  RunAgentWithBridgeInput,
  RunAgentWithBridgeDeps,
  RunAgentWithBridgeOptions,
} from "./bridge";

export { compactContextWithAgent } from "./compact-context";
export type { CompactContextDeps, CompactContextOptions } from "./compact-context";

// Agent 配置构建与实例创建
export {
  buildAgentConfig,
  buildAgentConfigFromRuntime,
  createAgentFromConfig,
  createAgentForSession,
  createTitlerLLMService,
  buildLLMConfig,
  buildLLMConfigFromRuntime,
  resolveAgentEnvConfig,
} from "./create-agent-deps";
export type {
  AgentRuntimeContext,
  AgentSystemPromptSegment,
  FrontendAgentRunInput,
  AgentEnvConfig,
  AgentConfig,
  AgentDeps,
} from "./create-agent-deps";
