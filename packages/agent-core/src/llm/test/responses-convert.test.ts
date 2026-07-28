import { describe, expect, it } from "vitest";
import type { Context } from "../../messages";
import type { LLMConfig } from "../types";
import { convertContextToResponses, toResponsesTools } from "../responses-convert";

const target: LLMConfig = {
  provider: "duckcoding",
  api: "openai-responses",
  apiKey: "test-key",
  baseUrl: "https://api.duckcoding.ai/v1",
  model: "gpt-5.6-sol",
  input: ["text", "image"],
};

describe("Responses input conversion", () => {
  it("maps instructions, assistant tool calls, and tool outputs to Responses items", () => {
    const context: Context = {
      systemPrompt: "Stable system prompt",
      messages: [
        { role: "user", content: "Inspect the project", timestamp: 1 },
        {
          role: "assistant",
          api: "openai-responses",
          provider: "duckcoding",
          model: "gpt-5.6-sol",
          content: [
            { type: "text", text: "I will inspect it." },
            { type: "toolCall", id: "call_123", name: "read_file", arguments: { path: "README.md" } },
          ],
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, cacheHit: 0, cacheMiss: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
          stopReason: "toolUse",
          timestamp: 2,
        },
        {
          role: "toolResult",
          toolCallId: "call_123",
          toolName: "read_file",
          content: [{ type: "text", text: "project readme" }],
          isError: false,
          timestamp: 3,
        },
      ],
      tools: [],
    };

    expect(convertContextToResponses(context, target)).toEqual({
      instructions: "Stable system prompt",
      input: [
        { role: "user", content: "Inspect the project" },
        { role: "assistant", content: "I will inspect it.", type: "message", phase: "commentary" },
        { type: "function_call", call_id: "call_123", name: "read_file", arguments: "{\"path\":\"README.md\"}" },
        { type: "function_call_output", call_id: "call_123", output: "project readme" },
      ],
    });
  });

  it("maps user images and local function schemas without Chat Completions nesting", () => {
    const converted = convertContextToResponses({
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "Describe this" },
          { type: "image", data: "AAAA", mimeType: "image/png" },
        ],
        timestamp: 1,
      }],
    }, target);

    expect(converted.input).toEqual([{
      role: "user",
      content: [
        { type: "input_text", text: "Describe this" },
        { type: "input_image", detail: "auto", image_url: "data:image/png;base64,AAAA" },
      ],
    }]);
    expect(toResponsesTools([{
      type: "function",
      function: { name: "read_file", description: "Read a file", parameters: { type: "object" } },
    }])).toEqual([{
      type: "function",
      name: "read_file",
      description: "Read a file",
      parameters: { type: "object" },
      strict: false,
    }]);
  });

  it("replays encrypted reasoning items before their function calls", () => {
    const reasoning = {
      id: "rs_123",
      type: "reasoning",
      summary: [],
      encrypted_content: "encrypted-state",
      status: "completed",
    };
    const converted = convertContextToResponses({
      messages: [{
        role: "assistant",
        api: "openai-responses",
        provider: "duckcoding",
        model: "gpt-5.6-sol",
        content: [
          {
            type: "thinking",
            thinking: "",
            signature: `openai-responses-reasoning:${JSON.stringify(reasoning)}`,
          },
          { type: "toolCall", id: "call_1", name: "read_file", arguments: { path: "README.md" } },
        ],
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, cacheHit: 0, cacheMiss: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: "toolUse",
        timestamp: 1,
      }],
    }, target);

    expect(converted.input).toEqual([
      reasoning,
      { type: "function_call", call_id: "call_1", name: "read_file", arguments: "{\"path\":\"README.md\"}" },
      { type: "function_call_output", call_id: "call_1", output: "No result provided" },
    ]);
  });
});
