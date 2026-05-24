/**
 * BaseLLMService — stream-first 抽象基类
 *
 * 子类只需实现 _doStream，基类提供 stream/complete/streamSimple/completeSimple。
 * convertMessages() 默认实现 OpenAI 兼容格式，子类可重写。
 *
 * 设计参考：.agents/skills/llm-agent-dev/references/llm/llm-service.md
 * 代码参考：.agents/skills/llm-agent-dev/examples/llm-service.ts
 */

import type {
  Context,
  AssistantMessage,
  ImageContent,
  TextContent,
  Tool,
} from "../messages";
import { getTextContent, getToolCalls, hasToolCalls } from "../messages";
import type {
  APIMessage,
  APIContentPart,
  LLMConfig,
  SimpleStreamOptions,
  StreamOptions,
} from "./types";
import { AssistantMessageEventStream } from "./types";

export abstract class BaseLLMService {
  protected config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  /** 子类必须实现：流式补全，接收已转换的 API 格式消息 */
  protected abstract _doStream(
    messages: APIMessage[],
    tools?: Tool[],
    options?: StreamOptions,
  ): AssistantMessageEventStream;

  /** 流式调用：转换消息后交给 _doStream */
  stream(context: Context, options?: StreamOptions): AssistantMessageEventStream {
    const messages = this.convertMessages(context);
    return this._doStream(messages, context.tools, options);
  }

  /** 非流式调用：等待流完成，返回 AssistantMessage */
  async complete(context: Context, options?: StreamOptions): Promise<AssistantMessage> {
    return this.stream(context, options).result();
  }

  /** 流式调用（通用选项）：将 SimpleStreamOptions 映射为 StreamOptions */
  streamSimple(context: Context, options?: SimpleStreamOptions): AssistantMessageEventStream {
    return this.stream(context, this.resolveSimpleOptions(options));
  }

  /** 非流式调用（通用选项）——执行引擎调用的主入口 */
  async completeSimple(context: Context, options?: SimpleStreamOptions): Promise<AssistantMessage> {
    return this.streamSimple(context, options).result();
  }

  /**
   * 将 Context 中的 Message[] 转为 OpenAI 兼容的 API 消息格式。
   * 默认实现适用于 OpenAI / DeepSeek / Groq 等兼容 API。
   * 子类可重写以适配 Anthropic 等非兼容 provider。
   */
  protected convertMessages(context: Context): APIMessage[] {
    const result: APIMessage[] = [];

    if (context.systemPrompt) {
      result.push({ role: "system", content: context.systemPrompt });
    }

    for (const msg of context.messages) {
      switch (msg.role) {
        case "user":
          result.push({
            role: "user",
            content: toAPIUserContent(msg.content),
          });
          break;

        case "assistant":
          result.push({
            role: "assistant",
            content: getTextContent(msg) || null,
            ...(hasToolCalls(msg) && {
              tool_calls: getToolCalls(msg).map((tc) => ({
                id: tc.id,
                type: "function" as const,
                function: {
                  name: tc.name,
                  arguments: JSON.stringify(tc.arguments),
                },
              })),
            }),
          });
          break;

        case "toolResult":
          result.push({
            role: "tool",
            tool_call_id: msg.toolCallId,
            content: msg.content
              .filter((c): c is TextContent => c.type === "text")
              .map((c) => c.text)
              .join(""),
          });
          break;
      }
    }

    return result;
  }

  /** 将通用选项映射为 provider 选项，子类可重写以支持 reasoning 等参数 */
  protected resolveSimpleOptions(options?: SimpleStreamOptions): StreamOptions {
    if (!options) return {};
    return {
      signal: options.signal,
    };
  }
}

function toAPIUserContent(content: string | (TextContent | ImageContent)[]): string | APIContentPart[] {
  if (typeof content === "string") return content;

  if (content.every((part) => part.type === "text")) {
    return content.map((part) => part.text).join("");
  }

  const parts: APIContentPart[] = content.map((part) => {
    if (part.type === "text") {
      return { type: "text", text: part.text };
    }
    return {
      type: "image_url",
      image_url: { url: part.data.startsWith("data:") ? part.data : `data:${part.mimeType};base64,${part.data}` },
    };
  });

  return parts;
}
