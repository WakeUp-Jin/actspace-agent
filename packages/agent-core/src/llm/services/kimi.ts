/**
 * KimiService — 使用 OpenAI SDK 直接流式调用 Kimi chat completions，
 * 支持 Kimi 原生 builtin_function.$web_search。
 */

import OpenAI from "openai";
import type { Context, AssistantMessage } from "../../messages";
import type {
  LLMService,
  LLMConfig,
  StreamOptions,
  SimpleStreamOptions,
  APIMessage,
  APIRequestTool,
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

const DEFAULT_BASE_URL = "https://api.moonshot.ai/v1";

export class KimiService implements LLMService {
  private client: OpenAI;
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.apiKey || "placeholder",
      baseURL: config.baseUrl ?? DEFAULT_BASE_URL,
      dangerouslyAllowBrowser: true,
    });
  }

  stream(context: Context, options?: StreamOptions): AssistantMessageEventStream {
    return this._stream(convertMessages(context), context.tools, options);
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

  /** 带 Kimi builtin $web_search 的流式调用，自动禁用 thinking */
  streamWithBuiltinWebSearch(
    messages: APIMessage[],
    options?: StreamOptions,
  ): AssistantMessageEventStream {
    const KIMI_WEB_SEARCH_TOOL: APIRequestTool = {
      type: "builtin_function",
      function: { name: "$web_search" },
    };
    return this._stream(messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[], undefined, {
      ...options,
      tools: [KIMI_WEB_SEARCH_TOOL],
      thinking: { type: "disabled" },
    });
  }

  /** 直接传入 API 格式消息的流式调用 */
  streamMessages(messages: APIMessage[], options?: StreamOptions): AssistantMessageEventStream {
    return this._stream(messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[], undefined, options);
  }

  /** 直接传入 API 格式消息的非流式调用 */
  async completeMessages(messages: APIMessage[], options?: StreamOptions): Promise<AssistantMessage> {
    return this.streamMessages(messages, options).result();
  }

  private resolveSimpleOptions(options?: SimpleStreamOptions): StreamOptions {
    if (!options) return {};
    return { signal: options.signal };
  }

  private _stream(
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    tools?: import("../../messages").Tool[],
    options?: StreamOptions,
  ): AssistantMessageEventStream {
    const self = this;

    async function* generate() {
      if (!self.config.apiKey) {
        yield {
          type: "error" as const,
          message: buildErrorMessage(
            createAccumulator(),
            self.config,
            "kimi",
            new LLMServiceError(
              "Kimi API key not configured. Set KIMI_API_KEY before selecting the kimi provider or enabling Kimi-assisted tools.",
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
          yield { type: "error" as const, message: buildErrorMessage(acc, self.config, "kimi", error, options?.signal) };
          return;
        }
        const mapped = mapSdkError(error, "Kimi");
        yield { type: "error" as const, message: buildErrorMessage(acc, self.config, "kimi", mapped, options?.signal) };
        return;
      }

      const message = buildAssistantMessage(acc, self.config, "kimi");
      yield { type: "done" as const, message };
    }

    return new AssistantMessageEventStream(generate());
  }
}
