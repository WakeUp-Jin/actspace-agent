/**
 * Cross-provider message normalization before protocol-specific conversion.
 *
 * This keeps OpenAI / Anthropic converters focused on their native API shape.
 */

import type {
  AssistantMessage,
  ImageContent,
  Message,
  TextContent,
  ThinkingContent,
  ToolCallContent,
  ToolResultMessage,
} from "../messages";
import type { LLMConfig } from "./types";

export type NormalizeToolCallId = (
  id: string,
  target: LLMConfig,
  source: AssistantMessage,
) => string;

export interface TransformMessagesOptions {
  normalizeToolCallId?: NormalizeToolCallId;
}

export function transformMessages(
  messages: Message[],
  target: LLMConfig,
  options: TransformMessagesOptions = {},
): Message[] {
  const imageSafeMessages = downgradeUnsupportedImages(messages, target);
  const toolCallIdMap = new Map<string, string>();

  const normalized = imageSafeMessages.map((message): Message => {
    if (message.role !== "assistant") return message;
    return transformAssistantMessage(message, target, toolCallIdMap, options.normalizeToolCallId);
  });

  return sanitizeReplayMessages(normalized, toolCallIdMap);
}

function isSameTarget(message: AssistantMessage, target: LLMConfig): boolean {
  const apiMatches = !message.api || !target.api || message.api === target.api;
  return message.provider === target.provider &&
    message.model === target.model &&
    apiMatches;
}

function downgradeUnsupportedImages(messages: Message[], target: LLMConfig): Message[] {
  if (!target.input || target.input.includes("image")) return messages;

  return messages.map((message) => {
    if (message.role === "user" && Array.isArray(message.content)) {
      return {
        ...message,
        content: replaceImagesWithPlaceholder(
          message.content,
          "(image omitted: model does not support images)",
        ),
      };
    }
    if (message.role === "toolResult") {
      return {
        ...message,
        content: replaceImagesWithPlaceholder(
          message.content,
          "(tool image omitted: model does not support images)",
        ),
      };
    }
    return message;
  });
}

function replaceImagesWithPlaceholder(
  content: (TextContent | ImageContent)[],
  placeholder: string,
): TextContent[] {
  const result: TextContent[] = [];
  let insertedForCurrentRun = false;

  for (const block of content) {
    if (block.type === "image") {
      if (!insertedForCurrentRun) {
        result.push({ type: "text", text: placeholder });
        insertedForCurrentRun = true;
      }
      continue;
    }
    insertedForCurrentRun = false;
    result.push(block);
  }

  return result;
}

function transformAssistantMessage(
  message: AssistantMessage,
  target: LLMConfig,
  toolCallIdMap: Map<string, string>,
  normalizeToolCallId?: NormalizeToolCallId,
): AssistantMessage {
  const sameTarget = isSameTarget(message, target);
  const content: AssistantMessage["content"] = [];

  for (const block of message.content) {
    const transformedBlocks = transformAssistantBlock(
      block,
      message,
      target,
      sameTarget,
      toolCallIdMap,
      normalizeToolCallId,
    );
    content.push(...transformedBlocks);
  }

  return { ...message, content };
}

function transformAssistantBlock(
  block: AssistantMessage["content"][number],
  source: AssistantMessage,
  target: LLMConfig,
  sameTarget: boolean,
  toolCallIdMap: Map<string, string>,
  normalizeToolCallId?: NormalizeToolCallId,
): AssistantMessage["content"] {
  if (block.type === "text") {
    return sameTarget ? [block] : [{ type: "text", text: block.text }];
  }

  if (block.type === "thinking") {
    return transformThinkingBlock(block, sameTarget);
  }

  const transformedToolCall: ToolCallContent = { ...block };
  if (!sameTarget && transformedToolCall.thoughtSignature) {
    delete transformedToolCall.thoughtSignature;
  }
  if (!sameTarget && normalizeToolCallId) {
    const normalizedId = normalizeToolCallId(block.id, target, source);
    if (normalizedId !== block.id) {
      toolCallIdMap.set(block.id, normalizedId);
      transformedToolCall.id = normalizedId;
    }
  }

  return [transformedToolCall];
}

function transformThinkingBlock(
  block: ThinkingContent,
  sameTarget: boolean,
): (ThinkingContent | TextContent)[] {
  if (block.redacted) return sameTarget ? [block] : [];
  if (!block.thinking || block.thinking.trim() === "") return [];
  if (sameTarget) return [block];
  return [{ type: "text", text: block.thinking }];
}

function sanitizeReplayMessages(
  messages: Message[],
  toolCallIdMap: Map<string, string>,
): Message[] {
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
        } as ToolResultMessage);
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
      if (toolCalls.length > 0) pendingToolCalls = toolCalls;
      if (message.content.length > 0) result.push(message);
      continue;
    }

    if (message.role === "toolResult") {
      const normalizedId = toolCallIdMap.get(message.toolCallId);
      const normalizedMessage = normalizedId && normalizedId !== message.toolCallId
        ? { ...message, toolCallId: normalizedId }
        : message;
      const hasPendingToolCall = pendingToolCalls.some((toolCall) => toolCall.id === normalizedMessage.toolCallId);
      if (!hasPendingToolCall) flushOrphanedToolCalls();
      existingToolResultIds.add(normalizedMessage.toolCallId);
      result.push(normalizedMessage);
      continue;
    }

    flushOrphanedToolCalls();
    result.push(message);
  }

  flushOrphanedToolCalls();
  return result;
}
