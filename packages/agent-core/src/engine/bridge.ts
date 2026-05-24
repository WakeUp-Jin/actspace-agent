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
import type { AgentRunLogger } from "../observability";
import { Agent } from "./agent";
import type { AgentEvent, AgentLoopResult, ToolExecutionMode } from "./types";
import {
  messageToEvents,
  userMessageToEvents,
  toAssistantReply,
  contextSnapshotToEvent,
} from "../adapters";
import type { UserMessage } from "../messages";

const PREVIEW_LIMIT = 160;

type StreamLogBuffer = {
  text: string[];
  textDeltaCount: number;
  textChars: number;
  thinking: string[];
  thinkingDeltaCount: number;
  thinkingChars: number;
};

function preview(value: unknown, limit = PREVIEW_LIMIT): string {
  let text: string;
  try {
    text = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    text = String(value);
  }
  if (!text) return "";
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function logAgentRun(message: string, details?: Record<string, unknown>): void {
  console.log(
    `[agent-run] ${message}`,
    details ? JSON.stringify(details) : "",
  );
}

export interface RunTurnWithAgentInput {
  sessionId: string;
  turnId: string;
  userInput: string;
  thinkingEnabled?: boolean;
}

export interface RunTurnWithAgentDeps {
  llm: BaseLLMService;
  toolManager: ToolManager;
  contextManager: ContextManager;
  toolExecution?: ToolExecutionMode;
  thinkingEnabled?: boolean;
}

export interface RunTurnWithAgentOptions {
  onStreamEvent?: (event: RuntimeStreamEvent) => void;
  runLogger?: AgentRunLogger;
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
  const runLogger = options?.runLogger;
  let eventIdCounter = 0;
  const streamStats = {
    textDeltaCount: 0,
    textChars: 0,
    thinkingDeltaCount: 0,
    thinkingChars: 0,
  };
  const streamLogBuffer: StreamLogBuffer = {
    text: [],
    textDeltaCount: 0,
    textChars: 0,
    thinking: [],
    thinkingDeltaCount: 0,
    thinkingChars: 0,
  };

  function nextEventId(): string {
    return `evt_${turnId}_${++eventIdCounter}`;
  }

  await writeRunLog(runLogger, "run_started", {
    sessionId,
    turnId,
    userInput,
    logFilePath: runLogger?.filePath,
  });

  const agent = new Agent({
    llm: deps.llm,
    contextManager: deps.contextManager,
    toolManager: deps.toolManager,
    toolExecution: deps.toolExecution,
    thinkingEnabled: input.thinkingEnabled ?? deps.thinkingEnabled,
    onEvent: async (agentEvent) => {
      logAgentEvent(agentEvent, sessionId, turnId, streamStats);
      const bufferedStreamDelta = bufferStreamLogDelta(agentEvent, streamLogBuffer);
      if (!bufferedStreamDelta) {
        await flushStreamLogBuffer(runLogger, streamLogBuffer);
        await writeRunLog(runLogger, getRunLogEventType(agentEvent), serializeAgentEvent(agentEvent));
      }
      if (!streamCb) return;
      const mapped = mapAgentEventToStreamEvent(agentEvent, sessionId, turnId, nextEventId);
      if (mapped) {
        if (!isStreamDeltaEvent(mapped)) {
          await flushStreamLogBuffer(runLogger, streamLogBuffer);
          await writeRunLog(runLogger, "stream_event", mapped);
        }
        streamCb(mapped);
      }
    },
  });

  let loopResult: AgentLoopResult;
  try {
    logAgentRun("turn execution started", {
      sessionId,
      turnId,
      userInputLength: userInput.length,
      userInputPreview: preview(userInput),
    });
    loopResult = await agent.run(userInput);
  } catch (err) {
    await flushStreamLogBuffer(runLogger, streamLogBuffer);
    const errorMsg = err instanceof Error ? err.message : String(err);
    logAgentRun("turn execution threw", {
      sessionId,
      turnId,
      error: errorMsg,
    });

    if (streamCb) {
      const failedEvent: RuntimeStreamEvent = {
        type: "turn_failed",
        sessionId,
        turnId,
        error: { code: "AGENT_ERROR", message: errorMsg, recoverable: false },
      };
      await writeRunLog(runLogger, "stream_event", failedEvent);
      streamCb(failedEvent);
    }

    const failedResult: AgentTurnResult = {
      sessionId,
      turnId,
      events: [],
      contextSnapshot: deps.contextManager.getUsageSnapshot(),
      status: "failed",
      error: { code: "AGENT_ERROR", message: errorMsg },
    };
    await writeRunLog(runLogger, "run_failed", failedResult);
    return failedResult;
  }

  const sessionEvents = buildSessionEvents(loopResult, sessionId, turnId, userInput);
  const contextSnapshot = deps.contextManager.getUsageSnapshot();
  const snapshotEvent = contextSnapshotToEvent(contextSnapshot, sessionId, turnId);
  sessionEvents.push(snapshotEvent);

  const finalReply = toAssistantReply(loopResult.message);
  await flushStreamLogBuffer(runLogger, streamLogBuffer);

  if (streamCb) {
    const finishedEvent: RuntimeStreamEvent = {
      type: "turn_finished",
      sessionId,
      turnId,
      resultEventIds: sessionEvents.map((e) => e.id),
    };
    await writeRunLog(runLogger, "stream_event", finishedEvent);
    streamCb(finishedEvent);
  }

  logAgentRun("turn execution completed", {
    sessionId,
    turnId,
    status: loopResult.message.stopReason === "error" ? "failed" : "completed",
    stopReason: loopResult.message.stopReason,
    sessionEventCount: sessionEvents.length,
    textDeltaCount: streamStats.textDeltaCount,
    textChars: streamStats.textChars,
    thinkingDeltaCount: streamStats.thinkingDeltaCount,
    thinkingChars: streamStats.thinkingChars,
    totalTokens: contextSnapshot.totalTokens,
  });

  const result: AgentTurnResult = {
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
  await writeRunLog(
    runLogger,
    result.status === "failed" ? "run_failed" : "run_finished",
    result,
  );
  return result;
}

function buildSessionEvents(
  result: AgentLoopResult,
  sessionId: string,
  turnId: string,
  userInput: string,
): SessionEvent[] {
  const userMessage: UserMessage = {
    role: "user",
    content: userInput,
    timestamp: Date.now(),
    source: "user",
  };
  const events: SessionEvent[] = userMessageToEvents(userMessage, sessionId, turnId);
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

function logAgentEvent(
  event: AgentEvent,
  sessionId: string,
  turnId: string,
  stats: {
    textDeltaCount: number;
    textChars: number;
    thinkingDeltaCount: number;
    thinkingChars: number;
  },
): void {
  switch (event.type) {
    case "agent_start":
      logAgentRun("agent started", { sessionId, turnId });
      return;

    case "agent_end":
      logAgentRun("agent ended", { sessionId, turnId, messageCount: event.messages.length });
      return;

    case "turn_start":
      logAgentRun("loop turn started", { sessionId, turnId, turnIndex: event.turnIndex });
      return;

    case "turn_end":
      logAgentRun("loop turn ended", {
        sessionId,
        turnId,
        turnIndex: event.turnIndex,
        stopReason: event.message.stopReason,
        toolResultCount: event.toolResults.length,
      });
      return;

    case "message_start":
      logAgentRun("message started", { sessionId, turnId, role: event.message.role });
      return;

    case "message_end":
      logAgentRun("message ended", { sessionId, turnId, role: event.message.role });
      return;

    case "message_delta":
      if (event.delta.type === "text_delta") {
        stats.textDeltaCount += 1;
        stats.textChars += event.delta.delta.length;
        if (stats.textDeltaCount === 1 || stats.textDeltaCount % 20 === 0) {
          logAgentRun("assistant text streaming", {
            sessionId,
            turnId,
            deltaCount: stats.textDeltaCount,
            chars: stats.textChars,
          });
        }
      } else if (event.delta.type === "thinking_delta") {
        stats.thinkingDeltaCount += 1;
        stats.thinkingChars += event.delta.delta.length;
        if (stats.thinkingDeltaCount === 1 || stats.thinkingDeltaCount % 20 === 0) {
          logAgentRun("assistant thinking streaming", {
            sessionId,
            turnId,
            deltaCount: stats.thinkingDeltaCount,
            chars: stats.thinkingChars,
          });
        }
      } else {
        logAgentRun("tool call delta received", { sessionId, turnId });
      }
      return;

    case "tool_start":
      logAgentRun("tool started", {
        sessionId,
        turnId,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        argsPreview: preview(event.args),
      });
      return;

    case "tool_end":
      logAgentRun("tool finished", {
        sessionId,
        turnId,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        isError: event.isError,
        resultPreview: preview(event.result.success ? event.result.data : event.result.error),
      });
      return;
  }
}

async function writeRunLog(
  runLogger: AgentRunLogger | undefined,
  type: string,
  payload: unknown,
): Promise<void> {
  if (!runLogger) return;

  try {
    await runLogger.write({ type, payload });
  } catch (err) {
    console.error("[agent-run-log] failed to write run log", err);
  }
}

function bufferStreamLogDelta(event: AgentEvent, buffer: StreamLogBuffer): boolean {
  if (event.type !== "message_delta") return false;

  const delta = event.delta;
  if (delta.type === "text_delta") {
    buffer.text.push(delta.delta);
    buffer.textDeltaCount += 1;
    buffer.textChars += delta.delta.length;
    return true;
  }

  if (delta.type === "thinking_delta") {
    buffer.thinking.push(delta.delta);
    buffer.thinkingDeltaCount += 1;
    buffer.thinkingChars += delta.delta.length;
    return true;
  }

  return false;
}

function isStreamDeltaEvent(event: RuntimeStreamEvent): boolean {
  return event.type === "assistant_text_delta" || event.type === "assistant_thinking_delta";
}

async function flushStreamLogBuffer(
  runLogger: AgentRunLogger | undefined,
  buffer: StreamLogBuffer,
): Promise<void> {
  if (buffer.thinkingDeltaCount > 0) {
    await writeRunLog(runLogger, "assistant_thinking", {
      text: buffer.thinking.join(""),
      deltaCount: buffer.thinkingDeltaCount,
      chars: buffer.thinkingChars,
    });
    buffer.thinking = [];
    buffer.thinkingDeltaCount = 0;
    buffer.thinkingChars = 0;
  }

  if (buffer.textDeltaCount > 0) {
    await writeRunLog(runLogger, "assistant_text", {
      text: buffer.text.join(""),
      deltaCount: buffer.textDeltaCount,
      chars: buffer.textChars,
    });
    buffer.text = [];
    buffer.textDeltaCount = 0;
    buffer.textChars = 0;
  }
}

function serializeAgentEvent(event: AgentEvent): Record<string, unknown> {
  switch (event.type) {
    case "agent_start":
    case "agent_end":
    case "message_start":
    case "message_end":
      return event;

    case "turn_start":
      return event;

    case "turn_end":
      return event;

    case "message_delta":
      return event;

    case "tool_start":
      return event;

    case "tool_end":
      return event;
  }
}

function getRunLogEventType(event: AgentEvent): "agent_event" | "tool_event" {
  return event.type === "tool_start" || event.type === "tool_end"
    ? "tool_event"
    : "agent_event";
}
