/** OpenAI Responses API service used by stateless Agent runtimes such as DuckCoding Codex. */

import OpenAI from "openai";
import type {
  Response,
  ResponseCreateParamsStreaming,
  ResponseFunctionToolCall,
  ResponseReasoningItem,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";
import type { AssistantMessage, Context, Tool, Usage } from "../../messages";
import type {
  LLMConfig,
  LLMService,
  SimpleStreamOptions,
  StreamOptions,
} from "../types";
import { AssistantMessageEventStream, LLMServiceError } from "../types";
import {
  buildAssistantMessage,
  buildErrorMessage,
  createAccumulator,
  mapSdkError,
  toRequestTools,
  type StreamChunkAccumulator,
} from "../convert";
import { providerDefaultHeaders, providerDisplayName } from "../provider-adapter";
import { createProviderFetch } from "../provider-transport";
import {
  convertContextToResponses,
  encodeResponsesReasoningItem,
  toResponsesTools,
} from "../responses-convert";

const DEFAULT_BASE_URLS: Record<string, string> = {
  duckcoding: "https://api.duckcoding.ai/v1",
};

export class OpenAIResponsesService implements LLMService {
  protected client: OpenAI;
  protected config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
    const defaultHeaders = {
      ...providerDefaultHeaders(config.provider),
      ...config.defaultHeaders,
    };
    const providerFetch = config.transport?.fetch ?? createProviderFetch(config.transport?.proxyUrl);
    this.client = new OpenAI({
      apiKey: config.apiKey || "placeholder",
      baseURL: config.baseUrl ?? DEFAULT_BASE_URLS[config.provider] ?? "https://api.openai.com/v1",
      ...(providerFetch && { fetch: providerFetch }),
      ...(Object.keys(defaultHeaders).length > 0 && { defaultHeaders }),
      dangerouslyAllowBrowser: true,
    });
  }

  stream(context: Context, options?: StreamOptions): AssistantMessageEventStream {
    const converted = convertContextToResponses(context, this.config);
    return this._stream(converted, context.tools, options);
  }

  async complete(context: Context, options?: StreamOptions): Promise<AssistantMessage> {
    return this.stream(context, options).result();
  }

  streamSimple(context: Context, options?: SimpleStreamOptions): AssistantMessageEventStream {
    return this.stream(context, options ? { signal: options.signal } : undefined);
  }

  async completeSimple(context: Context, options?: SimpleStreamOptions): Promise<AssistantMessage> {
    return this.streamSimple(context, options).result();
  }

  protected _stream(
    converted: ReturnType<typeof convertContextToResponses>,
    tools?: Tool[],
    options?: StreamOptions,
  ): AssistantMessageEventStream {
    const self = this;

    async function* generate() {
      const displayName = providerDisplayName(self.config.provider);
      if (!self.config.apiKey) {
        yield {
          type: "error" as const,
          message: buildErrorMessage(
            createAccumulator(),
            self.config,
            self.config.provider,
            new LLMServiceError(
              `${displayName} API key not configured. Set ${self.config.provider.toUpperCase()}_API_KEY before selecting the ${self.config.provider} provider.`,
              "auth",
              false,
            ),
          ),
        };
        return;
      }

      const acc = createAccumulator();
      const requestTools = toResponsesTools(options?.tools ?? toRequestTools(tools ?? []));
      const requestParams: ResponseCreateParamsStreaming = {
        model: self.config.model,
        input: converted.input,
        stream: true,
        store: false,
        include: ["reasoning.encrypted_content"],
        ...(converted.instructions && { instructions: converted.instructions }),
        ...(self.config.promptCacheKey && { prompt_cache_key: self.config.promptCacheKey }),
        ...((options?.temperature ?? self.config.temperature) !== undefined && {
          temperature: options?.temperature ?? self.config.temperature,
        }),
        ...((options?.maxTokens ?? self.config.maxTokens) !== undefined && {
          max_output_tokens: options?.maxTokens ?? self.config.maxTokens,
        }),
        ...(requestTools.length > 0 && { tools: requestTools }),
      };

      try {
        const stream = await self.client.responses.create(requestParams, { signal: options?.signal });
        for await (const event of processResponseStream(stream, acc)) {
          yield event;
        }
      } catch (error) {
        const mapped = error instanceof LLMServiceError ? error : mapSdkError(error, displayName);
        yield {
          type: "error" as const,
          message: buildErrorMessage(acc, self.config, self.config.provider, mapped, options?.signal),
        };
        return;
      }

      yield {
        type: "done" as const,
        message: buildAssistantMessage(acc, self.config, self.config.provider),
      };
    }

    return new AssistantMessageEventStream(generate());
  }
}

