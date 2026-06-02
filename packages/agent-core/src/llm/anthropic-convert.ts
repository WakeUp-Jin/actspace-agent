/**
 * Anthropic Messages API 转换工具。
 *
 * Context 仍保持 provider-neutral；协议差异只在 LLM adapter 层处理。
 * Provider-native server tool 与本地 client tool 都在本 adapter 中完成协议映射。
 */

import type Anthropic from "@anthropic-ai/sdk";
import type {
  AssistantMessage,
  Context,
  ImageContent,
  Message,
  TextContent,
  ThinkingContent,
  ToolCallContent,
  ToolResultMessage,
  Tool,
  Usage,
} from "../messages";
import { createEmptyUsage } from "../messages";
import type { AssistantMessageEvent, LLMConfig } from "./types";
import { transformMessages } from "./transform-messages";

export type AnthropicMessageParam = Anthropic.MessageParam;
export type AnthropicContentBlockParam = Anthropic.ContentBlockParam;
export type AnthropicToolUnion = Anthropic.ToolUnion;
export type AnthropicMessage = Anthropic.Message;
export type AnthropicUsage = Anthropic.Usage;

export interface AnthropicRequestInput {
  system?: string;
  messages: AnthropicMessageParam[];
}

export function convertContextToAnthropic(context: Context, target?: LLMConfig): AnthropicRequestInput {
  return {
    system: context.systemPrompt,
    messages: convertMessagesToAnthropic(context.messages, target),
  };
}

export function convertMessagesToAnthropic(messages: Message[], target?: LLMConfig): AnthropicMessageParam[] {
  const result: AnthropicMessageParam[] = [];
  const replayMessages = target
    ? transformMessages(messages, target, { normalizeToolCallId: normalizeAnthropicToolCallId })
    : sanitizeMessagesForAnthropic(messages);

  for (const message of replayMessages) {
    if (message.role === "user") {
      result.push({ role: "user", content: toAnthropicUserContent(message.content) });
      continue;
    }

    if (message.role === "assistant") {
      const content = toAnthropicAssistantContent(message);
      if (content.length > 0) {
        result.push({ role: "assistant", content });
      }
      continue;
    }

    if (message.role === "toolResult") {
      appendAnthropicToolResult(result, message);
    }
  }

  return result;
}

function normalizeAnthropicToolCallId(id: string): string {
  const safe = id.replace(/[^a-zA-Z0-9_-]/g, "_");
  return safe.length > 64 ? safe.slice(0, 64) : safe;
}

function sanitizeMessagesForAnthropic(messages: Message[]): Message[] {
  const result: Message[] = [];
  let pendingToolCalls: ToolCallContent[] = [];
  const existingToolResultIds = new Set<string>();

  const flushOrphanedToolCalls = () => {
    for (const toolCall of pendingToolCalls) {
      if (!existingToolResultIds.has(toolCall.id)) {
        result.push({
          role: "toolResult",
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          content: [{ type: "text", text: "No result provided" }],
          isError: true,
          timestamp: Date.now(),
        });
      }
    }
    pendingToolCalls = [];
    existingToolResultIds.clear();
  };

  for (const message of messages) {
    if (message.role === "assistant") {
      flushOrphanedToolCalls();

      if (message.stopReason === "error" || message.stopReason === "aborted") continue;

      const toolCalls = message.content.filter((block): block is ToolCallContent => block.type === "toolCall");
      const hasReplayableContent = message.content.some((block) =>
        block.type === "text" ||
        block.type === "thinking" ||
        block.type === "toolCall"
      );
      if (!hasReplayableContent) continue;

      if (toolCalls.length > 0) {
        pendingToolCalls = toolCalls;
      }

      result.push(message);
      continue;
    }

    if (message.role === "toolResult") {
      const hasPendingToolCall = pendingToolCalls.some((toolCall) => toolCall.id === message.toolCallId);
      if (!hasPendingToolCall) continue;

      existingToolResultIds.add(message.toolCallId);
      result.push(message);
      continue;
    }

    if (message.role === "user") {
      flushOrphanedToolCalls();
      result.push(message);
    }
  }

  flushOrphanedToolCalls();
  return result;
}

function toAnthropicUserContent(
  content: string | (TextContent | ImageContent)[],
): string | AnthropicContentBlockParam[] {
  if (typeof content === "string") return content;

  return content.map((part): AnthropicContentBlockParam => {
    if (part.type === "text") {
      return { type: "text", text: part.text };
    }

    if (/^https?:\/\//i.test(part.data)) {
      return { type: "image", source: { type: "url", url: part.data } };
    }

    return {
      type: "image",
      source: {
        type: "base64",
        media_type: toAnthropicImageMediaType(part.mimeType),
        data: stripDataUrlPrefix(part.data),
      },
    };
  });
}

