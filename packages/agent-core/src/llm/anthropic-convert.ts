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
import type { LLMConfig } from "./types";

export type AnthropicMessageParam = Anthropic.MessageParam;
export type AnthropicContentBlockParam = Anthropic.ContentBlockParam;
export type AnthropicToolUnion = Anthropic.ToolUnion;
export type AnthropicMessage = Anthropic.Message;
export type AnthropicUsage = Anthropic.Usage;

export interface AnthropicRequestInput {
  system?: string;
  messages: AnthropicMessageParam[];
}

export function convertContextToAnthropic(context: Context): AnthropicRequestInput {
  return {
    system: context.systemPrompt,
    messages: convertMessagesToAnthropic(context.messages),
  };
}

export function convertMessagesToAnthropic(messages: Message[]): AnthropicMessageParam[] {
  const result: AnthropicMessageParam[] = [];

  for (const message of sanitizeMessagesForAnthropic(messages)) {
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

  result.input = usage.input_tokens;
  result.output = usage.output_tokens;
  result.cacheRead = cacheRead;
  result.cacheWrite = cacheWrite;
  result.cacheHit = cacheRead;
  result.cacheMiss = Math.max(usage.input_tokens - cacheRead, 0);
  result.reasoning = reasoning;
  result.totalTokens = usage.input_tokens + usage.output_tokens;
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
