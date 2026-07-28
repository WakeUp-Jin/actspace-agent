import type {
  EasyInputMessage,
  FunctionTool,
  ResponseFunctionToolCall,
  ResponseInputItem,
  ResponseInputMessageContentList,
  ResponseReasoningItem,
} from "openai/resources/responses/responses";
import type {
  Context,
  ImageContent,
  Message,
  TextContent,
  ThinkingContent,
  ToolCallContent,
} from "../messages";
import type { APIRequestTool, LLMConfig } from "./types";
import { transformMessages } from "./transform-messages";

export interface ResponsesInput {
  instructions?: string;
  input: ResponseInputItem[];
}

const RESPONSES_REASONING_SIGNATURE_PREFIX = "openai-responses-reasoning:";

export function convertContextToResponses(context: Context, target: LLMConfig): ResponsesInput {
  return {
    ...(context.systemPrompt && { instructions: context.systemPrompt }),
    input: convertMessagesToResponses(context.messages, target),
  };
}

export function convertMessagesToResponses(messages: Message[], target: LLMConfig): ResponseInputItem[] {
  const sanitized = transformMessages(messages, target, {
    normalizeToolCallId: normalizeResponsesToolCallId,
  });
  const input: ResponseInputItem[] = [];

  for (const message of sanitized) {
    if (message.role === "user") {
      input.push({ role: "user", content: toResponsesMessageContent(message.content) } satisfies EasyInputMessage);
      continue;
    }

    if (message.role === "assistant") {
      for (const thinking of message.content.filter(
        (block): block is ThinkingContent => block.type === "thinking",
      )) {
        const reasoningItem = decodeResponsesReasoningItem(thinking.signature);
        if (reasoningItem) input.push(reasoningItem);
      }
      const text = message.content
        .filter((block): block is TextContent => block.type === "text")
        .map((block) => block.text)
        .join("");
      if (text) {
        input.push({
          role: "assistant",
          content: text,
          type: "message",
          phase: message.stopReason === "toolUse" ? "commentary" : "final_answer",
        } satisfies EasyInputMessage);
      }
      for (const toolCall of message.content.filter(
        (block): block is ToolCallContent => block.type === "toolCall",
      )) {
        input.push({
          type: "function_call",
          call_id: toolCall.id,
          name: toolCall.name,
          arguments: JSON.stringify(toolCall.arguments),
        } satisfies ResponseFunctionToolCall);
      }
      continue;
    }

    input.push({
      type: "function_call_output",
      call_id: message.toolCallId,
      output: toResponsesToolOutput(message.content),
    });
  }

  return input;
}

export function toResponsesTools(tools: APIRequestTool[]): FunctionTool[] {
  return tools.flatMap((tool) => {
    if (tool.type !== "function") return [];
    return [{
      type: "function" as const,
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters,
      strict: false,
    }];
  });
}

export function encodeResponsesReasoningItem(item: ResponseReasoningItem): string {
  return `${RESPONSES_REASONING_SIGNATURE_PREFIX}${JSON.stringify(item)}`;
}

function decodeResponsesReasoningItem(signature?: string): ResponseReasoningItem | undefined {
  if (!signature?.startsWith(RESPONSES_REASONING_SIGNATURE_PREFIX)) return undefined;
  try {
    const parsed = JSON.parse(signature.slice(RESPONSES_REASONING_SIGNATURE_PREFIX.length)) as ResponseReasoningItem;
    return parsed?.type === "reasoning" && typeof parsed.id === "string" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function normalizeResponsesToolCallId(id: string): string {
  const callId = id.includes("|") ? id.split("|")[0] : id;
  const safe = callId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return safe.length > 64 ? safe.slice(0, 64) : safe;
}

function toResponsesMessageContent(
  content: string | (TextContent | ImageContent)[],
): string | ResponseInputMessageContentList {
  if (typeof content === "string") return content;
  if (content.every((part) => part.type === "text")) {
    return content.map((part) => (part as TextContent).text).join("");
  }
  return content.map((part) => part.type === "text"
    ? { type: "input_text" as const, text: part.text }
    : { type: "input_image" as const, detail: "auto" as const, image_url: toImageUrl(part) });
}

function toResponsesToolOutput(
  content: (TextContent | ImageContent)[],
): string | ResponseInputMessageContentList {
  if (content.every((part) => part.type === "text")) {
    return content.map((part) => (part as TextContent).text).join("");
  }
  return content.map((part) => part.type === "text"
    ? { type: "input_text" as const, text: part.text }
    : { type: "input_image" as const, detail: "auto" as const, image_url: toImageUrl(part) });
}

function toImageUrl(part: ImageContent): string {
  if (/^(data:|https?:|file:)/i.test(part.data)) return part.data;
  return `data:${part.mimeType};base64,${part.data}`;
}
