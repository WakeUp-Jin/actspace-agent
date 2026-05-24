/**
 * KimiService - OpenAI-compatible chat completions integration with
 * Kimi-native built-in web search support.
 */

import type { Tool } from "../../messages";
import type { AssistantMessage } from "../../messages";
import { BaseLLMService } from "../base";
import type { APIMessage, APIRequestTool, StreamOptions } from "../types";
import { AssistantMessageEventStream } from "../types";
import { streamOpenAICompatibleChatCompletions } from "./openai-compatible";

const DEFAULT_BASE_URL = "https://api.moonshot.ai/v1";

const KIMI_WEB_SEARCH_TOOL: APIRequestTool = {
  type: "builtin_function",
  function: {
    name: "$web_search",
  },
};

export class KimiService extends BaseLLMService {
  protected _doStream(
    messages: APIMessage[],
    tools?: Tool[],
    options?: StreamOptions,
  ): AssistantMessageEventStream {
    return streamOpenAICompatibleChatCompletions(
      this.config,
      {
        providerName: "kimi",
        defaultBaseUrl: DEFAULT_BASE_URL,
        missingApiKeyMessage:
          "Kimi API key not configured. Set KIMI_API_KEY before selecting the kimi provider or enabling Kimi-assisted tools.",
        requestErrorPrefix: "Kimi",
      },
      messages,
      tools,
      options,
    );
  }

  streamWithBuiltinWebSearch(
    messages: APIMessage[],
    options?: StreamOptions,
  ): AssistantMessageEventStream {
    return this._doStream(messages, undefined, {
      ...options,
      tools: [KIMI_WEB_SEARCH_TOOL],
      thinking: { type: "disabled" },
    });
  }

  streamMessages(messages: APIMessage[], options?: StreamOptions): AssistantMessageEventStream {
    return this._doStream(messages, undefined, options);
  }

  async completeMessages(messages: APIMessage[], options?: StreamOptions): Promise<AssistantMessage> {
    return this.streamMessages(messages, options).result();
  }
}
