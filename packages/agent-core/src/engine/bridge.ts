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
  ContextState,
  LlmUsagePayload,
  ToolExecutionResult,
  ToolUiPreview,
} from "@actspace/shared";
import { resolveModelSpecByApiModel } from "@actspace/shared";
import type { LLMService } from "../llm/types";
import type { ToolManager } from "../tools/manager";
import type { ContextManager } from "../context/manager";
import type { AgentRunLogger } from "../observability";
import type { ToolResult } from "../internal-tools";
import { Agent } from "./agent";
import type { AgentEvent, AgentLoopResult, ToolExecutionMode } from "./types";
import {
  createPersistedSessionEvent,
  messageToEvents,
  userMessageToEvents,
  toAssistantReply,
  contextSnapshotToEvent,
} from "../adapters";
import { getTextContent, getThinkingContent, getToolCalls, getMessageText } from "../messages";
import type { AssistantMessage, Message, ToolResultMessage, UserMessage } from "../messages";
import { calculateUsageCost } from "../usage";

const PREVIEW_LIMIT = 160;

type StreamLogBuffer = {
  text: string[];
  textDeltaCount: number;
  textChars: number;
  thinking: string[];
  thinkingDeltaCount: number;
  thinkingChars: number;
};

type ToolExecutionRecord = {
  toolName: string;
  args: Record<string, unknown>;
  result?: ToolResult;
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
  llm: LLMService;
  toolManager: ToolManager;
  contextManager: ContextManager;
  toolExecution?: ToolExecutionMode;
  thinkingEnabled?: boolean;
  abort?: () => void;
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
  const toolExecutions = new Map<string, ToolExecutionRecord>();

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
      recordToolExecution(toolExecutions, agentEvent);
      logAgentEvent(agentEvent, sessionId, turnId, streamStats);
      const bufferedStreamDelta = bufferStreamLogDelta(agentEvent, streamLogBuffer);
      if (!bufferedStreamDelta) {
        await flushStreamLogBuffer(runLogger, streamLogBuffer);
        await writeAgentEventRunLog(runLogger, agentEvent);
      }
      if (!streamCb) return;
      const mapped = mapAgentEventToStreamEvent(agentEvent, sessionId, turnId, nextEventId, deps.toolManager);
      if (mapped) {
        if (!isStreamDeltaEvent(mapped)) {
          await flushStreamLogBuffer(runLogger, streamLogBuffer);
          await writeRunLog(runLogger, "stream_event", mapped);
        }
        streamCb(mapped);
      }
    },
  });
  deps.abort = () => agent.abort();

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

  const sessionEvents = buildSessionEvents(loopResult, sessionId, turnId, userInput, deps.toolManager, toolExecutions);
  const contextSnapshot = deps.contextManager.getUsageSnapshot();
  const contextState = createContextState(contextSnapshot, sessionId, turnId);
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
    status: loopResult.message.stopReason === "aborted"
      ? "aborted"
      : loopResult.message.stopReason === "error" ? "failed" : "completed",
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
    contextState,
    status: loopResult.message.stopReason === "aborted"
      ? "aborted"
      : loopResult.message.stopReason === "error" ? "failed" : "completed",
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

function createContextState(
  snapshot: ContextUsageSnapshot,
  sessionId: string,
  turnId: string,
): ContextState {
  return {
    sessionId,
    activeTurnId: turnId,
    updatedAt: new Date().toISOString(),
    estimator: snapshot.estimator ?? { name: "unknown", version: "0" },
    totalEstimatedTokens: snapshot.totalTokens,
    maxTokens: snapshot.maxTokens,
    percentUsed: snapshot.percentUsed,
    buckets: snapshot.buckets,
    entries: snapshot.buckets.map((bucket) => {
      const kind = bucket.key ?? bucket.name ?? "conversation";
      return {
        id: `context_${kind}`,
        kind: kind === "tools" ? "toolDefinitions" : kind === "subagents" ? "subagentDefinitions" : kind,
        title: bucket.label ?? kind,
        estimatedTokens: bucket.tokens,
        included: bucket.tokens > 0,
        removable: false,
      };
    }),
  };
}

