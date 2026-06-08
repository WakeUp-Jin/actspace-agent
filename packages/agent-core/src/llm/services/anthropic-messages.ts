/**
 * AnthropicMessagesService — Anthropic Messages compatible protocol service.
 *
 * Provider presets decide base URL, credentials, and provider-native tools.
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
  buildAnthropicAssistantMessage,
  buildAnthropicErrorMessage,
  convertContextToAnthropic,
  createAnthropicAccumulator,
  createAnthropicWebSearchTool,
  detectLeakedDsmlToolCalls,
  processAnthropicStream,
  toAnthropicClientTools,
} from "../anthropic-convert";

const DEFAULT_BASE_URLS: Record<string, string> = {
  deepseek: "https://api.deepseek.com/anthropic",
};
const DEFAULT_WEB_SEARCH_MAX_USES = 3;
const PROVIDER_NATIVE_TOOL_NAMES = new Set(["web_search"]);

function providerDisplayName(provider: string): string {
  if (provider === "deepseek") return "DeepSeek";
  return provider;
}

export class AnthropicMessagesService implements LLMService {
  protected client: Anthropic;
  protected config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
    this.client = new Anthropic({
      apiKey: config.apiKey || "placeholder",
      baseURL: config.baseUrl ?? DEFAULT_BASE_URLS[config.provider],
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

  protected resolveSimpleOptions(options?: SimpleStreamOptions): StreamOptions {
    if (!options) return {};
    return { signal: options.signal };
  }

  protected providerNativeTools(): Anthropic.ToolUnion[] {
    if (this.config.provider === "deepseek") {
      return [createAnthropicWebSearchTool(DEFAULT_WEB_SEARCH_MAX_USES)];
    }
    return [];
  }

  protected _stream(context: Context, options?: StreamOptions): AssistantMessageEventStream {
    const self = this;

    async function* generate(): AsyncGenerator<AssistantMessageEvent> {
      const displayName = providerDisplayName(self.config.provider);
      if (!self.config.apiKey) {
        yield {
          type: "error" as const,
          message: buildAnthropicErrorMessage(
            createAnthropicAccumulator(),
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

      const requestInput = convertContextToAnthropic(context, self.config);
      const acc = createAnthropicAccumulator();

      try {
        const temperature = options?.temperature ?? self.config.temperature;
        const clientTools = (context.tools ?? [])
          .filter((tool) => !PROVIDER_NATIVE_TOOL_NAMES.has(tool.name));
        const stream = self.client.messages.stream(
          {
            model: self.config.model,
            max_tokens: options?.maxTokens ?? self.config.maxTokens ?? 8192,
            messages: requestInput.messages,
            ...(requestInput.system && { system: requestInput.system }),
            ...(temperature !== undefined && { temperature }),
            ...(options?.thinkingEnabled === false && { thinking: { type: "disabled" as const } }),
            tools: [
              ...self.providerNativeTools(),
              ...toAnthropicClientTools(clientTools),
            ],
          },
          { signal: options?.signal },
        );

        yield* processAnthropicStream(stream, acc);

        // DeepSeek Anthropic 网关偶发把模型原生 DSML tool-call 标记当正文吐出（未转成
        // 结构化 tool_use），导致裸标记被当回复展示。检测到泄漏时按可重试 server_error 处理，
        // 而不是把垃圾正文落库。错误文案不含原始 DSML，避免污染日志。
        if (acc.toolCalls.size === 0 && detectLeakedDsmlToolCalls(acc.textParts.join(""))) {
          // 丢弃泄漏的 DSML 正文，但保留 usage（含计费），避免错误消息把裸标记带出去。
          const sanitized = createAnthropicAccumulator();
          sanitized.usage = acc.usage;
          sanitized.stopReason = acc.stopReason;
          yield {
            type: "error" as const,
            message: buildAnthropicErrorMessage(
              sanitized,
              self.config,
              self.config.provider,
              new LLMServiceError(
                `${displayName} 返回了未解析的工具调用标记（DSML leak），已按可重试错误处理。`,
                "server_error",
                true,
              ),
              options?.signal,
            ),
          };
          return;
        }

        yield { type: "done", message: buildAnthropicAssistantMessage(acc, self.config, self.config.provider) };
      } catch (error) {
        const mapped = mapAnthropicError(error, displayName);
        yield {
          type: "error" as const,
          message: buildAnthropicErrorMessage(acc, self.config, self.config.provider, mapped, options?.signal),
        };
      }
    }

    return new AssistantMessageEventStream(generate());
  }
}

function mapAnthropicError(error: unknown, providerName: string): LLMServiceError {
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new LLMServiceError(`${providerName} authentication failed: ${error.message}`, "auth", false, error.status);
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new LLMServiceError(`${providerName} rate limit exceeded: ${error.message}`, "rate_limit", true, error.status);
  }
  if (error instanceof Anthropic.BadRequestError || error instanceof Anthropic.UnprocessableEntityError) {
    return new LLMServiceError(`${providerName} request rejected: ${error.message}`, "invalid_request", false, error.status);
  }
  if (error instanceof Anthropic.InternalServerError) {
    return new LLMServiceError(`${providerName} server error: ${error.message}`, "server_error", true, error.status);
  }
  if (error instanceof Error && error.name === "AbortError") {
    return new LLMServiceError("Request aborted", "network", false);
  }
  const message = error instanceof Error ? error.message : String(error);
  return new LLMServiceError(`${providerName} request failed: ${message}`, "network", true);
}
