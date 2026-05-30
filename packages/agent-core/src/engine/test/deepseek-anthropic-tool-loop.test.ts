import { afterEach, describe, expect, it, vi } from "vitest";
import { runAgentLoop } from "../loop";
import { DeepSeekAnthropicService } from "../../llm/services/deepseek-anthropic";
import { ToolManager } from "../../tools/manager";
import type { Context } from "../../messages";
import type { InternalTool, ToolResult } from "../../internal-tools";

/** 把一组 Anthropic raw stream events 包装成 client.messages.stream 的返回值。 */
function streamOf(events: unknown[]): AsyncIterable<unknown> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) {
        yield event;
      }
    },
  };
}

/** 单 text block 的流式事件序列。 */
function textStream(text: string) {
  return streamOf([
    { type: "message_start", message: { usage: { input_tokens: 10, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 5 } },
    { type: "message_stop" },
  ]);
}

/** 单 tool_use block 的流式事件序列。 */
function toolUseStream(id: string, name: string, input: Record<string, unknown>) {
  return streamOf([
    { type: "message_start", message: { usage: { input_tokens: 10, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } },
    { type: "content_block_start", index: 0, content_block: { type: "tool_use", id, name, input: {} } },
    { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify(input) } },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 5 } },
    { type: "message_stop" },
  ]);
}

function createReadFileTool(): InternalTool {
  return {
    name: "read_file",
    description: "Read a file",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "File path" } },
      required: ["path"],
    },
    isReadOnly: true,
    previewKind: "file_read",
    handler: async (): Promise<ToolResult> => ({ success: true, data: "file content" }),
  };
}

describe("DeepSeek Anthropic local tool loop", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("executes local tools and replays tool_result in the next Anthropic request", async () => {
    const llm = new DeepSeekAnthropicService({
      provider: "deepseek",
      apiFormat: "anthropic",
      apiKey: "test-key",
      model: "deepseek-v4-pro",
    });
    const toolManager = new ToolManager({ workspaceRoot: "/tmp" });
    toolManager.register(createReadFileTool());

    const context: Context = {
      systemPrompt: "Test assistant",
      messages: [{ role: "user", content: "Read README.md", timestamp: Date.now() }],
      tools: toolManager.getToolDefinitions(),
    };

    const streamSpy = vi
      .spyOn(llm["client"].messages, "stream")
      .mockReturnValueOnce(toolUseStream("toolu_1", "read_file", { path: "README.md" }) as any)
      .mockReturnValueOnce(textStream("I read it.") as any);

    const result = await runAgentLoop(
      context,
      llm,
      { toolManager },
      () => {},
    );

    expect(result.message.stopReason).toBe("stop");
    expect(result.message.content).toEqual([{ type: "text", text: "I read it." }]);
    expect(streamSpy).toHaveBeenCalledTimes(2);

    const secondRequest = streamSpy.mock.calls[1][0] as any;
    expect(secondRequest.messages).toEqual([
      { role: "user", content: "Read README.md" },
      {
        role: "assistant",
        content: [
          { type: "tool_use", id: "toolu_1", name: "read_file", input: { path: "README.md" } },
        ],
      },
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "toolu_1", content: "file content" },
        ],
      },
    ]);
  });
});