function toAnthropicAssistantContent(message: AssistantMessage): AnthropicContentBlockParam[] {
  const content: AnthropicContentBlockParam[] = [];

  for (const block of message.content) {
    if (block.type === "thinking" && block.signature) {
      content.push({
        type: "thinking",
        thinking: block.thinking,
        signature: block.signature,
      });
    }

    if (block.type === "text" && block.text) {
      content.push({ type: "text", text: block.text });
    }

    if (block.type === "toolCall") {
      content.push({
        type: "tool_use",
        id: block.id,
        name: block.name,
        input: block.arguments,
      });
    }
  }

  return content;
}

function appendAnthropicToolResult(
  messages: AnthropicMessageParam[],
  message: ToolResultMessage,
): void {
  const block = toAnthropicToolResultBlock(message);
  const last = messages[messages.length - 1];

  if (last?.role === "user" && Array.isArray(last.content) && last.content.every((part) => part.type === "tool_result")) {
    last.content.push(block);
    return;
  }

  messages.push({ role: "user", content: [block] });
}

function toAnthropicToolResultBlock(message: ToolResultMessage): Anthropic.ToolResultBlockParam {
  const content = toAnthropicToolResultContent(message.content);
  return {
    type: "tool_result",
    tool_use_id: message.toolCallId,
    ...(content !== undefined && { content }),
    ...(message.isError && { is_error: true }),
  };
}

function toAnthropicToolResultContent(
  content: (TextContent | ImageContent)[],
): string | Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> | undefined {
  if (content.length === 0) return undefined;
  if (content.every((part) => part.type === "text")) {
    return content.map((part) => (part as TextContent).text).join("");
  }

  return content.map((part): Anthropic.TextBlockParam | Anthropic.ImageBlockParam => {
    if (part.type === "text") {
      return { type: "text", text: part.text };
    }

    if (/^https?:\/\//i.test(part.data)) {
      return { type: "image", source: { type: "url", url: part.data } };
    }

    return {
      type: "image",
      source: {
        type: "base64",
        media_type: toAnthropicImageMediaType(part.mimeType),
        data: stripDataUrlPrefix(part.data),
      },
    };
  });
}

function toAnthropicImageMediaType(mimeType: string): "image/jpeg" | "image/png" | "image/gif" | "image/webp" {
  if (mimeType === "image/jpeg" || mimeType === "image/png" || mimeType === "image/gif" || mimeType === "image/webp") {
    return mimeType;
  }
  return "image/png";
}

function stripDataUrlPrefix(data: string): string {
  const commaIndex = data.indexOf(",");
  return data.startsWith("data:") && commaIndex >= 0 ? data.slice(commaIndex + 1) : data;
}

export function toAnthropicClientTools(tools: Tool[]): AnthropicToolUnion[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: normalizeToolInputSchema(tool.parameters),
  }));
}

function normalizeToolInputSchema(parameters: Record<string, unknown>): Anthropic.Tool.InputSchema {
  return {
    type: "object",
    ...parameters,
  } as Anthropic.Tool.InputSchema;
}

export function createAnthropicWebSearchTool(maxUses = 3): Anthropic.WebSearchTool20250305 {
  return {
    type: "web_search_20250305",
    name: "web_search",
    max_uses: maxUses,
  };
}

export function messageToAssistantMessage(
  message: AnthropicMessage,
  config: LLMConfig,
  providerName: string,
): AssistantMessage {
  const content: AssistantMessage["content"] = [];

  for (const block of message.content) {
    if (block.type === "thinking") {
      content.push({
        type: "thinking",
        thinking: block.thinking,
        signature: block.signature,
      });
    }

    if (block.type === "text") {
      content.push({ type: "text", text: block.text });
    }

    if (block.type === "tool_use") {
      content.push({
        type: "toolCall",
        id: block.id,
        name: block.name,
        arguments: normalizeAnthropicToolInput(block.input),
      });
    }
  }

  return {
    role: "assistant",
    content,
    ...(config.api && { api: config.api }),
    model: config.model,
    provider: providerName,
    usage: anthropicUsageToUsage(message.usage),
    stopReason: content.some((block) => block.type === "toolCall")
      ? "toolUse"
      : mapAnthropicStopReason(message.stop_reason),
    timestamp: Date.now(),
    source: "llm",
  };
}

