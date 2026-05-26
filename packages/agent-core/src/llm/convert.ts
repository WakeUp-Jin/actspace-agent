/**
 * LLM 共享转换工具
 *
 * 集中所有 provider 共用的消息转换、工具转换、流式 chunk 处理和错误映射逻辑。
 * DeepSeekService 和 KimiService 从此文件导入，避免重复代码。
 *
 * 防御性处理（参考 pi-ai transform-messages.ts）：
 * - 跳过 stopReason === "error" | "aborted" 的 assistant messages
 * - 为孤儿 tool calls 插入 synthetic toolResult
 * - 跳过完全空的 assistant messages
 */

import OpenAI from "openai";
import type {
  Context,
  AssistantMessage,
  TextContent,
  ThinkingContent,
  ToolCallContent,
  ImageContent,
  StopReason,
  Tool,
  Message,
  ToolResultMessage,
  Usage,
} from "../messages";
import { createEmptyUsage } from "../messages";
import type {
  AssistantMessageEvent,
  APIRequestTool,
  LLMConfig,
} from "./types";
import { LLMServiceError } from "./types";

// ─── 消息格式转换 ───

export function convertMessages(context: Context): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const result: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

  if (context.systemPrompt) {
    result.push({ role: "system", content: context.systemPrompt });
  }

  const sanitized = sanitizeMessages(context.messages);

  for (const msg of sanitized) {
    switch (msg.role) {
      case "user":
        result.push({ role: "user", content: toUserContent(msg.content) });
        break;

      case "assistant": {
        const textParts = msg.content.filter((c): c is TextContent => c.type === "text");
        const toolCallParts = msg.content.filter((c): c is ToolCallContent => c.type === "toolCall");
        const textStr = textParts.map((t) => t.text).join("");
        const hasContent = textStr.length > 0;
        const hasTools = toolCallParts.length > 0;

        if (!hasContent && !hasTools) continue;

        const assistantMsg: OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam = {
          role: "assistant",
          content: hasContent ? textStr : null,
        };
        if (hasTools) {
          assistantMsg.tool_calls = toolCallParts.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
          }));
        }
        result.push(assistantMsg);
        break;
      }

      case "toolResult": {
        const text = msg.content
          .filter((c): c is TextContent => c.type === "text")
          .map((c) => c.text)
          .join("");
        result.push({ role: "tool", tool_call_id: msg.toolCallId, content: text });
        break;
      }
    }
  }

  return result;
}

/**
 * 防御性消息清理：
 * 1. 跳过 error/aborted 的 assistant messages（不完整的回复不应回放给 API）
 * 2. 为孤儿 tool calls 插入 synthetic toolResult（API 要求每个 tool_call 有对应 tool role 回复）
 */
function sanitizeMessages(messages: Message[]): Message[] {
  const result: Message[] = [];
  let pendingToolCalls: ToolCallContent[] = [];
  const existingToolResultIds = new Set<string>();

  const flushOrphanedToolCalls = () => {
    for (const tc of pendingToolCalls) {
      if (!existingToolResultIds.has(tc.id)) {
        result.push({
          role: "toolResult",
          toolCallId: tc.id,
          toolName: tc.name,
          content: [{ type: "text", text: "No result provided" }],
          isError: true,
          timestamp: Date.now(),
        } as ToolResultMessage);
      }
    }
    pendingToolCalls = [];
    existingToolResultIds.clear();
  };

  for (const msg of messages) {
    if (msg.role === "assistant") {
      flushOrphanedToolCalls();

      if (msg.stopReason === "error" || msg.stopReason === "aborted") {
        continue;
      }

      const toolCalls = msg.content.filter((b): b is ToolCallContent => b.type === "toolCall");
      if (toolCalls.length > 0) {
        pendingToolCalls = toolCalls;
      }

      result.push(msg);
    } else if (msg.role === "toolResult") {
      existingToolResultIds.add(msg.toolCallId);
      result.push(msg);
    } else if (msg.role === "user") {
      flushOrphanedToolCalls();
      result.push(msg);
    } else {
      result.push(msg);
    }
  }

  flushOrphanedToolCalls();
  return result;
}

// ─── 用户消息内容转换 ───

