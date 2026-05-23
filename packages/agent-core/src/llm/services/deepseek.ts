/**
 * DeepSeekService — 通过 OpenAI 兼容 SDK 接入 DeepSeek API
 *
 * V0 骨架：定义类结构和配置解析，真实 HTTP 接入待后续实现。
 * 在没有 API key 时返回结构化错误，而非抛出裸异常。
 */

import type { AssistantMessage, Tool } from "../../messages";
import { createEmptyUsage } from "../../messages";
import { BaseLLMService } from "../base";
import type { APIMessage, StreamOptions } from "../types";
import { AssistantMessageEventStream, LLMServiceError } from "../types";

const DEFAULT_BASE_URL = "https://api.deepseek.com";

export class DeepSeekService extends BaseLLMService {
  private get baseUrl(): string {
    return this.config.baseUrl ?? DEFAULT_BASE_URL;
  }

  protected _doStream(
    messages: APIMessage[],
    tools?: Tool[],
    _options?: StreamOptions,
  ): AssistantMessageEventStream {
    const self = this;

    async function* generate() {
      if (!self.config.apiKey) {
        yield {
          type: "error" as const,
          error: new LLMServiceError(
            "DeepSeek API key not configured. Set DEEPSEEK_API_KEY environment variable or pass apiKey in config.",
            "auth",
            false,
          ),
        };
        return;
      }

      // V0 骨架：返回占位消息，表明需要真实实现
      // 真实实现会：
      // 1. 构造 HTTP POST 到 ${baseUrl}/chat/completions
      // 2. 设置 stream: true
      // 3. 解析 SSE 事件流
      // 4. 将 delta 映射为 AssistantMessageEvent
      // 5. 在 done 事件中组装完整 AssistantMessage

      const msg: AssistantMessage = {
        role: "assistant",
        content: [
          {
            type: "text",
            text: `[DeepSeekService skeleton] Real API call to ${self.baseUrl} not yet implemented. Model: ${self.config.model}. Messages: ${messages.length}, Tools: ${tools?.length ?? 0}.`,
          },
        ],
        model: self.config.model,
        provider: "deepseek",
        usage: createEmptyUsage(),
        stopReason: "stop",
        timestamp: Date.now(),
        source: "llm",
      };

      yield { type: "text_delta" as const, delta: msg.content[0].type === "text" ? (msg.content[0] as { text: string }).text : "" };
      yield { type: "done" as const, message: msg };
    }

    return new AssistantMessageEventStream(generate());
  }
}
