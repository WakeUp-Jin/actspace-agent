/**
 * LLM Service 层类型定义
 *
 * 分为四类：
 * 1. 配置类型 — LLMConfig, StreamOptions, SimpleStreamOptions
 * 2. API 格式 — APIMessage, APIToolCall（OpenAI 兼容，供 provider 实现使用）
 * 3. 流式事件 — AssistantMessageEvent, AssistantMessageEventStream
 * 4. 服务接口 — LLMService（取代旧的 BaseLLMService 抽象类）
 */

import type { AssistantMessage, Context, Tool } from "../messages";

// ─── LLM 配置 ───

export interface LLMConfig {
  provider: string;
  apiFormat?: "openai" | "anthropic";
  apiKey: string;
  baseUrl?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  maxRetries?: number;
}

// ─── Stream Options ───

export interface StreamOptions {
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  tools?: APIRequestTool[];
  thinking?: { type: "disabled" };
  thinkingEnabled?: boolean;
}

export interface SimpleStreamOptions {
  /** provider 无关的推理强度 */
  reasoning?: "low" | "medium" | "high";
  signal?: AbortSignal;
}

// ─── API Message Types（OpenAI 兼容格式） ───

export interface APIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type APIMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string | APIContentPart[] }
  | { role: "assistant"; content: string | null; tool_calls?: APIToolCall[] }
  | { role: "tool"; tool_call_id: string; name?: string; content: string };

export type APIContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "video_url"; video_url: { url: string } };

export type APIRequestTool =
  | {
      type: "function";
      function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
      };
    }
  | {
      type: "builtin_function";
      function: {
        name: "$web_search";
      };
    };

// ─── 流式事件 ───

/**
 * error 事件携带 AssistantMessage（含部分内容 + stopReason + errorMessage），
 * 而非 Error 对象。这样即使出错，消费方也能拿到已收到的部分响应。
 */
export type AssistantMessageEvent =
  | { type: "text_delta"; delta: string }
  | { type: "thinking_delta"; delta: string }
  | {
      type: "tool_call_delta";
      index: number;
      /** 累积到当前的 tool_call id（首个 chunk 出现后即可用），向后兼容仍允许缺省 */
      toolCallId?: string;
      /** 累积到当前的 tool 名称（首个 chunk 出现后即可用） */
      toolName?: string;
      delta: string;
    }
  | { type: "done"; message: AssistantMessage }
  | { type: "error"; message: AssistantMessage };

// ─── AssistantMessageEventStream ───

export class AssistantMessageEventStream {
  constructor(private source: AsyncIterable<AssistantMessageEvent>) {}

  async *[Symbol.asyncIterator](): AsyncGenerator<AssistantMessageEvent> {
    yield* this.source;
  }

  /**
   * 消费整个流，返回最终的 AssistantMessage。
   * 错误时不 throw，而是返回带 stopReason "error"/"aborted" 和 errorMessage 的 AssistantMessage，
   * 让消费方统一通过 stopReason 判断结果状态。
   */
  async result(): Promise<AssistantMessage> {
    let finalMessage: AssistantMessage | undefined;
    for await (const event of this.source) {
      if (event.type === "done") {
        finalMessage = event.message;
      }
      if (event.type === "error") {
        return event.message;
      }
    }
    if (!finalMessage) throw new Error("Stream ended without producing a message");
    return finalMessage;
  }
}

// ─── Provider 错误分类 ───

export type LLMErrorKind =
  | "network"
  | "rate_limit"
  | "auth"
  | "insufficient_balance"
  | "invalid_request"
  | "server_error"
  | "unknown";

export class LLMServiceError extends Error {
  constructor(
    message: string,
    public readonly kind: LLMErrorKind,
    public readonly retryable: boolean,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = "LLMServiceError";
  }
}

// ─── LLM Service 接口 ───

export interface LLMService {
  stream(context: Context, options?: StreamOptions): AssistantMessageEventStream;
  complete(context: Context, options?: StreamOptions): Promise<AssistantMessage>;
  streamSimple(context: Context, options?: SimpleStreamOptions): AssistantMessageEventStream;
  completeSimple(context: Context, options?: SimpleStreamOptions): Promise<AssistantMessage>;
}
