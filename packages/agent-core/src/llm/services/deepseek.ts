/**
 * DeepSeekService - native streaming integration for DeepSeek's
 * OpenAI-compatible chat completions endpoint.
 */

import type { Tool } from "../../messages";
import { BaseLLMService } from "../base";
import type { APIMessage, StreamOptions } from "../types";
import { AssistantMessageEventStream } from "../types";
import { streamOpenAICompatibleChatCompletions } from "./openai-compatible";

const DEFAULT_BASE_URL = "https://api.deepseek.com";

export class DeepSeekService extends BaseLLMService {
  protected _doStream(
    messages: APIMessage[],
    tools?: Tool[],
    options?: StreamOptions,
  ): AssistantMessageEventStream {
    return streamOpenAICompatibleChatCompletions(
      this.config,
      {
        providerName: "deepseek",
        defaultBaseUrl: DEFAULT_BASE_URL,
        missingApiKeyMessage:
          "DeepSeek API key not configured. Set DEEPSEEK_API_KEY before selecting the deepseek provider.",
        requestErrorPrefix: "DeepSeek",
      },
      messages,
      tools,
      options,
    );
  }
}
