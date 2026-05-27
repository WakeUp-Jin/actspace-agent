/**
 * 执行引擎类型定义
 *
 * AgentEvent：四层级事件判别联合（agent/turn/message/tool）
 * AgentEventSink：事件回调
 * AgentLoopConfig：循环配置
 * AgentLoopResult：循环返回值
 *
 * 设计参考：.agents/skills/llm-agent-dev/references/agent-runtime/agent-patterns.md
 * 代码参考：.agents/skills/llm-agent-dev/examples/agent-loop.ts
 */

import type {
  AssistantMessage,
  Message,
  ToolResultMessage,
  Usage,
} from "../messages";
import type { AssistantMessageEvent } from "../llm/types";
import type { ToolResult } from "../internal-tools";
import type { ToolExecuteOptions, ToolManager } from "../tools/manager";
import type { ToolApprovalRequest, ToolApprovalDecision } from "../tools/scheduler";

// ─── 工具执行模式 ───

export type ToolExecutionMode = "sequential" | "parallel";

export interface LLMUsageCall {
  callId: string;
  message: AssistantMessage;
  usage: Usage;
}

// ─── AgentEvent 四层级事件 ───

export type AgentEvent =
  | { type: "agent_start" }
  | { type: "agent_end"; messages: Message[] }
  | { type: "turn_start"; turnIndex: number }
  | { type: "turn_end"; turnIndex: number; message: AssistantMessage; toolResults: ToolResultMessage[] }
  | { type: "message_start"; message: Message }
  | { type: "message_delta"; delta: AssistantMessageEvent }
  | { type: "message_end"; message: Message }
  | { type: "tool_start"; toolCallId: string; toolName: string; args: Record<string, unknown> }
  | { type: "tool_end"; toolCallId: string; toolName: string; result: ToolResult; isError: boolean }
  | { type: "tool_approval_required"; toolCallId: string; toolName: string; request: ToolApprovalRequest }
  | { type: "tool_approval_resolved"; toolCallId: string; toolName: string; decision: ToolApprovalDecision };

/** 事件回调签名 */
export type AgentEventSink = (event: AgentEvent) => Promise<void> | void;

// ─── AgentLoopConfig ───

export interface AgentLoopConfig {
  /** V0 用 ToolManager，V1 升级为 ToolScheduler */
  toolManager: ToolManager;
  toolExecution?: ToolExecutionMode;
  /** 每轮结束后检查是否应该停止（turnIndex 从 1 开始累加） */
  shouldStopAfterTurn?: (ctx: { message: AssistantMessage; turnIndex: number }) => boolean;
  /** 轮间获取 steering 消息（运行中注入，在下一次 LLM 调用前） */
  getSteeringMessages?: () => Promise<Message[]>;
  /** agent 停止前获取 follow-up 消息 */
  getFollowUpMessages?: () => Promise<Message[]>;
  /** 本轮是否允许 provider 输出 thinking/reasoning。 */
  thinkingEnabled?: boolean;
  /** 内层循环最大轮次硬限制，防止工具调用无限循环。默认 50。 */
  maxTurns?: number;
  /**
   * 工具调用统一附加的 caller-specific options。
   * Kairos runner 传 `{callerAgent:"kairos", kairosGuard}` 以激活路径/blocklist 双校验。
   * 主 Agent 不传 → 走零开销原路径。
   */
  toolExecuteOptions?: ToolExecuteOptions;
}

// ─── AgentLoopResult ───

export interface AgentLoopResult {
  message: AssistantMessage;
  totalUsage: Usage;
  usageCalls: LLMUsageCall[];
  messages: Message[];
}
