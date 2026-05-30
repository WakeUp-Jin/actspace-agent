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
} from "./types";

// 核心循环
export { runAgentLoop } from "./loop";

// Agent 入口类
export { Agent } from "./agent";
export type { AgentOptions } from "./agent";

// IPC 桥接
export { runTurnWithAgent, createContextState, buildContextEntries } from "./bridge";
export type {
  RunTurnWithAgentInput,
  RunTurnWithAgentDeps,
  RunTurnWithAgentOptions,
} from "./bridge";

// Agent 配置构建与实例创建
export {
  buildAgentConfig,
  createAgentFromConfig,
  createAgentForSession,
  buildLLMConfig,
  resolveAgentEnvConfig,
} from "./create-agent-deps";
export type { FrontendTurnInput, AgentEnvConfig, AgentConfig, AgentDeps } from "./create-agent-deps";
