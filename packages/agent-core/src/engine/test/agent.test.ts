import { describe, it, expect } from "vitest";
import { Agent } from "../agent";
import { MockLLMService, mockText, mockToolCall } from "../../llm/services/mock";
import { ToolManager } from "../../tools/manager";
import { ContextManager } from "../../context/manager";
import { SystemPromptContext } from "../../context/modules/system-prompt";
import type { InternalTool, ToolResult } from "../../internal-tools";
import type { ToolDefinitionSpec } from "../../tools/types";

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
  toolManager.register(createTestTool("grep"));

  const systemPrompt = new SystemPromptContext("You are a test assistant.");
  const contextManager = new ContextManager({ systemPromptModule: systemPrompt });

  return new Agent({ llm, contextManager, toolManager });
}

describe("Agent", () => {
  it("resets progressive tool disclosure for the next user run", async () => {
    const llm = new MockLLMService({ provider: "mock", apiKey: "test", model: "deepseek-mock" });
    const toolManager = new ToolManager({ workspaceRoot: "/tmp" });
    const gateway: ToolDefinitionSpec = {
      name: "browser_help",
      description: "Browser gateway",
      parameters: { type: "object", properties: {}, required: [] },
      isReadOnly: true,
      category: "browser",
      previewKind: "browser_help",
      progressiveDisclosure: { group: "browser", role: "gateway" },
    };
    const deferred: ToolDefinitionSpec = {
      name: "browser_tabs",
      description: "Browser tabs",
      parameters: { type: "object", properties: {}, required: [] },
      isReadOnly: true,
      category: "browser",
      previewKind: "browser_tabs",
      progressiveDisclosure: { group: "browser", role: "deferred" },
    };
    toolManager.registerFromSpec(gateway, async () => ({ success: true, data: "ready" }));
    toolManager.registerFromSpec(deferred, async () => ({ success: true, data: "tabs" }));
    const contextManager = new ContextManager({
      systemPromptModule: new SystemPromptContext("Test"),
    });
    const visibleTools: string[][] = [];
    llm.setResponses([
      (context) => {
        visibleTools.push(context.tools?.map((tool) => tool.name) ?? []);
        return mockToolCall("browser_help", {}, { id: "gateway" });
      },
      (context) => {
        visibleTools.push(context.tools?.map((tool) => tool.name) ?? []);
        return mockText("first run done");
      },
      (context) => {
        visibleTools.push(context.tools?.map((tool) => tool.name) ?? []);
        return mockText("second run done");
      },
    ]);
    const agent = new Agent({ llm, contextManager, toolManager });

    await agent.run("use browser");
    await agent.run("ordinary follow-up");

    expect(visibleTools).toEqual([
      ["browser_help"],
      ["browser_help", "browser_tabs"],
      ["browser_help"],
    ]);
  });

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
    toolManager.register(createTestTool("grep"));

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
