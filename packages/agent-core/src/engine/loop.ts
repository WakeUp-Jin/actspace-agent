/**
 * runAgentLoop — 纯函数双层循环执行引擎
 *
 * 不持有任何状态，通过参数接收依赖，通过事件回调通知外部。
 *
 * 双层 while 循环：
 * - 外层：处理 follow-up 消息
 * - 内层：处理 tool calls + steering 消息
 *
 * 终止条件：
 * 1. LLM 返回非 toolUse 且无 steering/follow-up 消息
 * 2. LLM 返回 error/aborted
 * 3. shouldStopAfterTurn 返回 true
 * 4. AbortSignal 被触发
 *
 * 设计参考：.agents/skills/llm-agent-dev/references/agent-runtime/agent-patterns.md
 * 代码参考：.agents/skills/llm-agent-dev/examples/agent-loop.ts
 */

import type {
  AssistantMessage,
  Context,
  Message,
  ToolResultMessage,
  ToolCallContent,
} from "../messages";
import type { ModelReasoningEffort } from "@actspace/shared";
import {
  MessagePriority,
  getToolCalls,
  hasToolCalls,
  createEmptyUsage,
  accumulateUsage,
} from "../messages";
import type { LLMService } from "../llm/types";
import type { ToolManager } from "../tools/manager";
import type {
  AgentEventSink,
  AgentLoopConfig,
  AgentLoopResult,
  LLMUsageCall,
  ToolExecutionMode,
} from "./types";
import type { CacheAuditPreparedCall, CacheAuditUsageMetadata } from "../observability/cache-audit";

const TRUNCATED_WRITE_TOOL_ERROR =
  "工具参数可能因模型输出长度限制被截断，已取消写入。请缩小内容，或先写骨架后用 edit_file 分段补齐。";
const WRITE_TOOL_NAMES = new Set(["write_file", "edit_file", "delete_file"]);

/** LLM 可重试错误的默认策略：最多 2 次重试（共 3 次尝试），退避 1s → 3s */
const DEFAULT_LLM_RETRY_MAX = 2;
const DEFAULT_LLM_RETRY_BACKOFF_MS = [1000, 3000];
const DEFAULT_MAX_TURNS = 200;

// ─── 核心循环入口 ───

export async function runAgentLoop(
  context: Context,
  llm: LLMService,
  config: AgentLoopConfig,
  emit: AgentEventSink,
  signal?: AbortSignal,
): Promise<AgentLoopResult> {
  const totalUsage = createEmptyUsage();
  const newMessages: Message[] = [];
  const usageCalls: LLMUsageCall[] = [];

  await emit({ type: "agent_start" });

  const outcome = await runDualLoop(context, newMessages, totalUsage, usageCalls, llm, config, emit, signal);

  await emit({ type: "agent_end", messages: newMessages });

  const latestAssistant = findLastAssistant(newMessages);
  const lastAssistant = outcome === "exhausted" && latestAssistant
    ? createMaxTurnsMessage(latestAssistant, config.maxTurns ?? DEFAULT_MAX_TURNS)
    : latestAssistant ?? (outcome === "aborted" ? createAbortedMessage() : undefined);
  if (!lastAssistant) {
    throw new Error("Agent loop ended without producing an assistant message");
  }

  return {
    status: outcome === "aborted"
      ? "aborted"
      : outcome === "exhausted" || lastAssistant.stopReason === "error" ? "failed" : "completed",
    message: lastAssistant,
    totalUsage,
    usageCalls,
    messages: newMessages,
  };
}

// ─── 双层循环 ───