export function toUserContent(
  content: string | (TextContent | ImageContent)[],
): string | OpenAI.Chat.Completions.ChatCompletionContentPart[] {
  if (typeof content === "string") return content;

  if (content.every((part) => part.type === "text")) {
    return content.map((part) => (part as TextContent).text).join("");
  }

  return content.map((part): OpenAI.Chat.Completions.ChatCompletionContentPart => {
    if (part.type === "text") {
      return { type: "text", text: part.text };
    }
    return {
      type: "image_url",
      image_url: {
        url: part.data.startsWith("data:") ? part.data : `data:${part.mimeType};base64,${part.data}`,
      },
    };
  });
}

// ─── 工具定义转换 ───

export function toRequestTools(tools: Tool[]): APIRequestTool[] {
  return tools.map((tool) => ({
    type: "function" as const,
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }));
}

// ─── Tool call 解析 ───

export function parseToolCall(tc: { id: string; name: string; argumentsText: string }): ToolCallContent {
  let args: Record<string, unknown> = {};
  if (tc.argumentsText) {
    try {
      const parsed = JSON.parse(tc.argumentsText) as unknown;
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        args = parsed as Record<string, unknown>;
      }
    } catch {
      args = { input: tc.argumentsText };
    }
  }
  return { type: "toolCall", id: tc.id, name: tc.name, arguments: args };
}

// ─── stop reason 映射 ───

export function mapStopReason(reason: string): StopReason {
  switch (reason) {
    case "stop":
    case "end":
      return "stop";
    case "tool_calls":
    case "function_call":
      return "toolUse";
    case "length":
      return "length";
    case "content_filter":
    case "network_error":
      return "error";
    default:
      return "stop";
  }
}

// ─── SDK 错误映射 ───

export function mapSdkError(error: unknown, providerName: string): LLMServiceError {
  if (error instanceof OpenAI.APIError) {
    const status = error.status;
    const msg = error.message;
    if (status === 401 || status === 403) {
      return new LLMServiceError(`${providerName} authentication failed: ${msg}`, "auth", false, status);
    }
    if (status === 402) {
      return new LLMServiceError(`${providerName} balance is insufficient: ${msg}`, "insufficient_balance", false, status);
    }
    if (status === 429) {
      return new LLMServiceError(`${providerName} rate limit exceeded: ${msg}`, "rate_limit", true, status);
    }
    if (status && status >= 500) {
      return new LLMServiceError(`${providerName} server error: ${msg}`, "server_error", true, status);
    }
    return new LLMServiceError(`${providerName} request rejected: ${msg}`, "invalid_request", false, status);
  }

  if (error instanceof Error && error.name === "AbortError") {
    return new LLMServiceError("Request aborted", "network", false);
  }

  const message = error instanceof Error ? error.message : String(error);
  return new LLMServiceError(`${providerName} request failed: ${message}`, "network", true);
}

// ─── 流式 chunk 处理 ───

export interface StreamChunkAccumulator {
  textParts: string[];
  thinkingParts: string[];
  toolCalls: Map<number, { id: string; name: string; argumentsText: string }>;
  usage: Usage;
  stopReason: StopReason;
}

export function createAccumulator(): StreamChunkAccumulator {
  return {
    textParts: [],
    thinkingParts: [],
    toolCalls: new Map(),
    usage: createEmptyUsage(),
    stopReason: "stop",
  };
}

/**
 * 处理 OpenAI SDK 流式 chunk，yield 事件，累积状态。
 *
 * 生产者遍历 OpenAI stream，发出 text_delta / thinking_delta / tool_call_delta 事件，
 * 并在 accumulator 中累积所有部分内容，用于最终组装 AssistantMessage 或错误时保留部分内容。
 */