function buildSessionEvents(
  result: AgentLoopResult,
  sessionId: string,
  turnId: string,
  userInput: string,
  toolManager: ToolManager,
  toolExecutions: Map<string, ToolExecutionRecord>,
): SessionEvent[] {
  const userMessage: UserMessage = {
    role: "user",
    content: userInput,
    timestamp: Date.now(),
    source: "user",
  };
  const events: SessionEvent[] = userMessageToEvents(userMessage, sessionId, turnId);
  let usageCallIndex = 0;
  for (const msg of result.messages) {
    if (msg.role === "toolResult") {
      events.push(
        ...messageToEvents(
          msg,
          sessionId,
          turnId,
          createToolExecutionResult(msg, toolManager, toolExecutions.get(msg.toolCallId)),
        ),
      );
      continue;
    }

    const messageEvents = messageToEvents(msg, sessionId, turnId);
    events.push(...messageEvents);

    if (msg.role === "assistant") {
      const usageCall = result.usageCalls[usageCallIndex++];
      const relatedEventIds = messageEvents.map((event) => event.id);
      events.push(createLlmUsageEvent(usageCall?.callId ?? `llm_call_${turnId}_${usageCallIndex}`, msg, sessionId, turnId, relatedEventIds));
    }
  }
  return events;
}

function createLlmUsageEvent(
  callId: string,
  message: AssistantMessage,
  sessionId: string,
  turnId: string,
  relatedEventIds: string[],
): SessionEvent<LlmUsagePayload> {
  const modelSpec = resolveModelSpecByApiModel(message.model, message.provider as "deepseek" | "kimi" | undefined);
  const payload: LlmUsagePayload = {
    callId,
    provider: message.provider,
    model: message.model,
    modelId: modelSpec?.id,
    promptTokens: message.usage.input,
    completionTokens: message.usage.output,
    totalTokens: message.usage.totalTokens,
    reasoningTokens: message.usage.reasoning || undefined,
    cacheHitTokens: message.usage.cacheHit || message.usage.cacheRead || undefined,
    cacheMissTokens: message.usage.cacheMiss || undefined,
    cost: calculateUsageCost(
      {
        inputTokens: message.usage.input,
        outputTokens: message.usage.output,
        totalTokens: message.usage.totalTokens,
        reasoningTokens: message.usage.reasoning,
        cacheHitTokens: message.usage.cacheHit || message.usage.cacheRead,
        cacheMissTokens: message.usage.cacheMiss,
      },
      modelSpec?.pricing,
    ),
    relatedEventIds,
  };

  return createPersistedSessionEvent(sessionId, turnId, "llm_usage", payload);
}

function recordToolExecution(
  records: Map<string, ToolExecutionRecord>,
  event: AgentEvent,
): void {
  if (event.type === "tool_start") {
    records.set(event.toolCallId, {
      toolName: event.toolName,
      args: event.args,
    });
    return;
  }

  if (event.type === "tool_end") {
    const record = records.get(event.toolCallId) ?? {
      toolName: event.toolName,
      args: {},
    };
    record.result = event.result;
    records.set(event.toolCallId, record);
  }
}

function createToolExecutionResult(
  message: ToolResultMessage,
  toolManager: ToolManager,
  record: ToolExecutionRecord | undefined,
): ToolExecutionResult {
  const tool = toolManager.get(message.toolName);
  const rawOutput = getMessageText(message);
  const ok = !message.isError;
  const summary = getToolSummary(message.toolName, tool?.previewKind ?? "generic", record?.args ?? {}, ok);

  return {
    toolName: message.toolName,
    toolCallId: message.toolCallId,
    ok,
    summary,
    rawOutput,
    truncatedOutput: rawOutput,
    rawOutputRef: {
      kind: "inline",
      value: rawOutput,
    },
    modelOutput: rawOutput,
    uiPreview: createToolUiPreview(tool?.previewKind ?? "generic", record?.args ?? {}, rawOutput, summary, ok),
    error: ok
      ? undefined
      : {
          code: "TOOL_ERROR",
          message: record?.result?.error ?? rawOutput,
          recoverable: true,
        },
    tokenEstimate: Math.ceil(rawOutput.length / 4),
  };
}

