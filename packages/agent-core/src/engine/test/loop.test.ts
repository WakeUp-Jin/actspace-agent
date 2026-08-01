import { describe, it, expect, vi } from "vitest";
import { runAgentLoop } from "../loop";
import { MockLLMService, mockText, mockError, mockToolCall } from "../../llm/services/mock";
import { ToolManager } from "../../tools/manager";
import type { Context } from "../../messages";
import { createEmptyUsage } from "../../messages";
import type { AgentEvent } from "../types";
import type { InternalTool, ToolResult } from "../../internal-tools";
import type { ToolDefinitionSpec } from "../../tools/types";

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
  it("reveals deferred tool definitions on the model call after a gateway succeeds", async () => {
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

    const visibleTools: string[][] = [];
    llm.setResponses([
      (context) => {
        visibleTools.push(context.tools?.map((tool) => tool.name) ?? []);
        return mockToolCall("browser_help", {}, { id: "browser-gateway" });
      },
      (context) => {
        visibleTools.push(context.tools?.map((tool) => tool.name) ?? []);
        return mockText("browser ready");
      },
    ]);
    const context: Context = {
      messages: [{ role: "user", content: "open the browser", timestamp: Date.now() }],
      tools: toolManager.getToolDefinitions(),
    };

    const result = await runAgentLoop(context, llm, { toolManager }, () => {});

    expect(result.status).toBe("completed");
    expect(visibleTools).toEqual([
      ["browser_help"],
      ["browser_help", "browser_tabs"],
    ]);
  });

  it("passes thinking and reasoning effort to every LLM stream call", async () => {
    const { llm, toolManager, context } = createTestSetup();
    let receivedOptions: Parameters<typeof llm.stream>[1];
    llm.setResponses([(_context, options) => {
      receivedOptions = options;
      return mockText("done");
    }]);

    await runAgentLoop(context, llm, {
      toolManager,
      thinkingEnabled: true,
      reasoningEffort: "high",
    }, () => {});

    expect(receivedOptions).toMatchObject({
      thinkingEnabled: true,
      reasoningEffort: "high",
    });
  });

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
    expect(result.status).toBe("completed");
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

  it("continues beyond the former 50-turn default limit", async () => {
    const { llm, toolManager, context } = createTestSetup();
    llm.setResponses([
      ...Array.from({ length: 51 }, (_, index) => mockToolCall("read_file", { path: `file-${index}.txt` }, { id: `tc-${index}` })),
      mockText("finished after fifty-one tool turns"),
    ]);

    const result = await runAgentLoop(context, llm, { toolManager }, () => {});

    expect(result.status).toBe("completed");
    expect(result.message.stopReason).toBe("stop");
    expect(result.usageCalls).toHaveLength(52);
  });

  it("returns a failed exhaustion result when maxTurns is reached during tool use", async () => {
    const { llm, toolManager, context } = createTestSetup();
    llm.setResponses([
      mockToolCall("read_file", { path: "one.txt" }, { id: "tc-one" }),
      mockToolCall("read_file", { path: "two.txt" }, { id: "tc-two" }),
      mockText("must not be reached"),
    ]);

    const result = await runAgentLoop(context, llm, { toolManager, maxTurns: 2 }, () => {});

    expect(result.status).toBe("failed");
    expect(result.message.stopReason).toBe("error");
    expect(result.message.errorKind).toBe("max_turns");
    expect(result.message.errorMessage).toBe("Agent reached maxTurns (2) before producing a final response");
    expect(result.usageCalls).toHaveLength(2);
    expect(llm.getPendingCount()).toBe(1);
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

    // 第一轮正常跑完（toolUse），第二轮检测到 abort；终态不能再由最后一条消息猜测。
    expect(result.message.stopReason).toBe("toolUse");
    expect(result.status).toBe("aborted");
  });

  it("returns an aborted result even when stopped before the first model response", async () => {
    const { llm, toolManager, context } = createTestSetup();
    const controller = new AbortController();
    controller.abort();

    const result = await runAgentLoop(
      context,
      llm,
      { toolManager },
      () => {},
      controller.signal,
    );

    expect(result.status).toBe("aborted");
    expect(result.message.stopReason).toBe("aborted");
    expect(result.messages).toEqual([]);
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

  it("preserves rich tool result content for the next model call", async () => {
    const llm = new MockLLMService({ provider: "mock", apiKey: "test", model: "deepseek-mock" });
    const toolManager = new ToolManager({ workspaceRoot: "/tmp" });
    toolManager.register({
      name: "read_file",
      description: "read",
      parameters: { type: "object" },
      isReadOnly: true,
      previewKind: "read",
      handler: async (): Promise<ToolResult> => ({
        success: true,
        data: "Read image file: image.png",
        content: [
          { type: "text", text: "Read image file: image.png" },
          { type: "image", data: "abc", mimeType: "image/png" },
        ],
      }),
    });
    llm.setResponses([
      {
        role: "assistant",
        content: [{ type: "toolCall", id: "tc-image", name: "read_file", arguments: { path: "image.png" } }],
        model: "mock",
        provider: "mock",
        usage: createEmptyUsage(),
        stopReason: "toolUse",
        timestamp: Date.now(),
        source: "llm",
      },
      mockText("Saw it."),
    ]);

    const context: Context = {
      messages: [{ role: "user", content: "look", timestamp: Date.now() }],
      tools: toolManager.getToolDefinitions(),
    };

    const result = await runAgentLoop(context, llm, { toolManager }, () => {});
    const toolResult = result.messages.find((message) => message.role === "toolResult");

    expect(toolResult?.content).toEqual([
      { type: "text", text: "Read image file: image.png" },
      { type: "image", data: "abc", mimeType: "image/png" },
    ]);
    expect(context.messages).toContain(toolResult);
  });

  it("retries retryable LLM errors and pops the dirty error message from context", async () => {
    const llm = new MockLLMService({ provider: "mock", apiKey: "test", model: "deepseek-mock" });
    llm.setResponses([
      mockError("gateway hiccup", "error", { errorKind: "server_error", errorRetryable: true }),
      mockText("recovered reply"),
    ]);
    const toolManager = new ToolManager({ workspaceRoot: "/tmp" });
    const context: Context = {
      messages: [{ role: "user", content: "hello", timestamp: Date.now() }],
      tools: [],
    };
    const events: AgentEvent[] = [];

    const result = await runAgentLoop(
      context,
      llm,
      { toolManager, llmRetry: { maxRetries: 2, backoffMs: [1] } },
      (e) => { events.push(e); },
    );

    expect(result.message.stopReason).toBe("stop");
    // 失败尝试的 usage call 照常记录（计费审计）
    expect(result.usageCalls).toHaveLength(2);
    expect(result.usageCalls[0].message.stopReason).toBe("error");
    // llm_retry 事件带 attempt/maxAttempts/reason
    const retryEvents = events.filter((e) => e.type === "llm_retry");
    expect(retryEvents).toHaveLength(1);
    expect(retryEvents[0]).toMatchObject({
      type: "llm_retry",
      turnIndex: 1,
      attempt: 2,
      maxAttempts: 3,
      reason: "gateway hiccup",
    });
    expect(retryEvents[0]).toHaveProperty("turnId");
    expect(retryEvents[0]).toHaveProperty("failedLlmCallId");
    // 脏 error message 必须从 context 弹出，不污染重试请求
    const errorInContext = context.messages.filter(
      (m) => m.role === "assistant" && m.stopReason === "error",
    );
    expect(errorInContext).toHaveLength(0);
  });

  it("gives up after exhausting retries and returns the final error message", async () => {
    const llm = new MockLLMService({ provider: "mock", apiKey: "test", model: "deepseek-mock" });
    llm.setResponses([
      mockError("boom 1", "error", { errorKind: "server_error", errorRetryable: true }),
      mockError("boom 2", "error", { errorKind: "server_error", errorRetryable: true }),
      mockError("boom 3", "error", { errorKind: "server_error", errorRetryable: true }),
    ]);
    const toolManager = new ToolManager({ workspaceRoot: "/tmp" });
    const context: Context = {
      messages: [{ role: "user", content: "hello", timestamp: Date.now() }],
      tools: [],
    };
    const events: AgentEvent[] = [];

    const result = await runAgentLoop(
      context,
      llm,
      { toolManager, llmRetry: { maxRetries: 2, backoffMs: [1] } },
      (e) => { events.push(e); },
    );

    expect(result.message.stopReason).toBe("error");
    expect(result.message.errorMessage).toBe("boom 3");
    expect(result.usageCalls).toHaveLength(3);
    expect(events.filter((e) => e.type === "llm_retry")).toHaveLength(2);
  });

  it("does not retry non-retryable LLM errors", async () => {
    const llm = new MockLLMService({ provider: "mock", apiKey: "test", model: "deepseek-mock" });
    llm.setResponses([
      mockError("invalid api key", "error", { errorKind: "auth", errorRetryable: false }),
      mockText("should never be reached"),
    ]);
    const toolManager = new ToolManager({ workspaceRoot: "/tmp" });
    const context: Context = {
      messages: [{ role: "user", content: "hello", timestamp: Date.now() }],
      tools: [],
    };
    const events: AgentEvent[] = [];

    const result = await runAgentLoop(
      context,
      llm,
      { toolManager, llmRetry: { maxRetries: 2, backoffMs: [1] } },
      (e) => { events.push(e); },
    );

    expect(result.message.stopReason).toBe("error");
    expect(result.message.errorMessage).toBe("invalid api key");
    expect(result.usageCalls).toHaveLength(1);
    expect(events.filter((e) => e.type === "llm_retry")).toHaveLength(0);
    expect(llm.getPendingCount()).toBe(1);
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
