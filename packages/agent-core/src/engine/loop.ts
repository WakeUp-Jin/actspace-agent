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

  await runDualLoop(context, newMessages, totalUsage, usageCalls, llm, config, emit, signal);

  await emit({ type: "agent_end", messages: newMessages });

  const lastAssistant = findLastAssistant(newMessages);
  if (!lastAssistant) {
    throw new Error("Agent loop ended without producing an assistant message");
  }

  return { message: lastAssistant, totalUsage, usageCalls, messages: newMessages };
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
): Promise<void> {
  let turnIndex = 0;
  let pendingMessages: Message[] = (await config.getSteeringMessages?.()) ?? [];

  // 外层：follow-up 消息处理
  while (true) {
    if (signal?.aborted) break;

    let hasMoreToolCalls = true;

    // 内层：tool calls + steering 消息处理
    while (hasMoreToolCalls || pendingMessages.length > 0) {
      if (signal?.aborted) break;

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

      // 流式 LLM 调用
      const callId = `llm_call_${Date.now()}_${turnIndex}`;
      const assistantMsg = await streamAssistantResponse(context, llm, signal, emit, config.thinkingEnabled);
      newMessages.push(assistantMsg);
      accumulateUsage(totalUsage, assistantMsg.usage);
      usageCalls.push({ callId, message: assistantMsg, usage: assistantMsg.usage });

      // 错误/中止 → 直接退出
      if (assistantMsg.stopReason === "error" || assistantMsg.stopReason === "aborted") {
        await emit({ type: "turn_end", turnIndex, message: assistantMsg, toolResults: [] });
        return;
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

      // 安全阀检查
      if (config.shouldStopAfterTurn?.({ message: assistantMsg, turnIndex })) {
        return;
      }

      // maxTurns 硬限制，防止无限循环
      if (turnIndex >= (config.maxTurns ?? 50)) {
        return;
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

    break;
  }
}

// ─── 流式 LLM 调用 ───

async function streamAssistantResponse(
  context: Context,
  llm: LLMService,
  signal: AbortSignal | undefined,
  emit: AgentEventSink,
  thinkingEnabled: boolean | undefined,
): Promise<AssistantMessage> {
  const stream = llm.stream(context, { signal, thinkingEnabled });

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
): Promise<ToolResultMessage[]> {
  const execOne = async (tc: ToolCallContent): Promise<ToolResultMessage> => {
    await emit({
      type: "tool_start",
      toolCallId: tc.id,
      toolName: tc.name,
      args: tc.arguments,
    });

    const result = await toolManager.execute(tc.name, tc.arguments);

    await emit({
      type: "tool_end",
      toolCallId: tc.id,
      toolName: tc.name,
      result,
      isError: !result.success,
    });

    // ToolResult.data → 文本内容
    const textContent = result.success
      ? (typeof result.data === "string" ? result.data : JSON.stringify(result.data ?? ""))
      : (result.error ?? "Unknown error");

    return {
      role: "toolResult",
      toolCallId: tc.id,
      toolName: tc.name,
      content: [{ type: "text", text: textContent }],
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

function findLastAssistant(messages: Message[]): AssistantMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "assistant") return msg;
  }
  return undefined;
}