function createToolUiPreview(
  previewKind: ToolUiPreview["kind"],
  args: Record<string, unknown>,
  output: string,
  summary: string,
  ok: boolean,
): ToolUiPreview {
  switch (previewKind) {
    case "read": {
      const filePath = stringArg(args.path, "Unknown file");
      const displayPath = displayFileName(filePath);
      return {
        kind: "read",
        filePath: displayPath,
        range: getLineRange(args),
        displayText: getReadPreviewText(displayPath, getLineRange(args)),
      };
    }

    case "search": {
      const query = stringArg(args.query, "unknown");
      return {
        kind: "search",
        query,
        scope: typeof args.glob === "string" ? args.glob : undefined,
        resultCount: getSearchResultCount(output),
        displayText: summary,
      };
    }

    case "directory_list": {
      const path = stringArg(args.path, "Unknown directory");
      const displayPath = displayPathTail(path);
      return {
        kind: "directory_list",
        path: displayPath,
        entryCount: getDirectoryEntryCount(output),
        displayText: `Listed ${displayPath}`,
      };
    }

    case "edit_diff": {
      const filePath = stringArg(args.path, "Unknown file");
      return {
        kind: "edit_diff",
        filePath: displayFileName(filePath),
        additions: countDiffLines(output, "+"),
        deletions: countDiffLines(output, "-"),
        diff: output,
        collapsedLines: 5,
      };
    }

    case "bash": {
      const command = stringArg(args.command, "");
      return {
        kind: "bash",
        status: ok ? "success" : "failed",
        title: ok ? "Bash command" : "Bash command failed",
        command,
        commandPreview: command.split(/\s+/).slice(0, 3).join(" "),
        cwd: typeof args.cwd === "string" ? args.cwd : undefined,
        stdout: ok ? output : undefined,
        stderr: ok ? undefined : output,
      };
    }

    case "generic":
      return {
        kind: "generic",
        title: summary,
        content: output,
      };
  }
}

function getToolSummary(
  toolName: string,
  previewKind: ToolUiPreview["kind"],
  args: Record<string, unknown>,
  ok: boolean,
): string {
  if (!ok) return `Error in ${toolName}`;

  switch (previewKind) {
    case "read":
      return `Read ${displayFileName(stringArg(args.path, "file"))}`;
    case "search":
      return `Searched files for ${stringArg(args.query, "query")}`;
    case "directory_list":
      return `Listed ${displayPathTail(stringArg(args.path, "directory"))}`;
    case "edit_diff":
      return `Edited ${displayFileName(stringArg(args.path, "file"))}`;
    case "bash":
      return "Bash command";
    case "generic":
      if (toolName === "web_search") {
        const url = stringArg(args.url, "");
        const query = stringArg(args.query, "");
        return url ? `Fetching: ${url}` : `Searching: ${query || "..."}`;
      }
      return `Ran ${toolName}`;
  }
}

