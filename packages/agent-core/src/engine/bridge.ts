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
  AttachmentAnalysis,
  ComposerAttachment,
  RuntimeStreamEvent,
  SessionEvent,
  ContextUsageSnapshot,
  ContextState,
  ContextStateEntry,
  ContextCompactionPayload,
  LlmUsagePayload,
  ToolExecutionResult,
  ToolOutputRef,
  ToolPreviewKind,
  ToolUiPreview,
} from "@actspace/shared";
import { resolveModelSpecByApiModel } from "@actspace/shared";
import { estimateTokens } from "../context/token-estimator";
import type { LLMService } from "../llm/types";
import type { ToolManager } from "../tools/manager";
import type { ContextManager } from "../context/manager";
import type { Summarizer } from "../context/compression/summarizer";
import type { AgentRunLogger } from "../observability";
import type { CacheAuditTracker } from "../observability/cache-audit";
import type { ToolResult } from "../internal-tools";
import { Agent } from "./agent";
import type { AgentEvent, AgentLoopResult, ContextCompactionInfo, LLMUsageCall, ToolExecutionMode } from "./types";
import { extractStreamingPreview } from "./streaming-preview-extractors";
import {
  createPersistedSessionEvent,
  formatUserMessageForModel,
  messageToEvents,
  userMessageToEvents,
  toAssistantReply,
  contextSnapshotToEvent,
} from "../adapters";
import { getTextContent, getThinkingContent, getToolCalls, getMessageText } from "../messages";
import type { AssistantMessage, Context, Message, ToolResultMessage, UserMessage } from "../messages";
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

type ToolCallStreamingEntry = {
  toolName: string;
  previewKind: ToolPreviewKind;
  partialArgsText: string;
  lastEmitMs: number;
  emittedInitial: boolean;
};

/** 节流：write_file 1300 字符 content 在该间隔下约 26 帧，足够流畅且不爆事件 */
const TOOL_CALL_STREAMING_THROTTLE_MS = 50;

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
  attachments?: ComposerAttachment[];
  attachmentAnalyses?: AttachmentAnalysis[];
  thinkingEnabled?: boolean;
}

