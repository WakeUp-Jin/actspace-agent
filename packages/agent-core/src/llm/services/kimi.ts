/**
 * KimiService — compatibility wrapper for Kimi-specific helper capabilities.
 *
 * Ordinary chat completions use the OpenAI-compatible protocol service. Kimi's
 * builtin web search remains here as an internal helper capability.
 */

import type { APIMessage, APIRequestTool, LLMConfig, StreamOptions } from "../types";
import { OpenAICompletionsService } from "./openai-completions";

export class KimiService extends OpenAICompletionsService {
  constructor(config: LLMConfig) {
    super({ ...config, provider: "kimi", api: config.api ?? "openai-completions" });
  }

  /** 带 Kimi builtin $web_search 的流式调用，自动禁用 thinking */
  streamWithBuiltinWebSearch(
    messages: APIMessage[],
    options?: StreamOptions,
  ) {
    const KIMI_WEB_SEARCH_TOOL: APIRequestTool = {
      type: "builtin_function",
      function: { name: "$web_search" },
    };
    return this._stream(messages as any, undefined, {
      ...options,
      tools: [KIMI_WEB_SEARCH_TOOL],
      thinking: { type: "disabled" },
    });
  }
}