async function runDualLoop(
  context: Context,
  newMessages: Message[],
  totalUsage: ReturnType<typeof createEmptyUsage>,
  usageCalls: LLMUsageCall[],
  llm: LLMService,
  config: AgentLoopConfig,
  emit: AgentEventSink,
  signal?: AbortSignal,
): Promise<"completed" | "aborted" | "exhausted"> {
  let turnIndex = 0;
  const maxTurns = config.maxTurns ?? DEFAULT_MAX_TURNS;
  let pendingMessages: Message[] = (await config.getSteeringMessages?.()) ?? [];

  // 外层：follow-up 消息处理
  while (true) {
    if (signal?.aborted) return "aborted";

    let hasMoreToolCalls = true;

    // 内层：tool calls + steering 消息处理
    while (hasMoreToolCalls || pendingMessages.length > 0) {
      if (signal?.aborted) return "aborted";
      if (turnIndex >= maxTurns) return "exhausted";

      turnIndex++;
      await emit({ type: "turn_start", turnIndex });

      // 注入 pending/steering 消息
      if (pendingMessages.length > 0) {
        for (const msg of pendingMessages) {
          context.messages.push(msg);
          newMessages.push(msg);
          await emit({ type: "message_start", message: msg });
          await emit({ type: "message_end", message: msg });
        }
        pendingMessages = [];
      }

      // 模型调用前：按 token 水位触发历史压缩（mid-loop）。
      // 压缩会用新数组替换会话历史，必须刷新 context.messages 引用，
      // 否则后续 push 落到旧数组、与 ConversationContext 失联。
      const compaction = await config.maybeCompact?.();
      if (compaction) {
        const { messages: compactedMessages, ...info } = compaction;
        context.messages = compactedMessages;
        await emit({ type: "context_compaction", info });
      }

      // 流式 LLM 调用（可重试错误自动重试，见 AgentLoopConfig.llmRetry）
      const maxRetries = config.llmRetry?.maxRetries ?? DEFAULT_LLM_RETRY_MAX;
      const backoffMs = config.llmRetry?.backoffMs ?? DEFAULT_LLM_RETRY_BACKOFF_MS;
      let retryCount = 0;
      let assistantMsg: AssistantMessage;

      while (true) {
        config.toolManager.commitProgressiveDisclosure();
        context.tools = config.refreshToolDefinitions?.() ?? config.toolManager.getToolDefinitions();
        const callId = `llm_call_${Date.now()}_${turnIndex}`;
        const cacheAuditCall = await prepareCacheAuditCall(config, context, callId, turnIndex);
        assistantMsg = await streamAssistantResponse(
          context,
          llm,
          signal,
          emit,
          config.thinkingEnabled,
          config.reasoningEffort,
        );
        const cacheAudit = await finishCacheAuditCall(config, cacheAuditCall, assistantMsg);
        // 失败尝试的 usage 也照常累进：钱已经花了，计费审计不能丢
        newMessages.push(assistantMsg);
        accumulateUsage(totalUsage, assistantMsg.usage);
        usageCalls.push({ callId, message: assistantMsg, usage: assistantMsg.usage, ...(cacheAudit ? { cacheAudit } : {}) });

        const shouldRetry =
          assistantMsg.stopReason === "error" &&
          assistantMsg.errorRetryable === true &&
          retryCount < maxRetries &&
          !signal?.aborted;
        if (!shouldRetry) break;

        retryCount++;
        // 必须弹出 streamAssistantResponse push 进 context 的 error message：
        // 脏消息会污染下一次请求，还会破坏 prompt cache 前缀。
        if (context.messages[context.messages.length - 1] === assistantMsg) {
          context.messages.pop();
        }
        await emit({
          type: "llm_retry",
          attempt: retryCount,
          maxAttempts: maxRetries,
          reason: assistantMsg.errorMessage ?? "LLM error",
        });
        const delay = backoffMs[Math.min(retryCount - 1, backoffMs.length - 1)] ?? 0;
        const abortedDuringBackoff = await sleepWithAbort(delay, signal);
        if (abortedDuringBackoff) break;
      }

      // 错误/中止 → 直接退出
      if (assistantMsg.stopReason === "error" || assistantMsg.stopReason === "aborted") {
        await emit({ type: "turn_end", turnIndex, message: assistantMsg, toolResults: [] });
        return assistantMsg.stopReason === "aborted" ? "aborted" : "completed";
      }

      // 处理 tool calls
      const toolResults: ToolResultMessage[] = [];
      hasMoreToolCalls = false;

      if (assistantMsg.stopReason === "toolUse") {
        const toolCalls = getToolCalls(assistantMsg);
        const results = await executeToolCalls(
          config.toolManager,
          toolCalls,
          config.toolExecution ?? "sequential",
          emit,
          {
            ...config.toolExecuteOptions,
            signal,
            blockWriteToolsForTruncatedAssistant: hasRawLengthStopReason(assistantMsg),
          },
        );

        for (const toolMsg of results) {
          context.messages.push(toolMsg);
          newMessages.push(toolMsg);
          await emit({ type: "message_start", message: toolMsg });
          await emit({ type: "message_end", message: toolMsg });
          toolResults.push(toolMsg);
        }
        hasMoreToolCalls = true;
      }

      await emit({ type: "turn_end", turnIndex, message: assistantMsg, toolResults });

      if (signal?.aborted) {
        return "aborted";
      }

      // 安全阀检查
      if (config.shouldStopAfterTurn?.({ message: assistantMsg, turnIndex })) {
        return "completed";
      }

      // maxTurns 硬限制，防止无限循环
      if (hasMoreToolCalls && turnIndex >= maxTurns) {
        return "exhausted";
      }

      // 获取 steering 消息
      pendingMessages = (await config.getSteeringMessages?.()) ?? [];
    }

    // 外层：检查 follow-up
    const followUps = (await config.getFollowUpMessages?.()) ?? [];
    if (followUps.length > 0) {
      pendingMessages = followUps;
      continue;
    }

    return signal?.aborted ? "aborted" : "completed";
  }
}

// ─── 流式 LLM 调用 ───

