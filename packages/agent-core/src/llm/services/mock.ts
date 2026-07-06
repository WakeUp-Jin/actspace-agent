/**
 * MockLLMService — 开发测试用 mock provider
 *
 * 支持两种模式：
 * 1. Response queue 模式（推荐）：通过 setResponses/appendResponses 预设响应序列，
 *    每次 stream 调用从队列取下一个。支持静态 AssistantMessage 和动态 ResponseFactory。
 * 2. 默认模式（向后兼容）：未设置 response queue 时，自动根据上下文是否含 toolResult
 *    决定返回 tool calls 或 final text。
 *
 * 参考 pi-ai faux provider 设计。
 */

import type { AssistantMessage, Context, TextContent, ThinkingContent, ToolCallContent } from "../../messages";
import { createEmptyUsage } from "../../messages";
import type { LLMService, LLMConfig, StreamOptions, SimpleStreamOptions, AssistantMessageEvent } from "../types";
import { AssistantMessageEventStream } from "../types";

// ─── 公共类型 ───

export type ResponseFactory = (
  context: Context,
  options: StreamOptions | undefined,
  state: { callCount: number },
) => AssistantMessage | Promise<AssistantMessage>;

export type MockResponseStep = AssistantMessage | ResponseFactory;

// ─── 辅助工厂 ───

export function mockText(text: string, options?: { thinking?: string }): AssistantMessage {
  const content: (TextContent | ThinkingContent)[] = [];
  if (options?.thinking) {
    content.push({ type: "thinking", thinking: options.thinking });
  }
  content.push({ type: "text", text });
  return {
    role: "assistant",
    content,
    model: "mock-model",
    provider: "mock",
    usage: createEmptyUsage(),
    stopReason: "stop",
    timestamp: Date.now(),
    source: "llm",
  };
}

export function mockToolCall(
  name: string,
  args: Record<string, unknown>,
  options?: { id?: string; thinking?: string },
): AssistantMessage {
  const content: (ThinkingContent | ToolCallContent)[] = [];
  if (options?.thinking) {
    content.push({ type: "thinking", thinking: options.thinking });
  }
  content.push({
    type: "toolCall",
    id: options?.id ?? `mock_tc_${Date.now()}`,
    name,
    arguments: args,
  });
  return {
    role: "assistant",
    content,
    model: "mock-model",
    provider: "mock",
    usage: createEmptyUsage(),
    stopReason: "toolUse",
    timestamp: Date.now(),
    source: "llm",
  };
}

export function mockError(
  errorMessage: string,
  stopReason: "error" | "aborted" = "error",
  options?: { errorKind?: string; errorRetryable?: boolean },
): AssistantMessage {
  return {
    role: "assistant",
    content: [],
    model: "mock-model",
    provider: "mock",
    usage: createEmptyUsage(),
    stopReason,
    errorMessage,
    ...(options?.errorKind !== undefined ? { errorKind: options.errorKind } : {}),
    ...(options?.errorRetryable !== undefined ? { errorRetryable: options.errorRetryable } : {}),
    timestamp: Date.now(),
    source: "llm",
  };
}

// ─── MockLLMService ───

export class MockLLMService implements LLMService {
  private config: LLMConfig;
  private responses: MockResponseStep[] = [];
  private _state = { callCount: 0 };

  constructor(config: LLMConfig) {
    this.config = config;
  }

  get state(): { callCount: number } {
    return this._state;
  }

  setResponses(responses: MockResponseStep[]): void {
    this.responses = [...responses];
  }

  appendResponses(responses: MockResponseStep[]): void {
    this.responses.push(...responses);
  }

  getPendingCount(): number {
    return this.responses.length;
  }

  stream(context: Context, options?: StreamOptions): AssistantMessageEventStream {
    return this._doStream(context, options);
  }

  async complete(context: Context, options?: StreamOptions): Promise<AssistantMessage> {
    return this.stream(context, options).result();
  }

  streamSimple(context: Context, options?: SimpleStreamOptions): AssistantMessageEventStream {
    return this.stream(context, options ? { signal: options.signal } : undefined);
  }

  async completeSimple(context: Context, options?: SimpleStreamOptions): Promise<AssistantMessage> {
    return this.streamSimple(context, options).result();
  }

  private _doStream(context: Context, options?: StreamOptions): AssistantMessageEventStream {
    const self = this;

    async function* generate(): AsyncGenerator<AssistantMessageEvent> {
      self._state.callCount++;

      let message: AssistantMessage;

      if (self.responses.length > 0) {
        const step = self.responses.shift()!;
        if (typeof step === "function") {
          message = await step(context, options, self._state);
        } else {
          message = { ...step, timestamp: Date.now() };
        }
      } else {
        message = self.buildDefaultResponse(context);
      }

      message = {
        ...message,
        model: self.config.model,
        provider: message.provider === "mock" ? "mock" : message.provider,
      };

      // Emit deltas for content blocks
      for (const block of message.content) {
        if (block.type === "thinking") {
          yield { type: "thinking_delta", delta: block.thinking };
        } else if (block.type === "text") {
          yield { type: "text_delta", delta: block.text };
        } else if (block.type === "toolCall") {
          yield {
            type: "tool_call_delta",
            index: message.content.filter((b) => b.type === "toolCall").indexOf(block),
            toolCallId: block.id,
            toolName: block.name,
            delta: JSON.stringify(block.arguments),
          };
        }
      }

      if (message.stopReason === "error" || message.stopReason === "aborted") {
        yield { type: "error", message };
      } else {
        yield { type: "done", message };
      }
    }

    return new AssistantMessageEventStream(generate());
  }

  /**
   * 默认行为（向后兼容）：
   * - 无 toolResult → 返回 thinking + tool calls
   * - 有 toolResult → 返回 thinking + final text
   */
  private buildDefaultResponse(context: Context): AssistantMessage {
    const hasToolResults = context.messages.some((m) => m.role === "toolResult");

    if (!hasToolResults) {
      const userMsg = context.messages.find((m) => m.role === "user");
      const userContent = userMsg
        ? (typeof userMsg.content === "string" ? userMsg.content : "unknown request")
        : "unknown request";

      return {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "Let me inspect the workspace and gather context." },
          {
            type: "toolCall",
            id: `mock_tc_read_${this._state.callCount}`,
            name: "read_file",
            arguments: { path: "README.md" },
          },
          {
            type: "toolCall",
            id: `mock_tc_grep_${this._state.callCount}`,
            name: "grep",
            arguments: { pattern: String(userContent).slice(0, 50) },
          },
        ],
        model: this.config.model,
        provider: "mock",
        usage: { ...createEmptyUsage(), input: 820, output: 340, totalTokens: 1160 },
        stopReason: "toolUse",
        timestamp: Date.now(),
        source: "llm",
      };
    }

    return {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "I have the context. Let me summarize." },
        {
          type: "text",
          text: "Based on my analysis, the project is well-structured. The monorepo layout with `packages/desktop`, `packages/agent-core`, and `packages/shared` follows clean separation of concerns.",
        },
      ],
      model: this.config.model,
      provider: "mock",
      usage: { ...createEmptyUsage(), input: 2100, output: 520, totalTokens: 2620 },
      stopReason: "stop",
      timestamp: Date.now(),
      source: "llm",
    };
  }
}
