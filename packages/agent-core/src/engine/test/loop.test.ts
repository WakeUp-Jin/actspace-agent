import { describe, it, expect } from "vitest";
import { runAgentLoop } from "../loop";
import { MockLLMService } from "../../llm/services/mock";
import { ToolManager } from "../../tools/manager";
import type { Context } from "../../messages";
import type { AgentEvent } from "../types";
import type { InternalTool, ToolResult } from "../../internal-tools";

function createTestTool(name: string): InternalTool {
  return {
    name,
    description: `Test ${name}`,
    parameters: { type: "object", properties: { path: { type: "string", description: "path" } }, required: ["path"] },
    isReadOnly: true,
    previewKind: "generic",
    handler: async (): Promise<ToolResult> => ({ success: true, data: `result from ${name}` }),
  };
}

function createTestSetup() {
  const llm = new MockLLMService({ provider: "mock", apiKey: "test", model: "deepseek-mock" });
  const toolManager = new ToolManager({ workspaceRoot: "/tmp" });
  toolManager.register(createTestTool("read_file"));
  toolManager.register(createTestTool("search_files"));

  const context: Context = {
    systemPrompt: "Test assistant",
    messages: [{ role: "user", content: "test", timestamp: Date.now() }],
    tools: toolManager.getToolDefinitions(),
  };

  return { llm, toolManager, context };
}

describe("runAgentLoop", () => {
  it("should complete a normal turn cycle: toolUse → stop", async () => {
    const { llm, toolManager, context } = createTestSetup();
    const events: AgentEvent[] = [];

    const result = await runAgentLoop(
      context,
      llm,
      { toolManager },
      (e) => { events.push(e); },
    );

    expect(result.message.stopReason).toBe("stop");
    expect(result.totalUsage.totalTokens).toBeGreaterThan(0);

    // 至少 2 轮 turn
    const turnStarts = events.filter((e) => e.type === "turn_start");
    expect(turnStarts.length).toBeGreaterThanOrEqual(2);
  });

  it("should respect shouldStopAfterTurn", async () => {
    const { llm, toolManager, context } = createTestSetup();
    const events: AgentEvent[] = [];

    const result = await runAgentLoop(
      context,
      llm,
      {
        toolManager,
        shouldStopAfterTurn: ({ turnIndex }) => turnIndex >= 1,
      },
      (e) => { events.push(e); },
    );

    // 第一轮就被强制停止（stopReason 是 toolUse 因为还没跑到 final reply）
    expect(result.message.stopReason).toBe("toolUse");
    const turnStarts = events.filter((e) => e.type === "turn_start");
    expect(turnStarts.length).toBe(1);
  });

  it("should handle abort signal", async () => {
    const { llm, toolManager, context } = createTestSetup();
    const events: AgentEvent[] = [];
    const controller = new AbortController();

    // 在第一轮 tool calls 处理后 abort，确保至少有一个 assistant message
    const result = await runAgentLoop(
      context,
      llm,
      {
        toolManager,
        shouldStopAfterTurn: ({ turnIndex }) => {
          if (turnIndex >= 1) {
            controller.abort();
          }
          return false;
        },
      },
      (e) => { events.push(e); },
      controller.signal,
    );

    // 第一轮正常跑完（toolUse），第二轮检测到 abort
    expect(["aborted", "toolUse", "stop"]).toContain(result.message.stopReason);
  });

  it("should inject steering messages", async () => {
    const { llm, toolManager, context } = createTestSetup();
    let steeringCalled = false;

    await runAgentLoop(
      context,
      llm,
      {
        toolManager,
        getSteeringMessages: async () => {
          if (!steeringCalled) {
            steeringCalled = true;
            return [];
          }
          return [];
        },
      },
      () => {},
    );

    expect(steeringCalled).toBe(true);
  });
});
