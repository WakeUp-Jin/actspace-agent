/**
 * AgentEvent -> AgentTurnResult + RuntimeStreamEvent 桥接
 *
 * 连接新 engine（Agent.run）与旧 IPC 契约（AgentTurnResult + RuntimeStreamEvent）。
 *
 * 双通道输出：
 * 1. onStreamEvent 回调：实时推送 RuntimeStreamEvent 给 IPC 层
 * 2. 返回值：聚合为 AgentTurnResult 供 persistence 和 renderer 最终消费
 */

import type {
  AgentTurnResult,
  RuntimeStreamEvent,
  SessionEvent,
  ContextUsageSnapshot,
} from "@actspace/shared";
import type { BaseLLMService } from "../llm/base";
import type { ToolManager } from "../tools/manager";
import type { ContextManager } from "../context/manager";
import { Agent } from "./agent";
import type { AgentEvent, AgentLoopResult, ToolExecutionMode } from "./types";
import {
  messageToEvents,
  toAssistantReply,
  contextSnapshotToEvent,
} from "../adapters";

export interface RunTurnWithAgentInput {
  sessionId: string;
  turnId: string;
  userInput: string;
}

export interface RunTurnWithAgentDeps {
  llm: BaseLLMService;
  toolManager: ToolManager;
  contextManager: ContextManager;
  toolExecution?: ToolExecutionMode;
}

export interface RunTurnWithAgentOptions {
  onStreamEvent?: (event: RuntimeStreamEvent) => void;
}

/**
 * 用新 Agent 引擎执行一轮 turn，同时桥接旧的 AgentTurnResult 契约。
 *
 * 内部流程：
 * 1. Agent.run() 执行，通过 onEvent 实时将 AgentEvent 映射为 RuntimeStreamEvent
 * 2. 执行结束后，将 AgentLoopResult 中的 messages 转为 SessionEvent[]
 * 3. 附加 contextSnapshot 事件
 * 4. 组装并返回 AgentTurnResult
 */
export async function runTurnWithAgent(
  input: RunTurnWithAgentInput,
  deps: RunTurnWithAgentDeps,
  options?: RunTurnWithAgentOptions,
): Promise<AgentTurnResult> {
  const { sessionId, turnId, userInput } = input;
  const streamCb = options?.onStreamEvent;
  let eventIdCounter = 0;

  function nextEventId(): string {
    return `evt_${turnId}_${++eventIdCounter}`;
  }

  const agent = new Agent({
    llm: deps.llm,
    contextManager: deps.contextManager,
    toolManager: deps.toolManager,
    toolExecution: deps.toolExecution,
    onEvent: (agentEvent) => {
      if (!streamCb) return;
      const mapped = mapAgentEventToStreamEvent(agentEvent, sessionId, turnId, nextEventId);
      if (mapped) streamCb(mapped);
    },
  });

  let loopResult: AgentLoopResult;
  try {
    loopResult = await agent.run(userInput);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    if (streamCb) {
      streamCb({
        type: "turn_failed",
        sessionId,
        turnId,
        error: { code: "AGENT_ERROR", message: errorMsg, recoverable: false },
      });
    }

    return {
      sessionId,
      turnId,
      events: [],
      contextSnapshot: deps.contextManager.getUsageSnapshot(),
      status: "failed",
      error: { code: "AGENT_ERROR", message: errorMsg },
    };
  }

  const sessionEvents = buildSessionEvents(loopResult, sessionId, turnId);
  const contextSnapshot = deps.contextManager.getUsageSnapshot();
  const snapshotEvent = contextSnapshotToEvent(contextSnapshot, sessionId, turnId);
  sessionEvents.push(snapshotEvent);

  const finalReply = toAssistantReply(loopResult.message);

  if (streamCb) {
    streamCb({
      type: "turn_finished",
      sessionId,
      turnId,
      resultEventIds: sessionEvents.map((e) => e.id),
    });
  }

  return {
    sessionId,
    turnId,
    events: sessionEvents,
    finalReply,
    contextSnapshot,
    status: loopResult.message.stopReason === "error" ? "failed" : "completed",
    error: loopResult.message.errorMessage
      ? { code: "LLM_ERROR", message: loopResult.message.errorMessage }
      : undefined,
  };
}

function buildSessionEvents(
  result: AgentLoopResult,
  sessionId: string,
  turnId: string,
): SessionEvent[] {
  const events: SessionEvent[] = [];
  for (const msg of result.messages) {
    events.push(...messageToEvents(msg, sessionId, turnId));
  }
  return events;
}

function mapAgentEventToStreamEvent(
  event: AgentEvent,
  sessionId: string,
  turnId: string,
  nextId: () => string,
): RuntimeStreamEvent | null {
  switch (event.type) {
    case "agent_start":
      return { type: "turn_started", sessionId, turnId };

    case "message_delta": {
      const delta = event.delta;
      if (delta.type === "text_delta") {
        return { type: "assistant_text_delta", messageId: nextId(), delta: delta.delta };
      }
      if (delta.type === "thinking_delta") {
        return { type: "assistant_thinking_delta", messageId: nextId(), delta: delta.delta };
      }
      return null;
    }

    case "tool_start":
      return {
        type: "tool_started",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        argsPreview: JSON.stringify(event.args).slice(0, 200),
      };

    case "tool_end":
      return {
        type: "tool_finished",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        resultEventId: nextId(),
        isError: event.isError,
      };

    case "agent_end":
    case "turn_start":
    case "turn_end":
    case "message_start":
    case "message_end":
      return null;
  }
}
