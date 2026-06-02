/**
 * OpenAICompletionsService — OpenAI Chat Completions compatible protocol service.
 *
 * Provider-specific classes should be thin wrappers over this protocol service.
 */

import OpenAI from "openai";
import type { Context, AssistantMessage, Tool } from "../../messages";
import type {
  LLMService,
  LLMConfig,
  StreamOptions,
  SimpleStreamOptions,
  APIMessage,
} from "../types";
import { AssistantMessageEventStream, LLMServiceError } from "../types";
import {
  convertMessages,
  toRequestTools,
  mapSdkError,
  createAccumulator,
  processStreamChunks,
  buildAssistantMessage,
  buildErrorMessage,
} from "../convert";

const DEFAULT_BASE_URLS: Record<string, string> = {
  deepseek: "https://api.deepseek.com",
  kimi: "https://api.moonshot.ai/v1",
};

function providerDisplayName(provider: string): string {
  if (provider === "deepseek") return "DeepSeek";
  if (provider === "kimi") return "Kimi";
  return provider;
}

export class OpenAICompletionsService implements LLMService {
  protected client: OpenAI;
  protected config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.apiKey || "placeholder",
      baseURL: config.baseUrl ?? DEFAULT_BASE_URLS[config.provider] ?? "https://api.openai.com/v1",
      dangerouslyAllowBrowser: true,
    });
  }

  stream(context: Context, options?: StreamOptions): AssistantMessageEventStream {
    return this._stream(convertMessages(context, this.config), context.tools, options);
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

  streamMessages(messages: APIMessage[], options?: StreamOptions): AssistantMessageEventStream {
    return this._stream(messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[], undefined, options);
  }

  async completeMessages(messages: APIMessage[], options?: StreamOptions): Promise<AssistantMessage> {
    return this.streamMessages(messages, options).result();
  }

  protected resolveSimpleOptions(options?: SimpleStreamOptions): StreamOptions {
    if (!options) return {};
    return { signal: options.signal };
  }

  protected _stream(
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
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

      const requestTools = options?.tools ?? toRequestTools(tools ?? []);
      const acc = createAccumulator();

      const requestParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
        model: self.config.model,
        messages,
        stream: true,
        stream_options: { include_usage: true },
        temperature: options?.temperature ?? self.config.temperature ?? undefined,
        max_tokens: options?.maxTokens ?? self.config.maxTokens ?? undefined,
      };

      if (requestTools.length > 0) {
        (requestParams as any).tools = requestTools;
      }
      if (options?.thinking) {
        (requestParams as any).thinking = options.thinking;
      } else if (options?.thinkingEnabled === false) {
        (requestParams as any).thinking = { type: "disabled" };
      }

      try {
        const stream = await self.client.chat.completions.create(
          requestParams,
          { signal: options?.signal },
        );

        yield* processStreamChunks(stream, acc);
      } catch (error) {
        if (error instanceof LLMServiceError) {
          yield { type: "error" as const, message: buildErrorMessage(acc, self.config, self.config.provider, error, options?.signal) };
          return;
        }
        const mapped = mapSdkError(error, displayName);
        yield { type: "error" as const, message: buildErrorMessage(acc, self.config, self.config.provider, mapped, options?.signal) };
        return;
      }

      const message = buildAssistantMessage(acc, self.config, self.config.provider);
      yield { type: "done" as const, message };
    }

    return new AssistantMessageEventStream(generate());
  }
}