async function streamAssistantResponse(
  context: Context,
  llm: LLMService,
  signal: AbortSignal | undefined,
  emit: AgentEventSink,
  thinkingEnabled: boolean | undefined,
  reasoningEffort: ModelReasoningEffort | undefined,
): Promise<AssistantMessage> {
  const stream = llm.stream(context, { signal, thinkingEnabled, reasoningEffort });

  for await (const event of stream) {
    switch (event.type) {
      case "text_delta":
      case "thinking_delta":
      case "tool_call_delta":
        await emit({ type: "message_delta", delta: event });
        break;

      case "done": {
        const msg = event.message;
        if (hasToolCalls(msg)) {
          msg.priority ??= MessagePriority.HIGH;
        }
        context.messages.push(msg);
        await emit({ type: "message_end", message: msg });
        return msg;
      }

      case "error": {
        const errMsg = event.message;
        context.messages.push(errMsg);
        await emit({ type: "message_end", message: errMsg });
        return errMsg;
      }
    }
  }

  throw new Error("Stream ended without producing a message");
}

// ─── 工具调用执行 ───

async function executeToolCalls(
  toolManager: ToolManager,
  toolCalls: ToolCallContent[],
  mode: ToolExecutionMode,
  emit: AgentEventSink,
  toolExecuteOptions?: import("../tools/manager").ToolExecuteOptions,
): Promise<ToolResultMessage[]> {
  const execOne = async (tc: ToolCallContent): Promise<ToolResultMessage> => {
    await emit({
      type: "tool_start",
      toolCallId: tc.id,
      toolName: tc.name,
      args: tc.arguments,
    });

    const shouldBlock =
      toolExecuteOptions?.blockWriteToolsForTruncatedAssistant === true &&
      WRITE_TOOL_NAMES.has(tc.name);
    const result = shouldBlock
      ? { success: false, error: TRUNCATED_WRITE_TOOL_ERROR }
      : await toolManager.execute(tc.name, tc.arguments, tc.id, toolExecuteOptions);

    await emit({
      type: "tool_end",
      toolCallId: tc.id,
      toolName: tc.name,
      result,
      isError: !result.success,
    });

    // ToolResult.content preserves rich model inputs such as images; otherwise
    // ToolResult.data is rendered as ordinary text.
    const textContent = typeof result.data === "string"
      ? result.data
      : result.success
        ? JSON.stringify(result.data ?? "")
        : (result.error ?? "Unknown error");
    const content = result.content?.length
      ? result.content
      : [{ type: "text" as const, text: textContent }];

    return {
      role: "toolResult",
      toolCallId: tc.id,
      toolName: tc.name,
      content,
      isError: !result.success,
      timestamp: Date.now(),
      source: `tool:${tc.name}`,
      priority: MessagePriority.HIGH,
    };
  };

  if (mode === "parallel") {
    return Promise.all(toolCalls.map(execOne));
  }

  const results: ToolResultMessage[] = [];
  for (const tc of toolCalls) {
    results.push(await execOne(tc));
  }
  return results;
}

// ─── 工具函数 ───

/** 可中断的退避 sleep；返回 true 表示等待期间被 abort。 */
function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(true);
  if (ms <= 0) return Promise.resolve(false);
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve(false);
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function hasRawLengthStopReason(message: AssistantMessage): boolean {
  return message.diagnostics?.some((entry) => entry.rawStopReason === "length") ?? false;
}

function findLastAssistant(messages: Message[]): AssistantMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "assistant") return msg;
  }
  return undefined;
}

function createAbortedMessage(): AssistantMessage {
  return {
    role: "assistant",
    content: [],
    model: "unknown",
    provider: "unknown",
    usage: createEmptyUsage(),
    stopReason: "aborted",
    errorMessage: "User stopped the turn",
    timestamp: Date.now(),
  };
}

function createMaxTurnsMessage(lastAssistant: AssistantMessage, maxTurns: number): AssistantMessage {
  const errorMessage = `Agent reached maxTurns (${maxTurns}) before producing a final response`;
  return {
    ...lastAssistant,
    content: [{ type: "text", text: errorMessage }],
    stopReason: "error",
    errorMessage,
    errorKind: "max_turns",
    errorRetryable: false,
    timestamp: Date.now(),
  };
}

async function prepareCacheAuditCall(
  config: AgentLoopConfig,
  context: Context,
  callId: string,
  turnIndex: number,
): Promise<CacheAuditPreparedCall | null> {
  if (!config.cacheAudit) return null;
  try {
    return await config.cacheAudit.beforeLlmCall(context, { callId, turnIndex });
  } catch (error) {
    console.error("[cache-audit] beforeLlmCall failed", error);
    return null;
  }
}

async function finishCacheAuditCall(
  config: AgentLoopConfig,
  call: CacheAuditPreparedCall | null,
  message: AssistantMessage,
): Promise<CacheAuditUsageMetadata | null> {
  if (!config.cacheAudit) return null;
  try {
    return await config.cacheAudit.afterLlmCall(call, message);
  } catch (error) {
    console.error("[cache-audit] afterLlmCall failed", error);
    return null;
  }
}
