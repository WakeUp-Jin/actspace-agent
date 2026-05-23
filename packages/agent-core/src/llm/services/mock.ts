/**
 * MockLLMService — 开发测试用 mock provider
 *
 * 行为设计：
 * - 第一次调用（上下文中无 ToolResultMessage）：返回 thinking + tool calls（stopReason: toolUse）
 * - 后续调用（上下文中有 ToolResultMessage）：返回 thinking + final text（stopReason: stop）
 *
 * 这确保执行引擎可以在没有真实 API 的情况下完整跑通 tool-call loop。
 */

import type { AssistantMessage, Tool } from "../../messages";
import { createEmptyUsage } from "../../messages";
import { BaseLLMService } from "../base";
import type { APIMessage, StreamOptions } from "../types";
import { AssistantMessageEventStream } from "../types";

export class MockLLMService extends BaseLLMService {
  private callCount = 0;

  protected _doStream(
    messages: APIMessage[],
    _tools?: Tool[],
    _options?: StreamOptions,
  ): AssistantMessageEventStream {
    const hasToolResults = messages.some((m) => m.role === "tool");
    const self = this;

    async function* generate() {
      self.callCount++;

      if (!hasToolResults) {
        yield { type: "thinking_delta" as const, delta: "Let me inspect the workspace" };
        yield { type: "thinking_delta" as const, delta: " and gather context." };

        const userContent = messages.find((m) => m.role === "user")?.content ?? "unknown request";

        const msg: AssistantMessage = {
          role: "assistant",
          content: [
            {
              type: "thinking",
              thinking: "Let me inspect the workspace and gather context.",
            },
            {
              type: "toolCall",
              id: `mock_tc_read_${self.callCount}`,
              name: "read_file",
              arguments: { path: "README.md" },
            },
            {
              type: "toolCall",
              id: `mock_tc_search_${self.callCount}`,
              name: "search_files",
              arguments: { query: String(userContent).slice(0, 50) },
            },
          ],
          model: self.config.model,
          provider: "deepseek-mock",
          usage: {
            ...createEmptyUsage(),
            input: 820,
            output: 340,
            totalTokens: 1160,
          },
          stopReason: "toolUse",
          timestamp: Date.now(),
          source: "llm",
        };

        yield { type: "done" as const, message: msg };
      } else {
        yield { type: "thinking_delta" as const, delta: "I have the context. " };
        yield { type: "thinking_delta" as const, delta: "Let me summarize." };
        yield { type: "text_delta" as const, delta: "Based on my analysis" };
        yield { type: "text_delta" as const, delta: ", the project is well-structured." };

        const msg: AssistantMessage = {
          role: "assistant",
          content: [
            {
              type: "thinking",
              thinking: "I have the context. Let me summarize.",
            },
            {
              type: "text",
              text: "Based on my analysis, the project is well-structured. The monorepo layout with `packages/desktop`, `packages/agent-core`, and `packages/shared` follows clean separation of concerns.",
            },
          ],
          model: self.config.model,
          provider: "deepseek-mock",
          usage: {
            ...createEmptyUsage(),
            input: 2100,
            output: 520,
            totalTokens: 2620,
          },
          stopReason: "stop",
          timestamp: Date.now(),
          source: "llm",
        };

        yield { type: "done" as const, message: msg };
      }
    }

    return new AssistantMessageEventStream(generate());
  }
}