export interface RunTurnWithAgentDeps {
  llm: LLMService;
  toolManager: ToolManager;
  contextManager: ContextManager;
  toolExecution?: ToolExecutionMode;
  thinkingEnabled?: boolean;
  /** flash 摘要器，透传给 Agent 用于 mid-loop 历史压缩 */
  summarizer?: Summarizer;
  /** 低缓存旁路审计器；只写本地 cache-audit 文件与 llm_usage 索引。 */
  cacheAudit?: CacheAuditTracker;
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
  const toolCallStreaming = new Map<string, ToolCallStreamingEntry>();
  const compactions: ContextCompactionInfo[] = [];

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
    summarizer: deps.summarizer,
    cacheAudit: deps.cacheAudit,
    onEvent: async (agentEvent) => {
      recordToolExecution(toolExecutions, agentEvent);
      if (agentEvent.type === "context_compaction") {
        compactions.push(agentEvent.info);
      }
      logAgentEvent(agentEvent, sessionId, turnId, streamStats);
      const bufferedStreamDelta = bufferStreamLogDelta(agentEvent, streamLogBuffer);
      if (!bufferedStreamDelta) {
        await flushStreamLogBuffer(runLogger, streamLogBuffer);
        await writeAgentEventRunLog(runLogger, agentEvent);
      }
      if (!streamCb) return;
      const mapped = mapAgentEventToStreamEvent(agentEvent, sessionId, turnId, nextEventId, deps.toolManager, toolCallStreaming);
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
    loopResult = await agent.run(formatUserMessageForModel(userInput, input.attachments, input.attachmentAnalyses));
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

  const sessionEvents = buildSessionEvents(loopResult, sessionId, turnId, input, deps.toolManager, toolExecutions);
  for (const info of compactions) {
    sessionEvents.push(createCompactionEvent(info, sessionId, turnId));
  }
  const contextSnapshot = deps.contextManager.getUsageSnapshot();
  // 方案 B：持久化只存 token 统计（buckets/总量），不再随每轮写盘塞逐条明细。
  // 完整逐条内容由 main 进程 `context:describe` 打开视图时现场重算（见 context-describe-service）。
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

/**
 * 把一条会话消息转成「标题 + 全文正文」。
 *
 * 按用户决策「用 title 编码 role、不扩字段」：role 信息全部塞进 title，
 * entry 结构维持不变（kind 仍是 conversation）。
 */
function describeMessageEntry(message: Message): { title: string; preview?: string } {
  const text = getMessageText(message).trim();
  if (message.role === "assistant") {
    if (text) return { title: "Assistant", preview: text };
    const toolCalls = getToolCalls(message);
    if (toolCalls.length > 0) {
      return { title: "Assistant · 工具调用", preview: `调用工具：${toolCalls.map((call) => call.name).join("、")}` };
    }
    return { title: "Assistant" };
  }
  if (message.role === "toolResult") {
    return { title: `Tool · ${message.toolName}`, preview: text || undefined };
  }
  return { title: "User", preview: text || undefined };
}

/**
 * 为 Context 完整视图「逐条」生成 entries（全文，不截断）。
 *
 * 仅由 main 进程 `context:describe` 打开视图时现场调用（不调用 LLM），不参与每轮持久化。
 * - systemPrompt / rules / skills：按 ContextManager 提供的 systemPromptParts 来源分条。
 * - tools：每个工具一条，title=工具名，preview=完整描述。
 * - summarizedConversation：每条历史压缩摘要一条。
 * - conversation：每条普通消息一条，title 编码 role（User / Assistant / Tool·xxx）。
 *
 */
export function buildContextEntries(ctx: Context): ContextStateEntry[] {
  const entries: ContextStateEntry[] = [];

  if (ctx.systemPromptParts && ctx.systemPromptParts.length > 0) {
    ctx.systemPromptParts.forEach((part, index) => {
      const content = part.content.trim();
      if (!content) return;
      entries.push({
        id: `ctx_${part.bucket}_${part.id}_${index}`,
        kind: part.bucket === "rules" || part.bucket === "skills" ? part.bucket : "systemPrompt",
        title: part.title,
        estimatedTokens: estimateTokens(content),
        included: true,
        removable: false,
        preview: content,
      });
    });
  } else {
    const systemPrompt = ctx.systemPrompt?.trim();
    if (systemPrompt) {
      entries.push({
        id: "ctx_systemPrompt",
        kind: "systemPrompt",
        title: "System prompt",
        estimatedTokens: estimateTokens(systemPrompt),
        included: true,
        removable: false,
        preview: systemPrompt,
      });
    }
  }

  ctx.tools?.forEach((tool, index) => {
    const description = tool.description?.trim();
    entries.push({
      id: `ctx_tool_${index}`,
      kind: "toolDefinitions",
      title: tool.name,
      estimatedTokens: estimateTokens(JSON.stringify(tool)),
      included: true,
      removable: false,
      ...(description ? { preview: description } : {}),
    });
  });

  const isSummary = (m: Message) => m.role === "user" && m.source === "compaction";
  let conversationIndex = 0;
  let summaryIndex = 0;
  for (const message of ctx.messages) {
    if (isSummary(message)) {
      const text = getMessageText(message).trim();
      entries.push({
        id: `ctx_summary_${summaryIndex++}`,
        kind: "summarizedConversation",
        title: "历史摘要",
        estimatedTokens: estimateTokens(text),
        included: true,
        removable: false,
        ...(text ? { preview: text } : {}),
      });
      continue;
    }
    const { title, preview } = describeMessageEntry(message);
    entries.push({
      id: `ctx_message_${conversationIndex++}`,
      kind: "conversation",
      title,
      estimatedTokens: estimateTokens(getMessageText(message)),
      included: true,
      removable: false,
      ...(preview ? { preview } : {}),
    });
  }

  return entries;
}

/**
 * 组装 ContextState。
 *
 * `entries` 缺省为空：每轮 turn 的持久化走方案 B（只存 token 统计），
 * 逐条明细仅在 `context:describe` 现场重算时通过 `buildContextEntries` 传入。
 */
export function createContextState(
  snapshot: ContextUsageSnapshot,
  sessionId: string,
  turnId: string,
  entries: ContextStateEntry[] = [],
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
    entries,
  };
}

function buildSessionEvents(
  result: AgentLoopResult,
  sessionId: string,
  turnId: string,
  input: RunTurnWithAgentInput,
  toolManager: ToolManager,
  toolExecutions: Map<string, ToolExecutionRecord>,
): SessionEvent[] {
  const userMessage: UserMessage = {
    role: "user",
    content: input.userInput,
    timestamp: Date.now(),
    source: "user",
  };
  const events: SessionEvent[] = userMessageToEvents(userMessage, sessionId, turnId, {
    attachments: input.attachments,
    attachmentAnalyses: input.attachmentAnalyses,
  });
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
      events.push(createLlmUsageEvent(
        usageCall,
        msg,
        sessionId,
        turnId,
        relatedEventIds,
        `llm_call_${turnId}_${usageCallIndex}`,
      ));
    }
  }
  return events;
}

