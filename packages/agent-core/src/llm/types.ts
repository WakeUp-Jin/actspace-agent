/**
 * LLM Service 层类型定义
 *
 * 分为三类：
 * 1. 配置类型 — LLMConfig, StreamOptions, SimpleStreamOptions
 * 2. API 格式 — APIMessage, APIToolCall（OpenAI 兼容，供 provider 实现使用）
 * 3. 流式事件 — AssistantMessageEvent, AssistantMessageEventStream
 */

import type { AssistantMessage, Tool } from "../messages";

// ─── LLM 配置 ───

export interface LLMConfig {
  provider: string;
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

export type AssistantMessageEvent =
  | { type: "text_delta"; delta: string }
  | { type: "thinking_delta"; delta: string }
  | { type: "tool_call_delta"; index: number; delta: string }
  | { type: "done"; message: AssistantMessage }
  | { type: "error"; error: Error };

// ─── AssistantMessageEventStream ───

export class AssistantMessageEventStream {
  constructor(private source: AsyncIterable<AssistantMessageEvent>) {}

  async *[Symbol.asyncIterator](): AsyncGenerator<AssistantMessageEvent> {
    yield* this.source;
  }

  async result(): Promise<AssistantMessage> {
    let finalMessage: AssistantMessage | undefined;
    for await (const event of this.source) {
      if (event.type === "done") {
        finalMessage = event.message;
      }
      if (event.type === "error") {
        throw event.error;
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
