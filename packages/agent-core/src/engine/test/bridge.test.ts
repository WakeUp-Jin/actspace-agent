import { describe, expect, it } from "vitest";
import type { RuntimeStreamEvent } from "@actspace/shared";
import { ContextManager } from "../../context/manager";
import { SystemPromptContext } from "../../context/modules/system-prompt";
import type { InternalTool, ToolResult } from "../../internal-tools";
import { MockLLMService, mockText, mockToolCall } from "../../llm/services/mock";
import type { AgentRunLogEvent, AgentRunLogger } from "../../observability";
import { ToolManager } from "../../tools/manager";
import { runTurnWithAgent } from "../bridge";
import type { RunTurnWithAgentDeps } from "../bridge";

function createTestTool(name: string): InternalTool {
  return {
    name,
    description: `Test ${name}`,
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        query: { type: "string" },
      },
    },
    isReadOnly: true,
    previewKind: name === "read_file" ? "read" : name === "grep" ? "grep" : "generic",
    handler: async (): Promise<ToolResult> => ({ success: true, data: `ok from ${name}` }),
  };
}

function createListDirectoryTool(): InternalTool {
  return {
    name: "list_directory",
    description: "List a directory",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
      },
      required: ["path"],
    },
    isReadOnly: true,
    previewKind: "directory_list",
    handler: async (): Promise<ToolResult> => ({
      success: true,
      data: "[file] a.ts\n[dir] components",
    }),
  };
}

function createWebSearchTool(): InternalTool {
  return {
    name: "web_search",
    description: "Search the web",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        url: { type: "string" },
      },
    },
    isReadOnly: true,
    previewKind: "web_search",
    handler: async (): Promise<ToolResult> => ({
      success: true,
      data: "Query: latest news\n\nresult answer body",
    }),
  };
}

function createGrepTool(): InternalTool {
  return {
    name: "grep",
    description: "Search file contents",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string" },
        path: { type: "string" },
        glob: { type: "string" },
      },
      required: ["pattern"],
    },
    isReadOnly: true,
    previewKind: "grep",
    handler: async (): Promise<ToolResult> => ({
      success: true,
      data: "Found 2 matches:\n\nsrc/a.ts:1: match\nsrc/b.ts:2: match",
    }),
  };
}

function createGlobTool(): InternalTool {
  return {
    name: "glob",
    description: "Find files",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string" },
        path: { type: "string" },
      },
      required: ["pattern"],
    },
    isReadOnly: true,
    previewKind: "glob",
    handler: async (): Promise<ToolResult> => ({
      success: true,
      data: "Found 3 files matching \"src/**/*.ts\":\n\nsrc/a.ts\nsrc/b.ts\nsrc/c.ts",
    }),
  };
}

function createDeps() {
  const llm = new MockLLMService({ provider: "mock", apiKey: "test", model: "deepseek-mock" });
  const toolManager = new ToolManager({ workspaceRoot: "/tmp" });
  toolManager.register(createTestTool("read_file"));
  toolManager.register(createTestTool("grep"));
  const contextManager = new ContextManager({
    systemPromptModule: new SystemPromptContext("You are a test assistant."),
  });
  return { llm, toolManager, contextManager };
}