async function* processResponseStream(
  stream: AsyncIterable<ResponseStreamEvent>,
  acc: StreamChunkAccumulator,
) {
  for await (const event of stream) {
    if (event.type === "response.output_text.delta") {
      acc.textParts.push(event.delta);
      yield { type: "text_delta" as const, delta: event.delta };
      continue;
    }

    if (event.type === "response.output_item.added" && event.item.type === "function_call") {
      const item = event.item as ResponseFunctionToolCall;
      acc.toolCalls.set(event.output_index, {
        id: item.call_id,
        name: item.name,
        argumentsText: item.arguments ?? "",
      });
      yield {
        type: "tool_call_delta" as const,
        index: event.output_index,
        toolCallId: item.call_id,
        toolName: item.name,
        delta: item.arguments ?? "",
      };
      continue;
    }

    if (event.type === "response.function_call_arguments.delta") {
      const current = acc.toolCalls.get(event.output_index) ?? {
        id: event.item_id,
        name: "",
        argumentsText: "",
      };
      current.argumentsText += event.delta;
      acc.toolCalls.set(event.output_index, current);
      yield {
        type: "tool_call_delta" as const,
        index: event.output_index,
        toolCallId: current.id || undefined,
        toolName: current.name || undefined,
        delta: event.delta,
      };
      continue;
    }

    if (event.type === "response.output_item.done" && event.item.type === "function_call") {
      const item = event.item as ResponseFunctionToolCall;
      const current = acc.toolCalls.get(event.output_index);
      if (!current) {
        acc.toolCalls.set(event.output_index, {
          id: item.call_id,
          name: item.name,
          argumentsText: item.arguments,
        });
        yield {
          type: "tool_call_delta" as const,
          index: event.output_index,
          toolCallId: item.call_id,
          toolName: item.name,
          delta: item.arguments,
        };
      } else {
        current.id ||= item.call_id;
        current.name ||= item.name;
        if (!current.argumentsText) current.argumentsText = item.arguments;
      }
      continue;
    }

    if (event.type === "response.output_item.done" && event.item.type === "reasoning") {
      const item = event.item as ResponseReasoningItem;
      acc.reasoningSignatures.push(encodeResponsesReasoningItem(item));
      const summary = item.summary.map((part) => part.text).join("\n");
      if (summary) acc.thinkingParts.push(summary);
      continue;
    }

    if (event.type === "response.completed") {
      applyResponseMetadata(event.response, acc);
      acc.rawStopReason = event.response.status ?? "completed";
      continue;
    }

    if (event.type === "response.incomplete") {
      applyResponseMetadata(event.response, acc);
      const reason = event.response.incomplete_details?.reason ?? "incomplete";
      acc.rawStopReason = reason;
      if (reason === "max_output_tokens") acc.stopReason = "length";
      else throw new LLMServiceError(`Response incomplete: ${reason}.`, "server_error", false);
      continue;
    }

    if (event.type === "response.failed") {
      applyResponseMetadata(event.response, acc);
      throw new LLMServiceError(responseFailureMessage(event.response), "server_error", true);
    }

    if (event.type === "error") {
      throw new LLMServiceError("Responses stream returned an error event.", "server_error", true);
    }
  }
}

function applyResponseMetadata(response: Response, acc: StreamChunkAccumulator): void {
  acc.responseId = response.id;
  acc.responseModel = response.model;
  applyResponseUsage(response.usage, acc.usage);
}

function applyResponseUsage(responseUsage: Response["usage"], usage: Usage): void {
  if (!responseUsage) return;
  const usageDetails = responseUsage.input_tokens_details as typeof responseUsage.input_tokens_details & {
    cache_write_tokens?: number;
  };
  usage.input = responseUsage.input_tokens;
  usage.output = responseUsage.output_tokens;
  usage.totalTokens = responseUsage.total_tokens;
  usage.cacheRead = usageDetails.cached_tokens ?? 0;
  usage.cacheHit = usage.cacheRead;
  usage.cacheWrite = usageDetails.cache_write_tokens ?? 0;
  usage.cacheMiss = Math.max(responseUsage.input_tokens - usage.cacheRead, 0);
  usage.reasoning = responseUsage.output_tokens_details.reasoning_tokens ?? 0;
}

function responseFailureMessage(response: Response): string {
  const error = response.error as { message?: string } | null;
  const message = error?.message?.trim();
  return message ? `Response failed: ${message.slice(0, 300)}` : "Response failed.";
}
