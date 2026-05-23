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
export { runTurnWithAgent } from "./bridge";
export type {
  RunTurnWithAgentInput,
  RunTurnWithAgentDeps,
  RunTurnWithAgentOptions,
} from "./bridge";