describe("runTurnWithAgent bridge", () => {
  it("persists the user message before assistant and tool events", async () => {
    const result = await runTurnWithAgent(
      {
        sessionId: "session-test",
        turnId: "turn-test",
        userInput: "Please inspect the README.",
      },
      createDeps(),
    );

    expect(result.events[0]).toMatchObject({
      sessionId: "session-test",
      turnId: "turn-test",
      type: "user_message",
      payload: { content: "Please inspect the README." },
    });
    expect(result.events.map((event) => event.type)).toEqual([
      "user_message",
      "thinking",
      "tool_call",
      "tool_call",
      "llm_usage",
      "tool_result",
      "tool_result",
      "thinking",
      "assistant_message",
      "llm_usage",
      "context_snapshot",
    ]);
    expect(result.events.every((event) => event.turnId === "turn-test")).toBe(true);
  });

  it("persists one llm_usage event for each model response", async () => {
    const result = await runTurnWithAgent(
      {
        sessionId: "session-test",
        turnId: "turn-test",
        userInput: "Please inspect the README.",
      },
      createDeps(),
    );

    const usageEvents = result.events.filter((event) => event.type === "llm_usage");

    expect(usageEvents).toHaveLength(2);
    expect(usageEvents[0].payload).toMatchObject({
      provider: "mock",
      model: "deepseek-mock",
      promptTokens: 820,
      completionTokens: 340,
      totalTokens: 1160,
      cost: {
        total: 0,
      },
    });
    expect(usageEvents[0].payload).toHaveProperty("relatedEventIds");
  });

  it("writes aggregated assistant stream content to the run log", async () => {
    const runLogEvents: AgentRunLogEvent[] = [];
    const runLogger: AgentRunLogger = {
      filePath: "/tmp/test-run.jsonl",
      write: async (event) => {
        runLogEvents.push(event);
      },
    };

    await runTurnWithAgent(
      {
        sessionId: "session-test",
        turnId: "turn-test",
        userInput: "Please inspect the README.",
      },
      createDeps(),
      {
        onStreamEvent: () => {},
        runLogger,
      },
    );

    expect(
      runLogEvents.some(
        (event) =>
          event.type === "agent_event" &&
          typeof event.payload === "object" &&
          event.payload !== null &&
          "type" in event.payload &&
          event.payload.type === "message_delta",
      ),
    ).toBe(false);
    expect(
      runLogEvents.some(
        (event) =>
          event.type === "stream_event" &&
          typeof event.payload === "object" &&
          event.payload !== null &&
          "type" in event.payload &&
          (event.payload.type === "assistant_text_delta" ||
            event.payload.type === "assistant_thinking_delta"),
      ),
    ).toBe(false);
    expect(runLogEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "assistant_thinking",
          payload: expect.objectContaining({
            text: "Let me inspect the workspace and gather context.",
            deltaCount: 1,
            chars: 48,
          }),
        }),
        expect.objectContaining({
          type: "assistant_thinking",
          payload: expect.objectContaining({
            text: "I have the context. Let me summarize.",
            deltaCount: 1,
            chars: 37,
          }),
        }),
        expect.objectContaining({
          type: "assistant_text",
          payload: expect.objectContaining({
            deltaCount: 1,
          }),
        }),
      ]),
    );
  });

  it("records tool calls as state-level run log entries", async () => {
    const runLogEvents: AgentRunLogEvent[] = [];
    const runLogger: AgentRunLogger = {
      filePath: "/tmp/test-run.jsonl",
      write: async (event) => {
        runLogEvents.push(event);
      },
    };

    await runTurnWithAgent(
      {
        sessionId: "session-test",
        turnId: "turn-test",
        userInput: "Please inspect the README.",
      },
      createDeps(),
      { runLogger },
    );

    const messageDeltaEvents = runLogEvents.filter((event) => {
      const payload = event.payload as { type?: string } | undefined;
      return payload?.type === "message_delta";
    });
    const assistantToolCalls = runLogEvents.filter((event) => event.type === "assistant_tool_call");
    const toolEvents = runLogEvents.filter((event) => event.type === "tool_event");
    const assistantMessageEnds = runLogEvents.filter((event) => {
      const payload = event.payload as { type?: string; role?: string; message?: unknown } | undefined;
      return event.type === "agent_event" && payload?.type === "message_end" && payload.role === "assistant";
    });

    expect(messageDeltaEvents).toHaveLength(0);
    expect(assistantToolCalls).toHaveLength(2);
    expect(assistantToolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          payload: expect.objectContaining({
            toolName: "read_file",
            arguments: { path: "README.md" },
          }),
        }),
        expect.objectContaining({
          payload: expect.objectContaining({
            toolName: "grep",
            arguments: { pattern: "Please inspect the README." },
          }),
        }),
      ]),
    );
    expect(toolEvents.filter((event) => (event.payload as { type: string }).type === "tool_start")).toHaveLength(2);
    expect(toolEvents.filter((event) => (event.payload as { type: string }).type === "tool_end")).toHaveLength(2);
    expect(toolEvents.map((event) => (event.payload as { toolName?: string }).toolName)).toEqual([
      "read_file",
      "read_file",
      "grep",
      "grep",
    ]);
    expect(assistantMessageEnds.length).toBeGreaterThan(0);
    expect(assistantMessageEnds.every((event) => !("message" in ((event.payload ?? {}) as object)))).toBe(true);
  });

  it("persists list_directory results with a directory_list preview", async () => {
    const deps = createDeps();
    deps.toolManager.register(createListDirectoryTool());
    deps.llm.setResponses([
      mockToolCall("list_directory", { path: "/workspace/packages/agent-core/src/llm" }),
      mockText("Directory listed."),
    ]);

    const result = await runTurnWithAgent(
      {
        sessionId: "session-test",
        turnId: "turn-test",
        userInput: "List the llm folder.",
      },
      deps,
    );

    const toolResult = result.events.find((event) => event.type === "tool_result");

    expect(toolResult?.payload).toMatchObject({
      toolName: "list_directory",
      uiPreview: {
        kind: "directory_list",
        path: "llm",
        entryCount: 2,
        displayText: "Listed llm",
      },
    });
  });

  it("persists web_search results with a WebSearch preview only", async () => {
    const deps = createDeps();
    deps.toolManager.register(createWebSearchTool());
    deps.llm.setResponses([
      mockToolCall("web_search", { query: "最新新闻 今天" }),
      mockText("Search summarized."),
    ]);

    const result = await runTurnWithAgent(
      {
        sessionId: "session-test",
        turnId: "turn-test",
        userInput: "Search latest news.",
      },
      deps,
    );

    const toolResult = result.events.find((event) => event.type === "tool_result");

    expect(toolResult?.payload).toMatchObject({
      toolName: "web_search",
      rawOutput: "Query: latest news\n\nresult answer body",
      uiPreview: {
        kind: "web_search",
        mode: "query",
        query: "最新新闻 今天",
        displayText: "Web Search 最新新闻 今天",
      },
    });
    expect((toolResult?.payload as { uiPreview?: { displayText?: string } }).uiPreview?.displayText).not.toContain(
      "result answer body",
    );
  });

  it("persists web_search URL reads as WebSearch page reads", async () => {
    const deps = createDeps();
    deps.toolManager.register(createWebSearchTool());
    deps.llm.setResponses([
      mockToolCall("web_search", { url: "https://example.com/post" }),
      mockText("Page summarized."),
    ]);

    const result = await runTurnWithAgent(
      {
        sessionId: "session-test",
        turnId: "turn-test",
        userInput: "Read this page.",
      },
      deps,
    );

    const toolResult = result.events.find((event) => event.type === "tool_result");

    expect(toolResult?.payload).toMatchObject({
      toolName: "web_search",
      uiPreview: {
        kind: "web_search",
        mode: "url",
        url: "https://example.com/post",
        displayText: "Read Web Page https://example.com/post",
      },
    });
  });

  it("persists grep and glob results with independent previews", async () => {
    const deps = createDeps();
    deps.toolManager.register(createGrepTool());
    deps.toolManager.register(createGlobTool());
    deps.llm.setResponses([
      mockToolCall("grep", { pattern: "ToolUiPreview", glob: "*.ts" }, { id: "tc-grep-preview" }),
      mockToolCall("glob", { pattern: "src/**/*.ts", path: "packages/agent-core" }, { id: "tc-glob-preview" }),
      mockText("Search tools inspected."),
    ]);

    const result = await runTurnWithAgent(
      {
        sessionId: "session-test",
        turnId: "turn-test",
        userInput: "Inspect search tools.",
      },
      deps,
    );

    const toolResults = result.events.filter((event) => event.type === "tool_result");

    expect(toolResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          payload: expect.objectContaining({
            toolName: "grep",
            uiPreview: {
              kind: "grep",
              pattern: "ToolUiPreview",
              scope: "*.ts",
              resultCount: 2,
              displayText: "Grep ToolUiPreview in *.ts",
            },
          }),
        }),
        expect.objectContaining({
          payload: expect.objectContaining({
            toolName: "glob",
            uiPreview: {
              kind: "glob",
              pattern: "src/**/*.ts",
              scope: "packages/agent-core",
              resultCount: 3,
              displayText: "Glob src/**/*.ts in packages/agent-core",
            },
          }),
        }),
      ]),
    );
  });

  it("assigns abort closure that can cancel the running agent", async () => {
    const deps = createDeps() as ReturnType<typeof createDeps> & { abort?: () => void };
    // Register a slow tool that allows us to abort mid-execution
    deps.toolManager.register({
      name: "slow_tool",
      description: "A tool that takes time",
      parameters: { type: "object", properties: {} },
      isReadOnly: true,
      previewKind: "generic",
      handler: async (): Promise<ToolResult> => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return { success: true, data: "done" };
      },
    });
    deps.llm.setResponses([
      mockToolCall("slow_tool", {}),
      mockText("Should not reach this."),
    ]);

    // Before the call, deps.abort should be undefined
    expect(deps.abort).toBeUndefined();

    const resultPromise = runTurnWithAgent(
      { sessionId: "s-abort", turnId: "t-abort", userInput: "Do something slow." },
      deps,
    );

    // Wait a tick for agent to start and deps.abort to be assigned
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(deps.abort).toBeDefined();

    // Invoke abort
    deps.abort!();

    const result = await resultPromise;
    // After abort, the result should exist (possibly with error status)
    expect(result).toBeDefined();
    expect(result.status).toMatch(/completed|error/);
  });

  it("emits tool_call_streaming with typed preview before tool_started", async () => {
    const deps = createDeps();
    deps.toolManager.register({
      name: "write_file",
      description: "Write file",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" },
        },
        required: ["path", "content"],
      },
      isReadOnly: false,
      previewKind: "write",
      handler: async (): Promise<ToolResult> => ({
        success: true,
        data: "+++ b/x.md\n+# title\n+body",
      }),
    });
    deps.llm.setResponses([
      mockToolCall(
        "write_file",
        { path: "/tmp/x.md", content: "# title\nbody" },
        { id: "tc-write-streaming" },
      ),
      mockText("Done."),
    ]);

    const streamEvents: RuntimeStreamEvent[] = [];

    await runTurnWithAgent(
      {
        sessionId: "session-test",
        turnId: "turn-test",
        userInput: "Write the file.",
      },
      deps,
      {
        onStreamEvent: (event) => {
          streamEvents.push(event);
        },
      },
    );

    const streamingEvents = streamEvents.filter(
      (event) => event.type === "tool_call_streaming",
    );
    const startedEvents = streamEvents.filter((event) => event.type === "tool_started");

    expect(streamingEvents.length).toBeGreaterThan(0);
    const firstStreaming = streamingEvents[0];
    expect(firstStreaming).toMatchObject({
      type: "tool_call_streaming",
      toolCallId: "tc-write-streaming",
      toolName: "write_file",
      isInitial: true,
      preview: {
        kind: "write",
        filePath: "/tmp/x.md",
      },
    });

    const streamingIndex = streamEvents.indexOf(firstStreaming);
    const startedIndex = streamEvents.indexOf(startedEvents[0]);
    expect(streamingIndex).toBeLessThan(startedIndex);
  });

  it("does not emit tool_call_streaming for unregistered tool names", async () => {
    const deps = createDeps();
    deps.llm.setResponses([
      mockToolCall("not_registered", { path: "/x" }, { id: "tc-unknown" }),
      mockText("Done."),
    ]);

    const streamEvents: RuntimeStreamEvent[] = [];

    await runTurnWithAgent(
      {
        sessionId: "session-test",
        turnId: "turn-test",
        userInput: "Use unknown tool.",
      },
      deps,
      {
        onStreamEvent: (event) => {
          streamEvents.push(event);
        },
      },
    );

    expect(streamEvents.filter((event) => event.type === "tool_call_streaming")).toHaveLength(
      0,
    );
  });

  it("uses short file names for read and edit tool previews", async () => {
    const deps = createDeps();
    deps.toolManager.register({
      name: "edit_file",
      description: "Edit a file",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
        },
        required: ["path"],
      },
      isReadOnly: true,
      previewKind: "edit_diff",
      handler: async (): Promise<ToolResult> => ({
        success: true,
        data: "--- a/src/index.ts\n+++ b/src/index.ts\n@@ -1 +1,2 @@\n-old\n+new\n+line",
      }),
    });
    deps.llm.setResponses([
      mockToolCall("read_file", { path: "/workspace/packages/desktop/package.json" }, { id: "tc-read-short-name" }),
      mockToolCall("edit_file", { path: "/workspace/packages/desktop/src/index.ts" }, { id: "tc-edit-short-name" }),
      mockText("Done."),
    ]);

    const result = await runTurnWithAgent(
      {
        sessionId: "session-test",
        turnId: "turn-test",
        userInput: "Read and edit files.",
      },
      deps,
    );

    const toolResults = result.events.filter((event) => event.type === "tool_result");

    expect(toolResults[0].payload).toMatchObject({
      toolName: "read_file",
      uiPreview: {
        kind: "read",
        filePath: "package.json",
        displayText: "Read package.json",
      },
    });
    expect(toolResults[1].payload).toMatchObject({
      toolName: "edit_file",
      uiPreview: {
        kind: "edit_diff",
        filePath: "index.ts",
        additions: 2,
        deletions: 1,
      },
    });
  });
});