function createLlmUsageEvent(
  usageCall: LLMUsageCall | undefined,
  message: AssistantMessage,
  sessionId: string,
  turnId: string,
  relatedEventIds: string[],
  fallbackCallId: string,
): SessionEvent<LlmUsagePayload> {
  const modelSpec = resolveModelSpecByApiModel(message.model, message.provider as "deepseek" | "kimi" | undefined);
  const payload: LlmUsagePayload = {
    callId: usageCall?.callId ?? fallbackCallId,
    provider: message.provider,
    model: message.model,
    modelId: modelSpec?.id,
    promptTokens: message.usage.input,
    completionTokens: message.usage.output,
    totalTokens: message.usage.totalTokens,
    reasoningTokens: message.usage.reasoning || undefined,
    cacheHitTokens: message.usage.cacheHit || message.usage.cacheRead || undefined,
    cacheMissTokens: message.usage.cacheMiss || undefined,
    serverToolUse: message.usage.serverToolUse,
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
  if (usageCall?.cacheAudit?.cacheStatus !== undefined) {
    payload.cacheStatus = usageCall.cacheAudit.cacheStatus;
  }
  if (usageCall?.cacheAudit?.cacheAuditId) {
    payload.cacheAuditId = usageCall.cacheAudit.cacheAuditId;
  }
  if (usageCall?.cacheAudit?.cacheHitRatio !== undefined) {
    payload.cacheHitRatio = usageCall.cacheAudit.cacheHitRatio;
  }

  return createPersistedSessionEvent(sessionId, turnId, "llm_usage", payload);
}

function createCompactionEvent(
  info: ContextCompactionInfo,
  sessionId: string,
  turnId: string,
): SessionEvent<ContextCompactionPayload> {
  const payload: ContextCompactionPayload = {
    triggerTokens: info.triggerTokens,
    thresholdTokens: info.thresholdTokens,
    beforeCount: info.beforeCount,
    afterCount: info.afterCount,
    summaryChars: info.summaryChars,
    historyRefPath: info.historyRefPath,
  };
  return createPersistedSessionEvent(sessionId, turnId, "context_compaction", payload);
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
  // message 文本 = 回填给 LLM 的内容（bash 头部 / 非 bash 摘要 / 或原样穿透）
  const modelOutput = getMessageText(message);
  const ok = !message.isError;
  const summary = getToolSummary(message.toolName, tool?.previewKind ?? "generic", record?.args ?? {}, ok);

  // outputRef 由 executor（bash 落盘）/ OutputTruncator（inline 全量原文）填充
  const outputRef = record?.result?.outputRef;
  let rawOutput: string;
  let rawOutputRef: ToolOutputRef;
  if (outputRef?.kind === "file") {
    // 完整原文已落盘，inline 处只放头部，rawOutputRef 指向文件
    rawOutput = modelOutput;
    rawOutputRef = outputRef;
  } else if (outputRef?.kind === "inline") {
    // 全量原文随 ref 内联返回，modelOutput 为摘要
    rawOutput = outputRef.value;
    rawOutputRef = outputRef;
  } else {
    rawOutput = modelOutput;
    rawOutputRef = { kind: "inline", value: modelOutput };
  }

  return {
    toolName: message.toolName,
    toolCallId: message.toolCallId,
    ok,
    summary,
    rawOutput,
    truncatedOutput: modelOutput,
    rawOutputRef,
    modelOutput,
    uiPreview: createToolUiPreview(tool?.previewKind ?? "generic", record?.args ?? {}, modelOutput, summary, ok),
    error: ok
      ? undefined
      : {
          code: "TOOL_ERROR",
          message: record?.result?.error ?? modelOutput,
          recoverable: true,
        },
    tokenEstimate: Math.ceil(modelOutput.length / 4),
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

    case "grep": {
      const pattern = stringArg(args.pattern, "unknown");
      return {
        kind: "grep",
        pattern,
        scope: getGrepScope(args),
        resultCount: getSearchResultCount(output),
        displayText: summary,
      };
    }

    case "glob": {
      const pattern = stringArg(args.pattern, "unknown");
      return {
        kind: "glob",
        pattern,
        scope: typeof args.path === "string" ? args.path : undefined,
        resultCount: getGlobResultCount(output),
        displayText: summary,
      };
    }

    case "web_search": {
      const url = stringArg(args.url, "");
      if (url) {
        return {
          kind: "web_search",
          mode: "url",
          url,
          displayText: `Read Web Page ${url}`,
        };
      }

      const query = stringArg(args.query, "");
      return {
        kind: "web_search",
        mode: "query",
        query,
        displayText: `Web Search ${query || "..."}`,
      };
    }

    case "media_analysis": {
      const source = stringArg(args.source, "media");
      const mediaName = displayFileName(source);
      const mediaKind = getMediaKind(args);
      return {
        kind: "media_analysis",
        mediaName,
        mediaKind,
        displayText: getMediaAnalysisPreviewText(mediaName, mediaKind),
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

    case "write": {
      const filePath = stringArg(args.path, "Unknown file");
      const hasOutput = output.length > 0;
      return {
        kind: "write",
        filePath: displayFileName(filePath),
        additions: hasOutput ? countDiffLines(output, "+") : 0,
        deletions: hasOutput ? countDiffLines(output, "-") : 0,
        diff: hasOutput ? output : "",
        collapsedLines: 5,
        // tool_started 阶段（output=""）保留完整 content 作为 streamingContent，
        // 让 step 2 → step 3 过渡时前端 code preview 不闪烁消失；
        // tool_finished 阶段（output 含 diff）不设 streamingContent，diff 视图接管
        streamingContent: hasOutput ? undefined : (typeof args.content === "string" ? args.content : undefined),
      };
    }

    case "bash": {
      const command = stringArg(args.command, "");
      const intent = typeof args.intent === "string" && args.intent.trim().length > 0 ? args.intent.trim() : undefined;
      return {
        kind: "bash",
        status: ok ? "success" : "failed",
        title: ok ? "Bash command" : "Bash command failed",
        command,
        commandPreview: command.split(/\s+/).slice(0, 3).join(" "),
        cwd: typeof args.cwd === "string" ? args.cwd : undefined,
        stdout: ok ? output : undefined,
        stderr: ok ? undefined : output,
        intent,
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
    case "grep": {
      const pattern = stringArg(args.pattern, "pattern");
      const scope = getGrepScope(args);
      return `Grep ${pattern}${scope ? ` in ${scope}` : ""}`;
    }
    case "glob": {
      const pattern = stringArg(args.pattern, "pattern");
      const scope = typeof args.path === "string" ? args.path : undefined;
      return `Glob ${pattern}${scope ? ` in ${scope}` : ""}`;
    }
    case "web_search": {
      const url = stringArg(args.url, "");
      const query = stringArg(args.query, "");
      return url ? `Read Web Page ${url}` : `Web Search ${query || "..."}`;
    }
    case "media_analysis": {
      const mediaName = displayFileName(stringArg(args.source, "media"));
      return getMediaAnalysisPreviewText(mediaName, getMediaKind(args));
    }
    case "directory_list":
      return `Listed ${displayPathTail(stringArg(args.path, "directory"))}`;
    case "edit_diff":
      return `Edit ${displayFileName(stringArg(args.path, "file"))}`;
    case "write":
      return `Write ${displayFileName(stringArg(args.path, "file"))}`;
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

function getMediaAnalysisPreviewText(mediaName: string, mediaKind: "image" | "video" | "media"): string {
  const label = mediaKind === "image" ? "image" : mediaKind === "video" ? "video" : "media";
  return `Analyze ${label} ${mediaName}`;
}

function getMediaKind(args: Record<string, unknown>): "image" | "video" | "media" {
  const mimeType = typeof args.mimeType === "string" ? args.mimeType : "";
  const source = typeof args.source === "string" ? args.source : "";
  if (mimeType.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg|heic|heif)$/i.test(source)) {
    return "image";
  }
  if (mimeType.startsWith("video/") || /\.(mp4|mov|webm|mkv|avi)$/i.test(source)) {
    return "video";
  }
  return "media";
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

function getGlobResultCount(output: string): number | undefined {
  const match = output.match(/^Found\s+(\d+)\s+file/);
  return match ? Number(match[1]) : undefined;
}

function getGrepScope(args: Record<string, unknown>): string | undefined {
  if (typeof args.glob === "string" && args.glob.length > 0) {
    return args.glob;
  }

  return typeof args.path === "string" && args.path.length > 0 ? args.path : undefined;
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
  toolCallStreaming: Map<string, ToolCallStreamingEntry>,
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
      if (delta.type === "tool_call_delta") {
        return handleToolCallDelta(delta, toolManager, toolCallStreaming);
      }
      return null;
    }

    case "tool_start":
      {
        // tool_start 进入实际执行阶段，清理对应的 streaming 累积状态
        toolCallStreaming.delete(event.toolCallId);

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

    case "tool_approval_required":
      return {
        type: "tool_approval_required",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        requestId: event.request.id,
        summary: event.request.summary,
        reason: event.request.reason,
        command: typeof event.request.args.command === "string" ? event.request.args.command : undefined,
        riskLevel: event.request.riskLevel,
      };

    case "tool_approval_resolved":
      return {
        type: "tool_approval_resolved",
        toolCallId: event.toolCallId,
        requestId: event.decision.requestId,
        decision: event.decision.decision,
      };

    case "agent_end":
      // turn 结束时清空累积状态，防内存泄漏
      toolCallStreaming.clear();
      return null;

    case "turn_start":
    case "turn_end":
    case "message_start":
    case "message_end":
    // 历史压缩仅作观测落 run-log / session.jsonl，本期不向 renderer 推流式事件。
    case "context_compaction":
      return null;
  }
}

function handleToolCallDelta(
  delta: { toolCallId?: string; toolName?: string; delta: string },
  toolManager: ToolManager,
  toolCallStreaming: Map<string, ToolCallStreamingEntry>,
): RuntimeStreamEvent | null {
  if (!delta.toolCallId || !delta.toolName) return null;
  const spec = toolManager.get(delta.toolName);
  if (!spec) return null;
  const previewKind = spec.previewKind ?? "generic";

  let entry = toolCallStreaming.get(delta.toolCallId);
  if (!entry) {
    entry = {
      toolName: delta.toolName,
      previewKind,
      partialArgsText: "",
      lastEmitMs: 0,
      emittedInitial: false,
    };
    toolCallStreaming.set(delta.toolCallId, entry);
  }
  entry.partialArgsText += delta.delta;

  const now = Date.now();
  if (entry.emittedInitial && now - entry.lastEmitMs < TOOL_CALL_STREAMING_THROTTLE_MS) {
    return null;
  }

  const isInitial = !entry.emittedInitial;
  entry.emittedInitial = true;
  entry.lastEmitMs = now;

  return {
    type: "tool_call_streaming",
    toolCallId: delta.toolCallId,
    toolName: delta.toolName,
    isInitial,
    preview: extractStreamingPreview(previewKind, entry.partialArgsText),
  };
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

    case "tool_approval_required":
      logAgentRun("tool approval required", {
        sessionId,
        turnId,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        requestId: event.request.id,
        riskLevel: event.request.riskLevel,
      });
      return;

    case "tool_approval_resolved":
      logAgentRun("tool approval resolved", {
        sessionId,
        turnId,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        decision: event.decision.decision,
      });
      return;

    case "context_compaction":
      logAgentRun("history compacted", {
        sessionId,
        turnId,
        triggerTokens: event.info.triggerTokens,
        thresholdTokens: event.info.thresholdTokens,
        beforeCount: event.info.beforeCount,
        afterCount: event.info.afterCount,
        summaryChars: event.info.summaryChars,
        reason: event.info.reason,
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
  return (
    event.type === "assistant_text_delta" ||
    event.type === "assistant_thinking_delta" ||
    event.type === "tool_call_streaming"
  );
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

    case "tool_approval_required":
      return {
        type: event.type,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        requestId: event.request.id,
        summary: event.request.summary,
        riskLevel: event.request.riskLevel,
      };

    case "tool_approval_resolved":
      return {
        type: event.type,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        decision: event.decision.decision,
      };

    case "context_compaction":
      return {
        type: event.type,
        ...event.info,
      };
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
      serverToolUse: message.usage.serverToolUse,
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

function getRunLogEventType(event: AgentEvent): "agent_event" | "tool_event" | "context_compaction" {
  if (event.type === "tool_start" || event.type === "tool_end") return "tool_event";
  if (event.type === "context_compaction") return "context_compaction";
  return "agent_event";
}
