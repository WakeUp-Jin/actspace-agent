/**
 * DeepSeekAnthropicService — 使用 Anthropic Messages API 格式调用 DeepSeek。
 *
 * 使用 DeepSeek provider-native server web_search，并把本地 ToolManager 工具映射为
 * Anthropic client tools。
 */

import Anthropic from "@anthropic-ai/sdk";
import type { AssistantMessage, Context } from "../../messages";
import type {
  AssistantMessageEvent,
  LLMConfig,
  LLMService,
  SimpleStreamOptions,
  StreamOptions,
} from "../types";
import { AssistantMessageEventStream, LLMServiceError } from "../types";
import {
  convertContextToAnthropic,
  createAnthropicWebSearchTool,
  messageToAssistantMessage,
  toAnthropicClientTools,
} from "../anthropic-convert";
import {
  buildErrorMessage,
  createAccumulator,
} from "../convert";

const DEFAULT_BASE_URL = "https://api.deepseek.com/anthropic";
const DEFAULT_WEB_SEARCH_MAX_USES = 3;
const PROVIDER_NATIVE_TOOL_NAMES = new Set(["web_search"]);

export class DeepSeekAnthropicService implements LLMService {
  private client: Anthropic;
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
    this.client = new Anthropic({
      apiKey: config.apiKey || "placeholder",
      baseURL: config.baseUrl ?? DEFAULT_BASE_URL,
      maxRetries: config.maxRetries,
    });
  }

  stream(context: Context, options?: StreamOptions): AssistantMessageEventStream {
    return this._stream(context, options);
  }

  async complete(context: Context, options?: StreamOptions): Promise<AssistantMessage> {
    return this.stream(context, options).result();
  }

  streamSimple(context: Context, options?: SimpleStreamOptions): AssistantMessageEventStream {
    return this.stream(context, this.resolveSimpleOptions(options));
  }

  async completeSimple(context: Context, options?: SimpleStreamOptions): Promise<AssistantMessage> {
    return this.streamSimple(context, options).result();
  }

  private resolveSimpleOptions(options?: SimpleStreamOptions): StreamOptions {
    if (!options) return {};
    return { signal: options.signal };
  }

  private _stream(context: Context, options?: StreamOptions): AssistantMessageEventStream {
    const self = this;

    async function* generate(): AsyncGenerator<AssistantMessageEvent> {
      if (!self.config.apiKey) {
        yield {
          type: "error" as const,
          message: buildErrorMessage(
            createAccumulator(),
            self.config,
            "deepseek",
            new LLMServiceError(
              "DeepSeek API key not configured. Set DEEPSEEK_API_KEY before selecting the deepseek provider.",
              "auth",
              false,
            ),
          ),
        };
        return;
      }

      const requestInput = convertContextToAnthropic(context);

      try {
        const temperature = options?.temperature ?? self.config.temperature;
        const clientTools = (context.tools ?? [])
          .filter((tool) => !PROVIDER_NATIVE_TOOL_NAMES.has(tool.name));
        const response = await self.client.messages.create(
          {
            model: self.config.model,
            max_tokens: options?.maxTokens ?? self.config.maxTokens ?? 8192,
            messages: requestInput.messages,
            ...(requestInput.system && { system: requestInput.system }),
            ...(temperature !== undefined && { temperature }),
            ...(options?.thinkingEnabled === false && { thinking: { type: "disabled" as const } }),
            tools: [
              createAnthropicWebSearchTool(DEFAULT_WEB_SEARCH_MAX_USES),
              ...toAnthropicClientTools(clientTools),
            ],
          },
          { signal: options?.signal },
        );

        const message = messageToAssistantMessage(response, self.config, "deepseek");

        let toolCallIndex = 0;
        for (const block of message.content) {
          if (block.type === "thinking") {
            yield { type: "thinking_delta", delta: block.thinking };
          }
          if (block.type === "text") {
            yield { type: "text_delta", delta: block.text };
          }
          if (block.type === "toolCall") {
            yield {
              type: "tool_call_delta",
              index: toolCallIndex,
              toolCallId: block.id,
              toolName: block.name,
              delta: JSON.stringify(block.arguments),
            };
            toolCallIndex++;
          }
        }

        yield { type: "done", message };
      } catch (error) {
        const mapped = mapAnthropicError(error);
        yield {
          type: "error" as const,
          message: buildErrorMessage(createAccumulator(), self.config, "deepseek", mapped, options?.signal),
        };
      }
    }

    return new AssistantMessageEventStream(generate());
  }
}

function mapAnthropicError(error: unknown): LLMServiceError {
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new LLMServiceError(`DeepSeek authentication failed: ${error.message}`, "auth", false, error.status);
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new LLMServiceError(`DeepSeek rate limit exceeded: ${error.message}`, "rate_limit", true, error.status);
  }
  if (error instanceof Anthropic.BadRequestError || error instanceof Anthropic.UnprocessableEntityError) {
    return new LLMServiceError(`DeepSeek request rejected: ${error.message}`, "invalid_request", false, error.status);
  }
  if (error instanceof Anthropic.InternalServerError) {
    return new LLMServiceError(`DeepSeek server error: ${error.message}`, "server_error", true, error.status);
  }
  if (error instanceof Error && error.name === "AbortError") {
    return new LLMServiceError("Request aborted", "network", false);
  }
  const message = error instanceof Error ? error.message : String(error);
  return new LLMServiceError(`DeepSeek request failed: ${message}`, "network", true);
}