function normalizeAnthropicToolInput(input: unknown): Record<string, unknown> {
  if (typeof input === "object" && input !== null && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  return input === undefined ? {} : { input };
}

export function anthropicUsageToUsage(usage: AnthropicUsage): Usage {
  const result = createEmptyUsage();
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const reasoning = usage.output_tokens_details?.thinking_tokens ?? 0;

  // Anthropic 的 input_tokens 只是"未命中缓存的新输入"，不含 cache_read / cache_creation。
  // 这里把三段合成完整 prompt 输入，对齐全局 OpenAI 式不变量：
  //   promptTokens = cacheHit + cacheMiss，totalTokens = prompt + output。
  // 否则下游 Usage 页会出现"缓存 > 总计""命中 + 未命中 ≠ 输入"。
  const promptTokens = usage.input_tokens + cacheRead + cacheWrite;

  result.input = promptTokens;
  result.output = usage.output_tokens;
  result.cacheRead = cacheRead;
  result.cacheWrite = cacheWrite;
  result.cacheHit = cacheRead;
  // 未命中 = 新输入 + 缓存写入（价格表暂无独立写入价，缓存写入按未命中价计费）。
  result.cacheMiss = usage.input_tokens + cacheWrite;
  result.reasoning = reasoning;
  result.totalTokens = promptTokens + usage.output_tokens;
  if (usage.server_tool_use) {
    result.serverToolUse = {
      webSearchRequests: usage.server_tool_use.web_search_requests ?? 0,
      webFetchRequests: usage.server_tool_use.web_fetch_requests ?? 0,
    };
  }

  return result;
}

function mapAnthropicStopReason(reason: Anthropic.StopReason | null): AssistantMessage["stopReason"] {
  switch (reason) {
    case "max_tokens":
      return "length";
    case "tool_use":
      return "toolUse";
    case "end_turn":
    case "stop_sequence":
    case "pause_turn":
    case "refusal":
    default:
      return "stop";
  }
}

// ─── 流式响应处理 ───

/**
 * Anthropic 流式累加器。
 *
 * 与 OpenAI 路线（convert.ts 的 StreamChunkAccumulator）同构，设计思路一致，
 * 差异只在协议本身：
 * - thinking 需要保留 signature_delta，否则 extended thinking 无法回放给 API；
 * - usage 先以 Anthropic 原生结构累积，最终统一经 anthropicUsageToUsage 归一。
 */
export interface AnthropicStreamAccumulator {
  textParts: string[];
  thinkingParts: string[];
  thinkingSignature: string;
  /** key = tool 出现序号（0,1,2...），对齐 OpenAI 路线的 tool_call index 语义 */
  toolCalls: Map<number, { id: string; name: string; argumentsText: string }>;
  /** content block index → tool 序号，用于把 input_json_delta 路由到对应 tool */
  blockIndexToToolSeq: Map<number, number>;
  usage: AnthropicUsage | undefined;
  stopReason: Anthropic.StopReason | null;
}

export function createAnthropicAccumulator(): AnthropicStreamAccumulator {
  return {
    textParts: [],
    thinkingParts: [],
    thinkingSignature: "",
    toolCalls: new Map(),
    blockIndexToToolSeq: new Map(),
    usage: undefined,
    stopReason: null,
  };
}

/**
 * 消费 Anthropic 流式事件，逐增量 yield 内部事件，并在 accumulator 中累积，
 * 用于最终组装 AssistantMessage，或在出错时保留已收到的部分内容。
 */
export async function* processAnthropicStream(
  stream: AsyncIterable<Anthropic.RawMessageStreamEvent>,
  acc: AnthropicStreamAccumulator,
): AsyncGenerator<AssistantMessageEvent> {
  for await (const event of stream) {
    switch (event.type) {
      case "message_start":
        acc.usage = { ...event.message.usage };
        break;

      case "content_block_start": {
        const block = event.content_block;
        if (block.type === "tool_use") {
          const seq = acc.toolCalls.size;
          acc.blockIndexToToolSeq.set(event.index, seq);
          acc.toolCalls.set(seq, { id: block.id, name: block.name, argumentsText: "" });
          // 首个 chunk 即发出 id/name，让前端尽早展示工具调度状态
          yield {
            type: "tool_call_delta",
            index: seq,
            toolCallId: block.id,
            toolName: block.name,
            delta: "",
          };
        }
        break;
      }

      case "content_block_delta": {
        const delta = event.delta;
        if (delta.type === "text_delta") {
          acc.textParts.push(delta.text);
          yield { type: "text_delta", delta: delta.text };
        } else if (delta.type === "thinking_delta") {
          acc.thinkingParts.push(delta.thinking);
          yield { type: "thinking_delta", delta: delta.thinking };
        } else if (delta.type === "signature_delta") {
          acc.thinkingSignature += delta.signature;
        } else if (delta.type === "input_json_delta") {
          const seq = acc.blockIndexToToolSeq.get(event.index);
          if (seq !== undefined) {
            const tc = acc.toolCalls.get(seq);
            if (tc) {
              tc.argumentsText += delta.partial_json;
              yield {
                type: "tool_call_delta",
                index: seq,
                toolCallId: tc.id,
                toolName: tc.name,
                delta: delta.partial_json,
              };
            }
          }
        }
        break;
      }

      case "message_delta":
        if (acc.usage) {
          acc.usage = mergeAnthropicDeltaUsage(acc.usage, event.usage);
        }
        if (event.delta.stop_reason) {
          acc.stopReason = event.delta.stop_reason;
        }
        break;

      // content_block_stop / message_stop 无需累积
    }
  }
}

/** message_delta 携带最终的 output/缓存/server tool usage，覆盖 message_start 的初值。 */
function mergeAnthropicDeltaUsage(
  base: AnthropicUsage,
  delta: Anthropic.MessageDeltaUsage,
): AnthropicUsage {
  return {
    ...base,
    output_tokens: delta.output_tokens,
    ...(delta.input_tokens != null && { input_tokens: delta.input_tokens }),
    ...(delta.cache_read_input_tokens != null && { cache_read_input_tokens: delta.cache_read_input_tokens }),
    ...(delta.cache_creation_input_tokens != null && { cache_creation_input_tokens: delta.cache_creation_input_tokens }),
    ...(delta.output_tokens_details != null && { output_tokens_details: delta.output_tokens_details }),
    ...(delta.server_tool_use != null && { server_tool_use: delta.server_tool_use }),
  };
}

function buildAnthropicStreamContent(
  acc: AnthropicStreamAccumulator,
): AssistantMessage["content"] {
  const content: AssistantMessage["content"] = [];

  if (acc.thinkingParts.length > 0) {
    content.push({
      type: "thinking",
      thinking: acc.thinkingParts.join(""),
      ...(acc.thinkingSignature && { signature: acc.thinkingSignature }),
    });
  }
  if (acc.textParts.length > 0) {
    content.push({ type: "text", text: acc.textParts.join("") });
  }
  for (const [, tc] of [...acc.toolCalls.entries()].sort(([a], [b]) => a - b)) {
    content.push({
      type: "toolCall",
      id: tc.id,
      name: tc.name,
      arguments: parseAnthropicToolArguments(tc.argumentsText),
    });
  }

  return content;
}

function parseAnthropicToolArguments(argumentsText: string): Record<string, unknown> {
  if (!argumentsText) return {};
  try {
    const parsed = JSON.parse(argumentsText) as unknown;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return { input: argumentsText };
  }
}

/**
 * 从累加器组装最终 AssistantMessage（流正常结束）。
 * 等价于非流式路线的 messageToAssistantMessage，只是数据来源是累积的增量。
 */
export function buildAnthropicAssistantMessage(
  acc: AnthropicStreamAccumulator,
  config: LLMConfig,
  providerName: string,
): AssistantMessage {
  const content = buildAnthropicStreamContent(acc);
  const hasToolCall = acc.toolCalls.size > 0;

  return {
    role: "assistant",
    content,
    ...(config.api && { api: config.api }),
    model: config.model,
    provider: providerName,
    usage: acc.usage ? anthropicUsageToUsage(acc.usage) : createEmptyUsage(),
    stopReason: hasToolCall ? "toolUse" : mapAnthropicStopReason(acc.stopReason),
    timestamp: Date.now(),
    source: "llm",
  };
}

/**
 * 从累加器组装错误 AssistantMessage，保留已收到的部分内容。
 */
export function buildAnthropicErrorMessage(
  acc: AnthropicStreamAccumulator,
  config: LLMConfig,
  providerName: string,
  error: unknown,
  signal?: AbortSignal,
): AssistantMessage {
  const content = buildAnthropicStreamContent(acc);
  const isAborted = signal?.aborted || (error instanceof Error && error.name === "AbortError");

  return {
    role: "assistant",
    content,
    ...(config.api && { api: config.api }),
    model: config.model,
    provider: providerName,
    usage: acc.usage ? anthropicUsageToUsage(acc.usage) : createEmptyUsage(),
    stopReason: isAborted ? "aborted" : "error",
    errorMessage: error instanceof Error ? error.message : String(error),
    timestamp: Date.now(),
    source: "llm",
  };
}