export async function* processStreamChunks(
  stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
  acc: StreamChunkAccumulator,
): AsyncGenerator<AssistantMessageEvent> {
  for await (const chunk of stream) {
    const choice = chunk.choices?.[0];
    const delta = choice?.delta as Record<string, unknown> | undefined;

    if (delta) {
      const reasoningContent = delta.reasoning_content as string | undefined;
      if (reasoningContent) {
        acc.thinkingParts.push(reasoningContent);
        yield { type: "thinking_delta", delta: reasoningContent };
      }

      const textContent = delta.content as string | undefined;
      if (textContent) {
        acc.textParts.push(textContent);
        yield { type: "text_delta", delta: textContent };
      }

      const deltaToolCalls = delta.tool_calls as Array<{
        index?: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }> | undefined;

      if (deltaToolCalls) {
        for (const toolDelta of deltaToolCalls) {
          const index = toolDelta.index ?? 0;
          const current = acc.toolCalls.get(index) ?? { id: "", name: "", argumentsText: "" };
          current.id = toolDelta.id ?? current.id;
          current.name += toolDelta.function?.name ?? "";
          current.argumentsText += toolDelta.function?.arguments ?? "";
          acc.toolCalls.set(index, current);
          yield {
            type: "tool_call_delta",
            index,
            toolCallId: current.id || undefined,
            toolName: current.name || undefined,
            delta: toolDelta.function?.arguments ?? "",
          };
        }
      }
    }

    if (choice?.finish_reason) {
      acc.stopReason = mapStopReason(choice.finish_reason);
    }

    if (chunk.usage) {
      acc.usage.input = chunk.usage.prompt_tokens ?? acc.usage.input;
      acc.usage.output = chunk.usage.completion_tokens ?? acc.usage.output;
      acc.usage.totalTokens = chunk.usage.total_tokens ?? acc.usage.totalTokens;
      const usageAny = chunk.usage as unknown as {
        prompt_cache_hit_tokens?: number;
        prompt_cache_miss_tokens?: number;
        completion_tokens_details?: { reasoning_tokens?: number };
      };
      if (usageAny.prompt_cache_hit_tokens !== undefined) {
        acc.usage.cacheRead = usageAny.prompt_cache_hit_tokens;
        acc.usage.cacheHit = usageAny.prompt_cache_hit_tokens;
      }
      if (usageAny.prompt_cache_miss_tokens !== undefined) {
        acc.usage.cacheMiss = usageAny.prompt_cache_miss_tokens;
      } else if (usageAny.prompt_cache_hit_tokens !== undefined && chunk.usage.prompt_tokens !== undefined) {
        acc.usage.cacheMiss = Math.max(chunk.usage.prompt_tokens - usageAny.prompt_cache_hit_tokens, 0);
      }
      if (usageAny.completion_tokens_details?.reasoning_tokens !== undefined) {
        acc.usage.reasoning = usageAny.completion_tokens_details.reasoning_tokens;
      }
    }
  }
}

/**
 * 从累积器构建最终的 AssistantMessage content 数组。
 */
export function buildContentFromAccumulator(
  acc: StreamChunkAccumulator,
): (TextContent | ThinkingContent | ToolCallContent)[] {
  const content: (TextContent | ThinkingContent | ToolCallContent)[] = [];

  if (acc.thinkingParts.length > 0) {
    content.push({ type: "thinking", thinking: acc.thinkingParts.join("") });
  }
  if (acc.textParts.length > 0) {
    content.push({ type: "text", text: acc.textParts.join("") });
  }

  for (const tc of [...acc.toolCalls.entries()].sort(([a], [b]) => a - b).map(([, v]) => v)) {
    content.push(parseToolCall(tc));
  }

  return content;
}

/**
 * 从累积器组装完整的 AssistantMessage。
 */
export function buildAssistantMessage(
  acc: StreamChunkAccumulator,
  config: LLMConfig,
  providerName: string,
): AssistantMessage {
  const content = buildContentFromAccumulator(acc);
  const stopReason = acc.toolCalls.size > 0 ? "toolUse" : acc.stopReason;

  return {
    role: "assistant",
    content,
    model: config.model,
    provider: providerName,
    usage: acc.usage,
    stopReason,
    timestamp: Date.now(),
    source: "llm",
  };
}

/**
 * 从累积器组装错误 AssistantMessage，保留已收到的部分内容。
 */
export function buildErrorMessage(
  acc: StreamChunkAccumulator,
  config: LLMConfig,
  providerName: string,
  error: unknown,
  signal?: AbortSignal,
): AssistantMessage {
  const content = buildContentFromAccumulator(acc);
  const isAborted = signal?.aborted ||
    (error instanceof Error && error.name === "AbortError");

  return {
    role: "assistant",
    content,
    model: config.model,
    provider: providerName,
    usage: acc.usage,
    stopReason: isAborted ? "aborted" : "error",
    errorMessage: error instanceof Error ? error.message : String(error),
    timestamp: Date.now(),
    source: "llm",
  };
}
