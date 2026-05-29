import { afterEach, describe, expect, it, vi } from "vitest";
import { runAgentLoop } from "../loop";
import { DeepSeekAnthropicService } from "../../llm/services/deepseek-anthropic";
import { ToolManager } from "../../tools/manager";
import type { Context } from "../../messages";
import type { InternalTool, ToolResult } from "../../internal-tools";

function createAnthropicMessage(overrides?: Record<string, unknown>) {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "deepseek-v4-pro",
    stop_reason: "end_turn",
    stop_sequence: null,
    content: [{ type: "text", text: "done", citations: null }],
    usage: {
      input_tokens: 10,
      output_tokens: 5,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_creation: null,
      output_tokens_details: null,
      server_tool_use: null,
      service_tier: null,
      inference_geo: null,
    },
    ...overrides,
  };
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

    const createSpy = vi
      .spyOn(llm["client"].messages, "create")
      .mockResolvedValueOnce(createAnthropicMessage({
        id: "msg_tool",
        stop_reason: "tool_use",
        content: [
          { type: "tool_use", id: "toolu_1", name: "read_file", input: { path: "README.md" }, caller: { type: "direct" } },
        ],
      }) as any)
      .mockResolvedValueOnce(createAnthropicMessage({
        id: "msg_final",
        content: [{ type: "text", text: "I read it.", citations: null }],
      }) as any);

    const result = await runAgentLoop(
      context,
      llm,
      { toolManager },
      () => {},
    );

    expect(result.message.stopReason).toBe("stop");
    expect(result.message.content).toEqual([{ type: "text", text: "I read it." }]);
    expect(createSpy).toHaveBeenCalledTimes(2);

    const secondRequest = createSpy.mock.calls[1][0] as any;
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
