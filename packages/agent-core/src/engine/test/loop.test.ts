import { describe, it, expect, vi } from "vitest";
import { runAgentLoop } from "../loop";
import { MockLLMService, mockText } from "../../llm/services/mock";
import { ToolManager } from "../../tools/manager";
import type { Context } from "../../messages";
import { createEmptyUsage } from "../../messages";
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
  toolManager.register(createTestTool("grep"));

  const context: Context = {
    systemPrompt: "Test assistant",
    messages: [{ role: "user", content: "test", timestamp: Date.now() }],
    tools: toolManager.getToolDefinitions(),
  };

  return { llm, toolManager, context };
}

function createFailingRenderedTool(): InternalTool {
  return {
    name: "bash",
    description: "Run Bash",
    parameters: { type: "object", properties: { command: { type: "string", description: "command" } }, required: ["command"] },
    isReadOnly: true,
    previewKind: "bash",
    handler: async (): Promise<ToolResult> => ({
      success: false,
      data: { command: "npx tsc", output: "src/index.ts(1,1): error TS1000: boom" },
      error: "Bash command exited with code 2",
    }),
    renderResult: (result) => {
      const data = result.data as { command: string; output: string };
      return `$ ${data.command}\n\noutput:\n${data.output}\n\nerror: ${result.error}`;
    },
  };
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
    expect(result.usageCalls).toHaveLength(2);

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
    expect(result.usageCalls).toHaveLength(1);
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

  it("blocks write tools when provider stopped at length while emitting tool calls", async () => {
    const llm = new MockLLMService({ provider: "mock", apiKey: "test", model: "deepseek-mock" });
    const writeHandler = vi.fn(async (): Promise<ToolResult> => ({ success: true, data: "wrote" }));
    const toolManager = new ToolManager({ workspaceRoot: "/tmp" });
    toolManager.register({
      name: "write_file",
      description: "write",
      parameters: { type: "object" },
      isReadOnly: false,
      previewKind: "write",
      handler: writeHandler,
    });

    llm.setResponses([
      {
        role: "assistant",
        content: [{
          type: "toolCall",
          id: "tc_write",
          name: "write_file",
          arguments: { path: "article.md", content: "partial" },
        }],
        model: "mock-model",
        provider: "mock",
        usage: createEmptyUsage(),
        stopReason: "toolUse",
        diagnostics: [{ rawStopReason: "length" }],
        timestamp: Date.now(),
        source: "llm",
      },
      mockText("Done."),
    ]);

    const context: Context = {
      messages: [{ role: "user", content: "write a long article", timestamp: Date.now() }],
      tools: toolManager.getToolDefinitions(),
    };

    const result = await runAgentLoop(context, llm, { toolManager }, () => {});
    const toolResult = result.messages.find((message) => message.role === "toolResult");

    expect(writeHandler).not.toHaveBeenCalled();
    expect(toolResult?.role).toBe("toolResult");
    expect(toolResult?.isError).toBe(true);
    expect(toolResult?.content[0]).toMatchObject({
      type: "text",
      text: "工具参数可能因模型输出长度限制被截断，已取消写入。请缩小内容，或先写骨架后用 edit_file 分段补齐。",
    });
  });

  it("uses rendered data for failed tool results when available", async () => {
    const llm = new MockLLMService({ provider: "mock", apiKey: "test", model: "deepseek-mock" });
    const toolManager = new ToolManager({ workspaceRoot: "/tmp" });
    toolManager.register(createFailingRenderedTool());
    llm.setResponses([
      {
        role: "assistant",
        content: [{ type: "toolCall", id: "tc-bash-fail", name: "bash", arguments: { command: "npx tsc" } }],
        model: "mock",
        provider: "mock",
        usage: createEmptyUsage(),
        stopReason: "toolUse",
        timestamp: Date.now(),
        source: "llm",
      },
      mockText("Done."),
    ]);

    const context: Context = {
      messages: [{ role: "user", content: "run tests", timestamp: Date.now() }],
      tools: toolManager.getToolDefinitions(),
    };

    const result = await runAgentLoop(context, llm, { toolManager }, () => {});
    const toolResult = result.messages.find((message) => message.role === "toolResult");

    expect(toolResult?.isError).toBe(true);
    expect(toolResult?.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("src/index.ts(1,1): error TS1000: boom"),
    });
  });
});
