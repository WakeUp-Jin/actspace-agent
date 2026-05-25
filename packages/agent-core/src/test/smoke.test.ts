import { describe, it, expect } from "vitest";
import { Agent } from "../engine/agent";
import { MockLLMService } from "../llm/services/mock";
import { ToolManager } from "../tools/manager";
import { ContextManager } from "../context/manager";
import { SystemPromptContext } from "../context/modules/system-prompt";
import type { AgentEvent } from "../engine/types";
import type { InternalTool, ToolResult } from "../internal-tools";

function createMockTool(name: string): InternalTool {
  return {
    name,
    description: `Mock ${name} tool`,
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "file path" } },
      required: ["path"],
    },
    isReadOnly: true,
    previewKind: "generic",
    handler: async (args): Promise<ToolResult> => ({
      success: true,
      data: `Mock result for ${name}: ${args.path}`,
    }),
  };
}

describe("E2E Smoke: Agent.run full pipeline", () => {
  it("should complete a full turn with tool calls and final reply", async () => {
    const llm = new MockLLMService({
      provider: "mock",
      apiKey: "test",
      model: "deepseek-mock",
    });

    const toolManager = new ToolManager({ workspaceRoot: "/tmp/test" });
    toolManager.register(createMockTool("read_file"));
    toolManager.register(createMockTool("search_files"));

    const systemPrompt = new SystemPromptContext("You are a test assistant.");
    const contextManager = new ContextManager({ systemPromptModule: systemPrompt });

    const events: AgentEvent[] = [];
    const agent = new Agent({
      llm,
      contextManager,
      toolManager,
      onEvent: (e) => { events.push(e); },
    });

    const result = await agent.run("Analyze the project structure");

    // 最终 message 验证
    expect(result.message.role).toBe("assistant");
    expect(result.message.stopReason).toBe("stop");
    expect(result.message.content.some((c) => c.type === "text")).toBe(true);

    // usage 有值
    expect(result.totalUsage.totalTokens).toBeGreaterThan(0);

    // 事件序列验证
    const eventTypes = events.map((e) => e.type);
    expect(eventTypes[0]).toBe("agent_start");
    expect(eventTypes[eventTypes.length - 1]).toBe("agent_end");
    expect(eventTypes).toContain("turn_start");
    expect(eventTypes).toContain("turn_end");
    expect(eventTypes).toContain("tool_start");
    expect(eventTypes).toContain("tool_end");

    // 至少 2 轮 turn（第一轮 tool calls，第二轮 final reply）
    const turnStarts = eventTypes.filter((t) => t === "turn_start");
    expect(turnStarts.length).toBeGreaterThanOrEqual(2);

    // messages 包含 user + assistant + tool results
    expect(result.messages.length).toBeGreaterThanOrEqual(3);
  });

  it("should collect tool_start and tool_end events for each tool call", async () => {
    const llm = new MockLLMService({
      provider: "mock",
      apiKey: "test",
      model: "deepseek-mock",
    });

    const toolManager = new ToolManager({ workspaceRoot: "/tmp/test" });
    toolManager.register(createMockTool("read_file"));
    toolManager.register(createMockTool("search_files"));

    const systemPrompt = new SystemPromptContext("You are a test assistant.");
    const contextManager = new ContextManager({ systemPromptModule: systemPrompt });

    const events: AgentEvent[] = [];
    const agent = new Agent({
      llm,
      contextManager,
      toolManager,
      onEvent: (e) => { events.push(e); },
    });

    await agent.run("Test");

    const toolStarts = events.filter((e) => e.type === "tool_start");
    const toolEnds = events.filter((e) => e.type === "tool_end");

    // MockLLMService 第一轮发出 read_file + search_files 两个 tool calls
    expect(toolStarts.length).toBe(2);
    expect(toolEnds.length).toBe(2);

    for (const te of toolEnds) {
      if (te.type === "tool_end") {
        expect(te.isError).toBe(false);
      }
    }
  });

  it("should work with Agent.runAndGetText", async () => {
    const llm = new MockLLMService({
      provider: "mock",
      apiKey: "test",
      model: "deepseek-mock",
    });

    const toolManager = new ToolManager({ workspaceRoot: "/tmp/test" });
    toolManager.register(createMockTool("read_file"));
    toolManager.register(createMockTool("search_files"));

    const systemPrompt = new SystemPromptContext("You are a test assistant.");
    const contextManager = new ContextManager({ systemPromptModule: systemPrompt });

    const agent = new Agent({ llm, contextManager, toolManager });

    const text = await agent.runAndGetText("Hello");
    expect(text).toBeTruthy();
    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(0);
  });
});
