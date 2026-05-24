import type {
  AssistantMessage,
  StopReason,
  TextContent,
  ThinkingContent,
  Tool,
  ToolCallContent,
} from "../../messages";
import { createEmptyUsage } from "../../messages";
import type { APIMessage, APIRequestTool, LLMConfig, StreamOptions } from "../types";
import { AssistantMessageEventStream, LLMServiceError } from "../types";

type ChatCompletionChunk = {
  choices?: Array<{
    delta?: {
      content?: string | null;
      reasoning_content?: string | null;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    prompt_cache_hit_tokens?: number;
  };
};

type AccumulatedToolCall = {
  id: string;
  name: string;
  argumentsText: string;
};

export interface OpenAICompatibleStreamConfig {
  providerName: string;
  defaultBaseUrl: string;
  missingApiKeyMessage: string;
  requestErrorPrefix: string;
}

export function streamOpenAICompatibleChatCompletions(
  serviceConfig: LLMConfig,
  streamConfig: OpenAICompatibleStreamConfig,
  messages: APIMessage[],
  tools?: Tool[],
  options?: StreamOptions,
): AssistantMessageEventStream {
  const baseUrl = serviceConfig.baseUrl ?? streamConfig.defaultBaseUrl;
  const endpoint = `${baseUrl.replace(/\/$/, "")}/chat/completions`;

  async function* generate() {
    if (!serviceConfig.apiKey) {
      yield {
        type: "error" as const,
        error: new LLMServiceError(streamConfig.missingApiKeyMessage, "auth", false),
      };
      return;
    }

    const requestTools = options?.tools ?? toRequestTools(tools ?? []);

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceConfig.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: serviceConfig.model,
          messages,
          ...(requestTools.length ? { tools: requestTools } : {}),
          ...(options?.thinking ? { thinking: options.thinking } : {}),
          stream: true,
          stream_options: { include_usage: true },
          temperature: options?.temperature ?? serviceConfig.temperature,
          max_tokens: options?.maxTokens ?? serviceConfig.maxTokens,
        }),
        signal: options?.signal,
      });
    } catch (error) {
      yield {
        type: "error" as const,
        error: new LLMServiceError(
          `${streamConfig.requestErrorPrefix} request failed: ${error instanceof Error ? error.message : String(error)}`,
          "network",
          true,
        ),
      };
      return;
    }

    if (!response.ok) {
      const details = await readErrorDetails(response);
      yield {
        type: "error" as const,
        error: createHttpError(streamConfig.requestErrorPrefix, response.status, details),
      };
      return;
    }

    if (!response.body) {
      yield {
        type: "error" as const,
        error: new LLMServiceError(
          `${streamConfig.requestErrorPrefix} response did not include a readable stream.`,
          "server_error",
          true,
        ),
      };
      return;
    }

    const content: (TextContent | ThinkingContent | ToolCallContent)[] = [];
    const textParts: string[] = [];
    const thinkingParts: string[] = [];
    const toolCalls = new Map<number, AccumulatedToolCall>();
    const usage = createEmptyUsage();
    let stopReason: StopReason = "stop";

    try {
      for await (const data of readServerSentEvents(response.body)) {
        if (data === "[DONE]") break;

        const chunk = JSON.parse(data) as ChatCompletionChunk;
        const choice = chunk.choices?.[0];
        const delta = choice?.delta;

        if (delta?.reasoning_content) {
          thinkingParts.push(delta.reasoning_content);
          yield { type: "thinking_delta" as const, delta: delta.reasoning_content };
        }

        if (delta?.content) {
          textParts.push(delta.content);
          yield { type: "text_delta" as const, delta: delta.content };
        }

        for (const toolDelta of delta?.tool_calls ?? []) {
          const index = toolDelta.index ?? 0;
          const current = toolCalls.get(index) ?? {
            id: toolDelta.id ?? `tool_${index}`,
            name: "",
            argumentsText: "",
          };
          current.id = toolDelta.id ?? current.id;
          current.name += toolDelta.function?.name ?? "";
          current.argumentsText += toolDelta.function?.arguments ?? "";
          toolCalls.set(index, current);
          yield {
            type: "tool_call_delta" as const,
            index,
            delta: toolDelta.function?.arguments ?? "",
          };
        }

        if (choice?.finish_reason) {
          stopReason = mapStopReason(choice.finish_reason);
        }

        if (chunk.usage) {
          usage.input = chunk.usage.prompt_tokens ?? usage.input;
          usage.output = chunk.usage.completion_tokens ?? usage.output;
          usage.totalTokens = chunk.usage.total_tokens ?? usage.totalTokens;
          usage.cacheRead = chunk.usage.prompt_cache_hit_tokens ?? usage.cacheRead;
        }
      }
    } catch (error) {
      yield {
        type: "error" as const,
        error: new LLMServiceError(
          `${streamConfig.requestErrorPrefix} stream parsing failed: ${error instanceof Error ? error.message : String(error)}`,
          "server_error",
          true,
        ),
      };
      return;
    }

    if (thinkingParts.length > 0) {
      content.push({ type: "thinking", thinking: thinkingParts.join("") });
    }
    if (textParts.length > 0) {
      content.push({ type: "text", text: textParts.join("") });
    }

    for (const toolCall of [...toolCalls.entries()].sort(([a], [b]) => a - b).map(([, value]) => value)) {
      content.push(toToolCallContent(toolCall));
    }

    if (toolCalls.size > 0) {
      stopReason = "toolUse";
    }

    const message: AssistantMessage = {
      role: "assistant",
      content,
      model: serviceConfig.model,
      provider: streamConfig.providerName,
      usage,
      stopReason,
      timestamp: Date.now(),
      source: "llm",
    };

    yield { type: "done" as const, message };
  }

  return new AssistantMessageEventStream(generate());
}