function stringArg(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function displayFileName(path: string): string {
  const normalized = path.replace(/[\\/]+$/, "");
  return normalized.split(/[\\/]+/).filter(Boolean).pop() ?? normalized ?? path;
}

function displayPathTail(path: string): string {
  const normalized = path.replace(/[\\/]+$/, "");
  return normalized.split(/[\\/]+/).filter(Boolean).pop() ?? normalized ?? path;
}

function getReadPreviewText(filePath: string, range?: string): string {
  return `Read ${filePath}${range ? ` ${range}` : ""}`;
}

function getLineRange(args: Record<string, unknown>): string | undefined {
  if (typeof args.offset !== "number") return undefined;
  if (typeof args.limit !== "number") return String(args.offset);
  return `${args.offset}-${args.offset + args.limit - 1}`;
}

function getSearchResultCount(output: string): number | undefined {
  const match = output.match(/^Found\s+(\d+)\s+match/);
  return match ? Number(match[1]) : undefined;
}

function getDirectoryEntryCount(output: string): number {
  if (output.trim() === "(empty directory)") return 0;
  return output.split("\n").filter((line) => line.trim().length > 0).length;
}

function countDiffLines(diff: string, marker: "+" | "-"): number {
  return diff
    .split("\n")
    .filter((line) => line.startsWith(marker) && !line.startsWith(`${marker}${marker}${marker}`)).length;
}

function mapAgentEventToStreamEvent(
  event: AgentEvent,
  sessionId: string,
  turnId: string,
  nextId: () => string,
  toolManager: ToolManager,
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
      {
        const tool = toolManager.get(event.toolName);
        const previewKind = tool?.previewKind ?? "generic";
        const summary = getToolSummary(event.toolName, previewKind, event.args, true);
        const preview = createToolUiPreview(previewKind, event.args, "", summary, true);
        const startedEvent: RuntimeStreamEvent = {
          type: "tool_started",
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          argsPreview: JSON.stringify(event.args).slice(0, 200),
          preview,
        };

        return startedEvent;
      }

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

  if (delta.type === "tool_call_delta") {
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
      return event;

    case "agent_end":
      return {
        type: event.type,
        messageCount: event.messages.length,
      };

    case "message_start":
      return {
        type: event.type,
        role: event.message.role,
        summary: summarizeMessage(event.message),
      };

    case "message_end":
      return {
        type: event.type,
        role: event.message.role,
        summary: summarizeMessage(event.message),
      };

    case "turn_start":
      return event;

    case "turn_end":
      return event;

    case "message_delta":
      return {
        type: event.type,
        deltaType: event.delta.type,
      };

    case "tool_start":
      return event;

    case "tool_end":
      return event;
  }
}

async function writeAgentEventRunLog(
  runLogger: AgentRunLogger | undefined,
  event: AgentEvent,
): Promise<void> {
  if (event.type === "message_delta") return;

  if (event.type === "message_end" && event.message.role === "assistant") {
    await writeAssistantMessageRunLog(runLogger, event.message);
  }

  if (event.type === "message_start" || event.type === "message_end") {
    await writeRunLog(runLogger, "agent_event", serializeAgentEvent(event));
    return;
  }

  await writeRunLog(runLogger, getRunLogEventType(event), serializeAgentEvent(event));
}

async function writeAssistantMessageRunLog(
  runLogger: AgentRunLogger | undefined,
  message: AssistantMessage,
): Promise<void> {
  const toolCalls = getToolCalls(message);
  for (const toolCall of toolCalls) {
    await writeRunLog(runLogger, "assistant_tool_call", {
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      arguments: toolCall.arguments,
      model: message.model,
      provider: message.provider,
      stopReason: message.stopReason,
    });
  }
}

function summarizeMessage(message: Message): Record<string, unknown> {
  if (message.role === "assistant") {
    const text = getTextContent(message);
    const thinking = getThinkingContent(message);
    const toolCalls = getToolCalls(message);
    return {
      stopReason: message.stopReason,
      model: message.model,
      provider: message.provider,
      textLength: text.length,
      thinkingLength: thinking.length,
      toolCallCount: toolCalls.length,
      toolCalls: toolCalls.map((toolCall) => ({
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        arguments: toolCall.arguments,
      })),
    };
  }

  if (message.role === "toolResult") {
    return {
      toolCallId: message.toolCallId,
      toolName: message.toolName,
      isError: message.isError,
      textLength: getMessageText(message).length,
    };
  }

  return {
    textLength: getMessageText(message).length,
  };
}

function getRunLogEventType(event: AgentEvent): "agent_event" | "tool_event" {
  return event.type === "tool_start" || event.type === "tool_end"
    ? "tool_event"
    : "agent_event";
}
