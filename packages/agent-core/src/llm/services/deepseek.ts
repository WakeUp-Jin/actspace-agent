/**
 * DeepSeekService — 使用 OpenAI SDK 直接流式调用 DeepSeek chat completions。
 */

import OpenAI from "openai";
import type { Context, AssistantMessage } from "../../messages";
import type {
  LLMService,
  LLMConfig,
  StreamOptions,
  SimpleStreamOptions,
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

const DEFAULT_BASE_URL = "https://api.deepseek.com";

export class DeepSeekService implements LLMService {
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

    async function* generate() {
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

      const messages = convertMessages(context);
      const tools = options?.tools ?? toRequestTools(context.tools ?? []);
      const acc = createAccumulator();

      const requestParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
        model: self.config.model,
        messages,
        stream: true,
        stream_options: { include_usage: true },
        temperature: options?.temperature ?? self.config.temperature ?? undefined,
        max_tokens: options?.maxTokens ?? self.config.maxTokens ?? undefined,
      };

      if (tools.length > 0) {
        (requestParams as any).tools = tools;
      }
      if (options?.thinkingEnabled === false) {
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
          yield { type: "error" as const, message: buildErrorMessage(acc, self.config, "deepseek", error, options?.signal) };
          return;
        }
        const mapped = mapSdkError(error, "DeepSeek");
        yield { type: "error" as const, message: buildErrorMessage(acc, self.config, "deepseek", mapped, options?.signal) };
        return;
      }

      const message = buildAssistantMessage(acc, self.config, "deepseek");
      yield { type: "done" as const, message };
    }

    return new AssistantMessageEventStream(generate());
  }
}
