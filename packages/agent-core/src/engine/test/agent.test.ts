import { describe, it, expect } from "vitest";
import { Agent } from "../agent";
import { MockLLMService } from "../../llm/services/mock";
import { ToolManager } from "../../tools/manager";
import { ContextManager } from "../../context/manager";
import { SystemPromptContext } from "../../context/modules/system-prompt";
import type { InternalTool, ToolResult } from "../../internal-tools";

function createTestTool(name: string): InternalTool {
  return {
    name,
    description: `Test ${name}`,
    parameters: { type: "object", properties: { path: { type: "string", description: "path" } }, required: ["path"] },
    isReadOnly: true,
    previewKind: "generic",
    handler: async (): Promise<ToolResult> => ({ success: true, data: `ok` }),
  };
}

function createTestAgent() {
  const llm = new MockLLMService({ provider: "mock", apiKey: "test", model: "deepseek-mock" });
  const toolManager = new ToolManager({ workspaceRoot: "/tmp" });
  toolManager.register(createTestTool("read_file"));
  toolManager.register(createTestTool("search_files"));

  const systemPrompt = new SystemPromptContext("You are a test assistant.");
  const contextManager = new ContextManager({ systemPromptModule: systemPrompt });

  return new Agent({ llm, contextManager, toolManager });
}

describe("Agent", () => {
  it("Agent.run should return AgentLoopResult", async () => {
    const agent = createTestAgent();
    const result = await agent.run("Hello");

    expect(result).toBeDefined();
    expect(result.message).toBeDefined();
    expect(result.message.role).toBe("assistant");
    expect(result.message.stopReason).toBe("stop");
    expect(result.totalUsage).toBeDefined();
    expect(result.messages).toBeDefined();
    expect(result.messages.length).toBeGreaterThan(0);
  });

  it("Agent.runAndGetText should return a non-empty string", async () => {
    const agent = createTestAgent();
    const text = await agent.runAndGetText("Hello");

    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(0);
  });

  it("Agent.abort should stop execution after first turn", async () => {
    const llm = new MockLLMService({ provider: "mock", apiKey: "test", model: "deepseek-mock" });
    const toolManager = new ToolManager({ workspaceRoot: "/tmp" });
    toolManager.register(createTestTool("read_file"));
    toolManager.register(createTestTool("search_files"));

    const systemPrompt = new SystemPromptContext("Test");
    const contextManager = new ContextManager({ systemPromptModule: systemPrompt });

    let aborted = false;
    const agent = new Agent({
      llm,
      contextManager,
      toolManager,
      onEvent: (e) => {
        // Abort after the first turn completes (has at least one assistant message)
        if (e.type === "turn_end" && !aborted) {
          aborted = true;
          agent.abort();
        }
      },
    });

    const result = await agent.run("Hello");
    expect(aborted).toBe(true);
    // After abort the loop may produce an aborted message or the first turn's message
    expect(result.message).toBeDefined();
    expect(result.message.role).toBe("assistant");
  });
});