function toRequestTools(tools: Tool[]): APIRequestTool[] {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

function mapStopReason(reason: string): StopReason {
  switch (reason) {
    case "tool_calls":
      return "toolUse";
    case "length":
      return "length";
    default:
      return "stop";
  }
}

function toToolCallContent(toolCall: AccumulatedToolCall): ToolCallContent {
  let args: Record<string, unknown> = {};
  if (toolCall.argumentsText) {
    try {
      const parsed = JSON.parse(toolCall.argumentsText) as unknown;
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        args = parsed as Record<string, unknown>;
      }
    } catch {
      args = { input: toolCall.argumentsText };
    }
  }

  return {
    type: "toolCall",
    id: toolCall.id,
    name: toolCall.name,
    arguments: args,
  };
}

async function* readServerSentEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });

      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        const data = frame
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (data) yield data;
      }

      if (done) break;
    }

    if (buffer.trim()) {
      const data = buffer
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (data) yield data;
    }
  } finally {
    reader.releaseLock();
  }
}

async function readErrorDetails(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 300);
  } catch {
    return "";
  }
}

function createHttpError(providerLabel: string, status: number, details: string): LLMServiceError {
  const suffix = details ? `: ${details}` : "";
  if (status === 401 || status === 403) {
    return new LLMServiceError(`${providerLabel} authentication failed${suffix}`, "auth", false, status);
  }
  if (status === 402) {
    return new LLMServiceError(`${providerLabel} balance is insufficient${suffix}`, "insufficient_balance", false, status);
  }
  if (status === 429) {
    return new LLMServiceError(`${providerLabel} rate limit exceeded${suffix}`, "rate_limit", true, status);
  }
  if (status >= 500) {
    return new LLMServiceError(`${providerLabel} server error${suffix}`, "server_error", true, status);
  }
  return new LLMServiceError(`${providerLabel} request rejected${suffix}`, "invalid_request", false, status);
}
