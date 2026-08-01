import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeStreamEvent } from "@actspace/shared";
import { ContextManager } from "../../context/manager";
import { ConversationContext } from "../../context/modules/conversation";
import { SystemPromptContext } from "../../context/modules/system-prompt";
import type { Summarizer } from "../../context/compression/summarizer";
import type { InternalTool, ToolResult } from "../../internal-tools";
import { createEmptyUsage } from "../../messages";
import type { AssistantMessage, Message, ToolResultMessage, UserMessage } from "../../messages";
import { MockLLMService, mockError, mockText, mockToolCall } from "../../llm/services/mock";
import { createAgentTraceWriter, createCacheAuditTracker, type AgentRunLogEvent, type AgentRunLogger } from "../../observability";
import { ToolManager } from "../../tools/manager";
import { runAgentWithBridge } from "../bridge";
import { bashExecutor, bashTaskRegistry } from "../../tools/tools/bash";
import type { RunAgentWithBridgeDeps } from "../bridge";

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

function createDeleteTool(): InternalTool {
  return {
    name: "delete_file",
    description: "Delete a file",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "path" },
      },
      required: ["path"],
    },
    isReadOnly: false,
    previewKind: "delete",
    handler: async (): Promise<ToolResult> => ({
      success: true,
      data: "File deleted: notes.md",
    }),
  };
}

function createFailingBashTool(): InternalTool {
  return {
    name: "bash",
    description: "Run Bash",
    parameters: {
      type: "object",
      properties: { command: { type: "string", description: "command" } },
      required: ["command"],
    },
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

function createFakeAgentTool(): InternalTool {
  return {
    name: "agent",
    description: "Agent: launch a read-only Explore SubAgent run.",
    parameters: {
      type: "object",
      properties: {
        description: { type: "string", description: "Short title" },
        prompt: { type: "string", description: "SubAgent prompt" },
        subagent_type: { type: "string", description: "SubAgent type", enum: ["explore"] },
      },
      required: ["description", "prompt"],
    },
    isReadOnly: true,
    category: "agent",
    previewKind: "agent",
    handler: async (): Promise<ToolResult> => ({
      success: true,
      data: "Found the renderer flow and selector boundary.",
    }),
  };
}

function createSensitiveBrowserTool(): InternalTool {
  return {
    name: "browser_io",
    description: "Test browser persistence boundary",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", description: "Browser action" },
        tab_id: { type: "number", description: "Tab ID" },
        text: { type: "string", description: "Clipboard input" },
      },
      required: ["action", "tab_id"],
    },
    isReadOnly: false,
    category: "browser",
    previewKind: "browser_io",
    handler: async (): Promise<ToolResult> => ({
      success: true,
      data: "private-browser-result",
      structured: { clipboard: "private-browser-result" },
      redactInPersistence: true,
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

const compactionSummarizer: Summarizer = {
  async summarizeToolOutput() {
    return "tool-summary";
  },
  async summarizeHistory() {
    return "结构化历史摘要";
  },
};

function compactionUser(text: string): UserMessage {
  return { role: "user", content: text, timestamp: Date.now(), source: "user" };
}
function compactionAssistantText(text: string): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    model: "m",
    provider: "mock",
    usage: createEmptyUsage(),
    stopReason: "stop",
    timestamp: Date.now(),
  };
}
function compactionAssistantToolCall(id: string): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "toolCall", id, name: "bash", arguments: {} }],
    model: "m",
    provider: "mock",
    usage: createEmptyUsage(),
    stopReason: "toolUse",
    timestamp: Date.now(),
  };
}
function compactionToolResult(id: string, text: string): ToolResultMessage {
  return {
    role: "toolResult",
    toolCallId: id,
    toolName: "bash",
    content: [{ type: "text", text }],
    isError: false,
    timestamp: Date.now(),
  };
}

function createCompactionDeps() {
  const llm = new MockLLMService({ provider: "mock", apiKey: "test", model: "deepseek-mock" });
  llm.setResponses([mockText("final reply after compaction")]);
  const toolManager = new ToolManager({ workspaceRoot: "/tmp" });

  const messages: Message[] = [];
  const big = "x".repeat(4000);
  for (let i = 0; i < 8; i++) {
    messages.push(compactionUser(`q${i} ${big}`));
    messages.push(compactionAssistantToolCall(`tc${i}`));
    messages.push(compactionToolResult(`tc${i}`, big));
    messages.push(compactionAssistantText(`a${i} ${big}`));
  }

  const contextManager = new ContextManager({
    systemPromptModule: new SystemPromptContext("sys"),
    conversation: new ConversationContext(messages),
    sessionPath: "/data/sessions/s1/session.jsonl",
    config: {
      contextWindow: 2000,
      compressionThreshold: 0.85,
      compressKeepRatio: 0.3,
      compactMinIntervalCalls: 1,
    },
  });

  return { llm, toolManager, contextManager, summarizer: compactionSummarizer };
}

describe("runAgentWithBridge bridge", () => {
  it("persists the user message before assistant and tool events", async () => {
    const streamEvents: RuntimeStreamEvent[] = [];
    const result = await runAgentWithBridge(
      {
        sessionId: "session-test",
        agentRunId: "turn-test",
        userInput: "Please inspect the README.",
      },
      createDeps(),
      { onStreamEvent: (event) => streamEvents.push(event) },
    );

    expect(result.events[0]).toMatchObject({
      sessionId: "session-test",
      agentRunId: "turn-test",
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
    expect(result.events.every((event) => event.agentRunId === "turn-test")).toBe(true);
    expect(
      streamEvents.every((event) =>
        event.sessionId === "session-test" &&
        (event.type === "bash_task_update" || event.agentRunId === "turn-test"),
      ),
    ).toBe(true);
    expect(streamEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "assistant_thinking_delta",
        sessionId: "session-test",
        agentRunId: "turn-test",
      }),
      expect.objectContaining({
        type: "assistant_text_delta",
        sessionId: "session-test",
        agentRunId: "turn-test",
      }),
    ]));
  });

  it("can omit the user event when main already persisted the turn input", async () => {
    const deps = createDeps();
    deps.llm.setResponses([mockText("done")]);

    const result = await runAgentWithBridge(
      { sessionId: "session-prewritten", agentRunId: "turn-prewritten", userInput: "already stored" },
      deps,
      { includeUserEvent: false },
    );

    expect(result.events.some((event) => event.type === "user_message")).toBe(false);
    expect(result.events.some((event) => event.type === "assistant_message")).toBe(true);
  });

  it("injects attachments into the model input and persists them only on the user message", async () => {
    const deps = createDeps();
    let modelUserInput = "";
    deps.llm.setResponses([
      (context) => {
        const userMessage = context.messages.find((message) => message.role === "user");
        modelUserInput = typeof userMessage?.content === "string" ? userMessage.content : "";
        return mockText("I can reason over the attachment metadata.");
      },
    ]);

    const attachments = [
      {
        id: "att-image-1",
        kind: "image" as const,
        name: "screenshot.png",
        path: "/Users/test/screenshot.png",
        mimeType: "image/png",
      },
      {
        id: "att-file-1",
        kind: "file" as const,
        name: "notes.md",
        path: "/Users/test/notes.md",
        mimeType: "text/markdown",
      },
    ];
    const result = await runAgentWithBridge(
      {
        sessionId: "session-attachments",
        agentRunId: "turn-attachments",
        userInput: "What does this show?",
        attachments,
      },
      deps,
    );

    expect(modelUserInput).toContain("What does this show?");
    expect(modelUserInput).toContain("Attached files:");
    expect(modelUserInput).toContain("[image] screenshot.png path=/Users/test/screenshot.png mime=image/png");
    expect(modelUserInput).toContain("[file] notes.md path=/Users/test/notes.md mime=text/markdown");
    expect(modelUserInput).toContain("model_id: deepseek-v4-pro");
    expect(modelUserInput).toContain("input: text");

    expect(result.events[0]).toMatchObject({
      type: "user_message",
      payload: {
        content: "What does this show?",
        attachments,
      },
    });
    expect(result.events.some((event) => event.type === "tool_call")).toBe(false);
    expect(result.events.some((event) => event.type === "tool_result")).toBe(false);
  });

  it("persists an error event instead of an empty assistant_message when the turn fails", async () => {
    const deps = { ...createDeps(), llmRetry: { maxRetries: 0 } };
    deps.llm.setResponses([
      mockError("upstream gateway exploded", "error", { errorKind: "server_error", errorRetryable: true }),
    ]);

    const result = await runAgentWithBridge(
      { sessionId: "session-fail", agentRunId: "turn-fail", userInput: "hello" },
      deps,
    );

    expect(result.status).toBe("failed");
    expect(result.error).toMatchObject({
      code: "LLM_SERVER_ERROR",
      message: "upstream gateway exploded",
    });
    const errorEvent = result.events.find((event) => event.type === "error");
    expect(errorEvent?.payload).toMatchObject({
      code: "LLM_SERVER_ERROR",
      message: "upstream gateway exploded",
      recoverable: true,
    });
    // 不再落 content 为空的 assistant_message（空白气泡的来源）
    const emptyAssistant = result.events.filter(
      (event) => event.type === "assistant_message" &&
        (event.payload as { content?: string }).content === "",
    );
    expect(emptyAssistant).toHaveLength(0);
  });

  it("retries retryable errors, streams llm_retry, and keeps usage for failed attempts", async () => {
    const deps = { ...createDeps(), llmRetry: { maxRetries: 1, backoffMs: [1] } };
    deps.llm.setResponses([
      mockError("gateway hiccup", "error", { errorKind: "server_error", errorRetryable: true }),
      mockText("recovered final reply"),
    ]);
    const streamEvents: RuntimeStreamEvent[] = [];

    const result = await runAgentWithBridge(
      { sessionId: "session-retry", agentRunId: "turn-retry", userInput: "hello" },
      deps,
      { onStreamEvent: (event) => streamEvents.push(event) },
    );

    expect(result.status).toBe("completed");
    const failedCall = streamEvents.find((event) => event.type === "llm_call_finished" && event.stopReason === "error");
    expect(failedCall).toBeDefined();
    expect(streamEvents).toContainEqual(expect.objectContaining({
      type: "llm_retry",
      sessionId: "session-retry",
      agentRunId: "turn-retry",
      turnIndex: 1,
      failedLlmCallId: failedCall && "llmCallId" in failedCall ? failedCall.llmCallId : undefined,
      attempt: 2,
      maxAttempts: 2,
      reason: "gateway hiccup",
    }));
    // 重试成功后不落 error 事件；失败尝试不留 content 事件，但 llm_usage 全量保留
    expect(result.events.some((event) => event.type === "error")).toBe(false);
    expect(result.events.filter((event) => event.type === "llm_usage")).toHaveLength(2);
    const assistantEvents = result.events.filter((event) => event.type === "assistant_message");
    expect(assistantEvents).toHaveLength(1);
    expect(assistantEvents[0].payload).toMatchObject({ content: "recovered final reply" });
  });

  it("persists request and response trace events with true turn and call identities", async () => {
    const deps = createDeps();
    deps.llm.setResponses([mockText("trace reply")]);
    const sessionDir = await mkdtemp(join(tmpdir(), "actspace-bridge-trace-"));
    const traceWriter = await createAgentTraceWriter({
      sessionDir,
      sessionId: "session-trace",
      agentRunId: "agent-run-trace",
    });

    await runAgentWithBridge(
      { sessionId: "session-trace", agentRunId: "agent-run-trace", userInput: "inspect trace" },
      deps,
      { traceWriter },
    );

    const events = (await readFile(traceWriter.filePath, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(events.map((event) => event.type)).toEqual([
      "agent_run_start",
      "turn_start",
      "llm_request",
      "llm_response",
      "turn_end",
      "agent_run_end",
    ]);
    const request = events.find((event) => event.type === "llm_request");
    const response = events.find((event) => event.type === "llm_response");
    expect(request).toMatchObject({
      sessionId: "session-trace",
      agentRunId: "agent-run-trace",
      turnIndex: 1,
      attempt: 1,
      payload: {
        provider: "mock",
        model: "deepseek-mock",
        systemPrompt: expect.stringContaining("You are a test assistant."),
        messages: expect.any(Array),
        tools: expect.any(Array),
      },
    });
    expect(request).toHaveProperty("turnId");
    expect(request).toHaveProperty("llmCallId");
    expect(response).toMatchObject({
      turnId: request?.turnId,
      llmCallId: request?.llmCallId,
      payload: {
        stopReason: "stop",
        durationMs: expect.any(Number),
      },
    });
    await rm(sessionDir, { recursive: true, force: true });
  });

  it("persists a context_compaction event and run-log entry when history is compacted", async () => {
    const runLogEvents: AgentRunLogEvent[] = [];
    const runLogger: AgentRunLogger = {
      filePath: "/tmp/test-run.jsonl",
      write: async (event) => {
        runLogEvents.push(event);
      },
    };

    const result = await runAgentWithBridge(
      { sessionId: "session-compact", agentRunId: "turn-compact", userInput: "new question" },
      createCompactionDeps(),
      { runLogger },
    );

    const compactionEvent = result.events.find((event) => event.type === "context_compaction");
    expect(compactionEvent).toBeDefined();
    expect(compactionEvent?.payload).toMatchObject({
      historyRefPath: "/data/sessions/s1/session.jsonl",
    });
    expect((compactionEvent?.payload as { beforeCount: number }).beforeCount).toBeGreaterThan(
      (compactionEvent?.payload as { afterCount: number }).afterCount,
    );

    expect(runLogEvents.some((event) => event.type === "context_compaction")).toBe(true);
  });

  it("persists one llm_usage event for each model response", async () => {
    const result = await runAgentWithBridge(
      {
        sessionId: "session-test",
        agentRunId: "turn-test",
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

  it("adds cache audit metadata to llm_usage when low cache is confirmed", async () => {
    const auditRoot = await mkdtemp(join(tmpdir(), "actspace-bridge-cache-audit-"));
    try {
      const deps = createDeps();
      deps.llm.setResponses([
        {
          ...mockText("Low cache response."),
          usage: {
            ...createEmptyUsage(),
            input: 100,
            output: 20,
            cacheRead: 20,
            cacheHit: 20,
            cacheMiss: 80,
            totalTokens: 120,
          },
        },
      ]);

      const result = await runAgentWithBridge(
        {
          sessionId: "session-cache-audit",
          agentRunId: "turn-cache-audit",
          userInput: "Trigger low cache.",
        },
        {
          ...deps,
          cacheAudit: createCacheAuditTracker({
            rootDir: auditRoot,
            sessionId: "session-cache-audit",
            agentRunId: "turn-cache-audit",
            provider: "mock",
            model: "deepseek-mock",
            threshold: 0.9,
            now: () => new Date("2026-05-31T15:30:12.123Z"),
          }),
        },
      );

      const usageEvent = result.events.find((event) => event.type === "llm_usage");
      expect(usageEvent?.payload).toMatchObject({
        cacheStatus: true,
        cacheHitRatio: 0.2,
      });
      const cacheAuditId = (usageEvent?.payload as { cacheAuditId?: string }).cacheAuditId;
      expect(cacheAuditId).toContain("turn-cache-audit");

      const summaryPath = join(auditRoot, "session-cache-audit", cacheAuditId ?? "", "summary.json");
      const summary = JSON.parse(await readFile(summaryPath, "utf8"));
      expect(summary).toMatchObject({
        cacheStatus: true,
        cacheHitRatio: 0.2,
        cacheHitTokens: 20,
        cacheMissTokens: 80,
      });
    } finally {
      await rm(auditRoot, { recursive: true, force: true });
    }
  });

  it("writes aggregated assistant stream content to the run log", async () => {
    const runLogEvents: AgentRunLogEvent[] = [];
    const runLogger: AgentRunLogger = {
      filePath: "/tmp/test-run.jsonl",
      write: async (event) => {
        runLogEvents.push(event);
      },
    };

    await runAgentWithBridge(
      {
        sessionId: "session-test",
        agentRunId: "turn-test",
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

    await runAgentWithBridge(
      {
        sessionId: "session-test",
        agentRunId: "turn-test",
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
            arguments: { pattern: expect.stringContaining("Please inspect the README.") },
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

  it("keeps browser payloads in the live model loop but out of streams, sessions and run logs", async () => {
    const deps = createDeps();
    deps.toolManager.register(createSensitiveBrowserTool());
    let liveModelSawResult = false;
    deps.llm.setResponses([
      mockToolCall("browser_io", {
        action: "clipboard_write_text",
        tab_id: 42,
        text: "private-browser-input",
      }, { id: "tc-browser-sensitive" }),
      (context) => {
        liveModelSawResult = context.messages.some((message) => (
          message.role === "toolResult" &&
          message.content.some((part) => part.type === "text" && part.text.includes("private-browser-result"))
        ));
        return mockText("Browser action completed.");
      },
    ]);
    const streamEvents: RuntimeStreamEvent[] = [];
    const runLogEvents: AgentRunLogEvent[] = [];
    const runLogger: AgentRunLogger = {
      filePath: "/tmp/test-browser-redaction-run.jsonl",
      write: async (event) => {
        runLogEvents.push(event);
      },
    };

    const result = await runAgentWithBridge(
      {
        sessionId: "session-test",
        agentRunId: "turn-test",
        userInput: "Write the clipboard.",
      },
      deps,
      {
        runLogger,
        onStreamEvent: (event) => {
          streamEvents.push(event);
        },
      },
    );

    expect(liveModelSawResult).toBe(true);
    const persisted = JSON.stringify(result.events);
    const streamed = JSON.stringify(streamEvents);
    const logged = JSON.stringify(runLogEvents);
    for (const output of [persisted, streamed, logged]) {
      expect(output).not.toContain("private-browser-input");
      expect(output).not.toContain("private-browser-result");
    }
    expect(persisted).toContain("[redacted]");
    expect(persisted).toContain("[browser output omitted from persistence]");
    expect(streamed).toContain("Completed");
  });

  it("records provider-native server tool usage in assistant run log summaries", async () => {
    const deps = createDeps();
    deps.llm.setResponses([
      {
        ...mockText("Fetched with provider-native search."),
        usage: {
          ...mockText("unused").usage,
          input: 100,
          output: 20,
          totalTokens: 120,
          serverToolUse: { webSearchRequests: 1, webFetchRequests: 0 },
        },
      },
    ]);
    const runLogEvents: AgentRunLogEvent[] = [];
    const runLogger: AgentRunLogger = {
      filePath: "/tmp/test-run.jsonl",
      write: async (event) => {
        runLogEvents.push(event);
      },
    };

    await runAgentWithBridge(
      {
        sessionId: "session-test",
        agentRunId: "turn-test",
        userInput: "Read a web page.",
      },
      deps,
      { runLogger },
    );

    const assistantMessageEnd = runLogEvents.find((event) => {
      const payload = event.payload as { type?: string; role?: string } | undefined;
      return event.type === "agent_event" && payload?.type === "message_end" && payload.role === "assistant";
    });

    expect(assistantMessageEnd?.payload).toMatchObject({
      summary: {
        toolCallCount: 0,
        serverToolUse: { webSearchRequests: 1, webFetchRequests: 0 },
      },
    });
  });

  it("persists list_directory results with a directory_list preview", async () => {
    const deps = createDeps();
    deps.toolManager.register(createListDirectoryTool());
    deps.llm.setResponses([
      mockToolCall("list_directory", { path: "/workspace/packages/agent-core/src/llm" }),
      mockText("Directory listed."),
    ]);

    const result = await runAgentWithBridge(
      {
        sessionId: "session-test",
        agentRunId: "turn-test",
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

    const result = await runAgentWithBridge(
      {
        sessionId: "session-test",
        agentRunId: "turn-test",
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

    const result = await runAgentWithBridge(
      {
        sessionId: "session-test",
        agentRunId: "turn-test",
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
        displayText: "Web Search https://example.com/post",
      },
    });
  });

  it("persists delete_file results with a delete preview", async () => {
    const deps = createDeps();
    deps.toolManager.register(createDeleteTool());
    deps.llm.setResponses([
      mockToolCall("delete_file", { path: "/workspace/notes.md" }),
      mockText("File removed."),
    ]);

    const result = await runAgentWithBridge(
      {
        sessionId: "session-test",
        agentRunId: "turn-test",
        userInput: "Delete notes.md.",
      },
      deps,
    );

    const toolResult = result.events.find((event) => event.type === "tool_result");

    expect(toolResult?.payload).toMatchObject({
      toolName: "delete_file",
      summary: "Deleted notes.md",
      uiPreview: {
        kind: "delete",
        filePath: "notes.md",
        displayText: "Deleted notes.md",
        status: "completed",
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

    const result = await runAgentWithBridge(
      {
        sessionId: "session-test",
        agentRunId: "turn-test",
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
    const streamEvents: RuntimeStreamEvent[] = [];
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

    const resultPromise = runAgentWithBridge(
      { sessionId: "s-abort", agentRunId: "t-abort", userInput: "Do something slow." },
      deps,
      { onStreamEvent: (event) => streamEvents.push(event) },
    );

    // Wait a tick for agent to start and deps.abort to be assigned
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(deps.abort).toBeDefined();

    // Invoke abort
    deps.abort!();

    const result = await resultPromise;
    expect(result.status).toBe("aborted");
    expect(result.events.some((event) => event.type === "user_message")).toBe(true);
    expect(result.events.some((event) => event.type === "agent_run_aborted")).toBe(true);
    expect(streamEvents.some((event) => event.type === "agent_run_aborted")).toBe(true);
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
        data: "--- x.md\n+++ x.md\n@@ -0,0 +1,2 @@\n+# title\n+body",
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

    await runAgentWithBridge(
      {
        sessionId: "session-test",
        agentRunId: "turn-test",
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
    const finishedEvents = streamEvents.filter((event) => event.type === "tool_finished");

    expect(streamingEvents.length).toBeGreaterThan(0);
    const firstStreaming = streamingEvents[0];
    expect(firstStreaming).toMatchObject({
      type: "tool_call_streaming",
      sessionId: "session-test",
      agentRunId: "turn-test",
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

    expect(finishedEvents[0]).toMatchObject({
      type: "tool_finished",
      sessionId: "session-test",
      agentRunId: "turn-test",
      toolCallId: "tc-write-streaming",
      toolName: "write_file",
      isError: false,
      preview: {
        kind: "write",
        filePath: "x.md",
        additions: 2,
        deletions: 0,
        diff: expect.stringContaining("+# title"),
      },
    });
    expect(
      (finishedEvents[0] as Extract<RuntimeStreamEvent, { type: "tool_finished" }>).preview,
    ).toHaveProperty("streamingContent", undefined);
  });

  it("streams and persists Agent previews without exposing raw args as UI state", async () => {
    const deps = createDeps();
    deps.toolManager.register(createFakeAgentTool());
    deps.llm.setResponses([
      mockToolCall(
        "agent",
        {
          description: "Explore renderer flow",
          prompt: "Inspect how Agent blocks are rendered.",
          subagent_type: "explore",
        },
        { id: "tc-agent-preview" },
      ),
      mockText("Done."),
    ]);

    const streamEvents: RuntimeStreamEvent[] = [];

    const result = await runAgentWithBridge(
      {
        sessionId: "session-test",
        agentRunId: "turn-test",
        userInput: "Launch an Agent run.",
      },
      deps,
      {
        onStreamEvent: (event) => {
          streamEvents.push(event);
        },
      },
    );

    expect(streamEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "tool_call_streaming",
          sessionId: "session-test",
          agentRunId: "turn-test",
          toolCallId: "tc-agent-preview",
          toolName: "agent",
          preview: {
            kind: "agent",
            description: "Explore renderer flow",
            status: "running",
            subagentType: "explore",
            displayText: "Explore renderer flow",
          },
        }),
        expect.objectContaining({
          type: "tool_started",
          sessionId: "session-test",
          agentRunId: "turn-test",
          toolCallId: "tc-agent-preview",
          toolName: "agent",
          preview: expect.objectContaining({
            kind: "agent",
            description: "Explore renderer flow",
            status: "running",
            displayText: "Explore renderer flow",
          }),
        }),
      ]),
    );

    const toolResult = result.events.find((event) => event.type === "tool_result");
    expect(toolResult?.payload).toMatchObject({
      toolName: "agent",
      uiPreview: {
        kind: "agent",
        description: "Explore renderer flow",
        status: "completed",
        subagentType: "explore",
        displayText: "Explore renderer flow",
        summary: "Found the renderer flow and selector boundary.",
      },
    });
  });

  it("does not emit tool_call_streaming for unregistered tool names", async () => {
    const deps = createDeps();
    deps.llm.setResponses([
      mockToolCall("not_registered", { path: "/x" }, { id: "tc-unknown" }),
      mockText("Done."),
    ]);

    const streamEvents: RuntimeStreamEvent[] = [];

    await runAgentWithBridge(
      {
        sessionId: "session-test",
        agentRunId: "turn-test",
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
        data: {
          filePath: "/workspace/packages/desktop/src/index.ts",
          relativePath: "packages/desktop/src/index.ts",
          diff: "--- a/src/index.ts\n+++ b/src/index.ts\n@@ -1 +1,2 @@\n-old\n+new\n+line",
          additions: 2,
          deletions: 1,
        },
      }),
      renderResult: (toolResult) => String((toolResult.data as { diff?: string } | undefined)?.diff ?? ""),
    });
    deps.llm.setResponses([
      mockToolCall("read_file", { path: "/workspace/packages/desktop/package.json" }, { id: "tc-read-short-name" }),
      mockToolCall("edit_file", { path: "/workspace/packages/desktop/src/index.ts" }, { id: "tc-edit-short-name" }),
      mockText("Done."),
    ]);

    const result = await runAgentWithBridge(
      {
        sessionId: "session-test",
        agentRunId: "turn-test",
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
        outputPath: "/workspace/packages/desktop/src/index.ts",
        outputRelativePath: "packages/desktop/src/index.ts",
        additions: 2,
        deletions: 1,
      },
    });
  });

  it("keeps full diff and structured stats in edit preview when model output is compressed", async () => {
    // 构造超过 truncateThreshold（默认 2000 字符）的 diff：modelOutput 会被压缩，
    // 但 uiPreview 应从 result.structured 恢复完整 diff 与统计。
    const bigDiff = [
      "Index: src/big.ts",
      "===================================================================",
      "--- src/big.ts",
      "+++ src/big.ts",
      "@@ -1,3 +1,3 @@",
      "-old line",
      `+${"x".repeat(2500)}`,
      "+new line",
    ].join("\n");
    const deps = createDeps();
    deps.toolManager.register({
      name: "edit_file",
      description: "Edit a file",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
      isReadOnly: false,
      previewKind: "edit_diff",
      handler: async (): Promise<ToolResult> => ({
        success: true,
        data: { diff: bigDiff, additions: 40, deletions: 2, filePath: "/workspace/src/big.ts" },
      }),
      renderResult: (result) => {
        const data = result.data as { diff: string };
        return `${data.diff}\n\nFile updated: src/big.ts`;
      },
    });
    deps.llm.setResponses([
      mockToolCall("edit_file", { path: "/workspace/src/big.ts" }, { id: "tc-edit-compressed" }),
      mockText("Done."),
    ]);

    const result = await runAgentWithBridge(
      { sessionId: "session-test", agentRunId: "turn-test", userInput: "Edit the big file." },
      deps,
    );

    const toolResult = result.events.find((event) => event.type === "tool_result");
    const payload = toolResult?.payload as {
      modelOutput?: string;
      uiPreview?: { diff?: string; additions?: number; deletions?: number; status?: string };
    };

    // 回填给模型的输出确实被压缩了
    expect(payload.modelOutput).toContain("已压缩摘要");
    // 但 UI preview 保留完整 diff 与结构化统计
    expect(payload.uiPreview?.diff).toBe(bigDiff);
    expect(payload.uiPreview?.additions).toBe(40);
    expect(payload.uiPreview?.deletions).toBe(2);
    expect(payload.uiPreview?.status).toBe("completed");
  });

  it("marks failed edit previews as failed with an errorMessage instead of a fake diff", async () => {
    const deps = createDeps();
    deps.toolManager.register({
      name: "edit_file",
      description: "Edit a file",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
      isReadOnly: false,
      previewKind: "edit_diff",
      handler: async (): Promise<ToolResult> => ({
        success: false,
        error: "old_string not found in file. Read the file first to verify the current content.",
      }),
    });
    deps.llm.setResponses([
      mockToolCall("edit_file", { path: "/workspace/src/index.ts" }, { id: "tc-edit-failed" }),
      mockText("Done."),
    ]);

    const result = await runAgentWithBridge(
      { sessionId: "session-test", agentRunId: "turn-test", userInput: "Edit the file." },
      deps,
    );

    const toolResult = result.events.find((event) => event.type === "tool_result");

    expect(toolResult?.payload).toMatchObject({
      toolName: "edit_file",
      ok: false,
      uiPreview: {
        kind: "edit_diff",
        filePath: "index.ts",
        additions: 0,
        deletions: 0,
        diff: "",
        status: "failed",
        errorMessage: expect.stringContaining("old_string not found"),
      },
    });
  });

  it("counts edit preview hunk lines without counting unified diff file headers", async () => {
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
        data: "--- a/src/index.ts\n+++ b/src/index.ts\n@@ -1 +1 @@\n---flag\n+++flag",
      }),
    });
    deps.llm.setResponses([
      mockToolCall("edit_file", { path: "/workspace/src/index.ts" }, { id: "tc-edit-header-stats" }),
      mockText("Done."),
    ]);

    const result = await runAgentWithBridge(
      {
        sessionId: "session-test",
        agentRunId: "turn-test",
        userInput: "Delete a line.",
      },
      deps,
    );

    const toolResult = result.events.find((event) => event.type === "tool_result");

    expect(toolResult?.payload).toMatchObject({
      toolName: "edit_file",
      uiPreview: {
        kind: "edit_diff",
        filePath: "index.ts",
        additions: 1,
        deletions: 1,
      },
    });
  });

  it("preserves failed Bash output in tool result and preview", async () => {
    const deps = createDeps();
    deps.toolManager.register(createFailingBashTool());
    deps.llm.setResponses([
      mockToolCall("bash", { command: "npx tsc" }, { id: "tc-bash-fail" }),
      mockText("Done."),
    ]);

    const result = await runAgentWithBridge(
      {
        sessionId: "session-test",
        agentRunId: "turn-test",
        userInput: "Run the compiler.",
      },
      deps,
    );

    const toolResult = result.events.find((event) => event.type === "tool_result");

    expect(toolResult?.payload).toMatchObject({
      toolName: "bash",
      ok: false,
      rawOutput: expect.stringContaining("src/index.ts(1,1): error TS1000: boom"),
      modelOutput: expect.stringContaining("src/index.ts(1,1): error TS1000: boom"),
      uiPreview: {
        kind: "bash",
        status: "failed",
        stderr: expect.stringContaining("src/index.ts(1,1): error TS1000: boom"),
      },
    });
  });

  it("propagates the sandboxed flag from bash results into the UI preview", async () => {
    const deps = createDeps();
    deps.toolManager.register({
      name: "bash",
      description: "Run Bash",
      parameters: {
        type: "object",
        properties: { command: { type: "string", description: "command" } },
        required: ["command"],
      },
      isReadOnly: true,
      previewKind: "bash",
      handler: async (): Promise<ToolResult> => ({
        success: true,
        data: { command: "echo hi", output: "hi", exitCode: 0, sandboxed: true },
      }),
      renderResult: () => "$ echo hi\nenv: sandboxed\n\noutput:\nhi",
    });
    deps.llm.setResponses([
      mockToolCall("bash", { command: "echo hi" }, { id: "tc-bash-sandboxed" }),
      mockText("Done."),
    ]);

    const result = await runAgentWithBridge(
      {
        sessionId: "session-test",
        agentRunId: "turn-test",
        userInput: "Say hi.",
      },
      deps,
    );

    const toolResult = result.events.find((event) => event.type === "tool_result");

    expect(toolResult?.payload).toMatchObject({
      toolName: "bash",
      uiPreview: {
        kind: "bash",
        sandboxed: true,
      },
    });
  });

  it("marks a hard-rejected Bash command as denied and not executed", async () => {
    const deps = createDeps();
    deps.toolManager.register({
      name: "bash",
      description: "Run Bash",
      parameters: {
        type: "object",
        properties: { command: { type: "string", description: "command" } },
        required: ["command"],
      },
      isReadOnly: false,
      previewKind: "bash",
      checkPermissions: async () => ({
        decision: "deny",
        reason: "Delete command targets the workspace root",
      }),
      handler: async (): Promise<ToolResult> => {
        throw new Error("denied Bash handler must not run");
      },
    });
    deps.llm.setResponses([
      mockToolCall("bash", { command: "rm -rf ." }, { id: "tc-bash-denied" }),
      mockText("Denied."),
    ]);

    const result = await runAgentWithBridge(
      {
        sessionId: "session-test",
        agentRunId: "turn-test",
        userInput: "Delete the workspace.",
      },
      deps,
    );

    const toolResult = result.events.find((event) => event.type === "tool_result");
    expect(toolResult?.payload).toMatchObject({
      toolName: "bash",
      ok: false,
      modelOutput: expect.stringContaining("no approval request was created"),
      uiPreview: {
        kind: "bash",
        status: "denied",
        notExecuted: true,
      },
    });
  });

  it("synthesizes a pseudo command for bash_output previews so the UI shows what ran", async () => {
    const deps = createDeps();
    deps.toolManager.register({
      name: "bash_output",
      description: "Read background task output",
      parameters: {
        type: "object",
        properties: {
          taskId: { type: "string", description: "task id" },
          tailLines: { type: "number", description: "tail lines" },
        },
        required: ["taskId"],
      },
      isReadOnly: true,
      previewKind: "bash",
      handler: async (): Promise<ToolResult> => ({
        success: true,
        data: "Task bash_task123 status=running\nsome output",
      }),
    });
    deps.llm.setResponses([
      mockToolCall("bash_output", { taskId: "bash_task123", tailLines: 50 }, { id: "tc-bash-output" }),
      mockText("Done."),
    ]);

    const result = await runAgentWithBridge(
      {
        sessionId: "session-test",
        agentRunId: "turn-test",
        userInput: "Check the background task.",
      },
      deps,
    );

    const toolResult = result.events.find((event) => event.type === "tool_result");
    expect(toolResult?.payload).toMatchObject({
      toolName: "bash_output",
      ok: true,
      uiPreview: {
        kind: "bash",
        command: "bash_output bash_task123 --tail 50",
        commandPreview: "bash_output bash_task123 --tail",
      },
    });
  });

  it("records failed Bash output in run log previews", async () => {
    const deps = createDeps();
    deps.toolManager.register(createFailingBashTool());
    deps.llm.setResponses([
      mockToolCall("bash", { command: "npx tsc" }, { id: "tc-bash-fail" }),
      mockText("Done."),
    ]);
    const runLogEvents: AgentRunLogEvent[] = [];
    const runLogger: AgentRunLogger = {
      filePath: "/tmp/test-run.jsonl",
      write: async (event) => {
        runLogEvents.push(event);
      },
    };

    await runAgentWithBridge(
      {
        sessionId: "session-test",
        agentRunId: "turn-test",
        userInput: "Run the compiler.",
      },
      deps,
      { runLogger },
    );

    const toolEndEvent = runLogEvents.find((event) => {
      const payload = event.payload as { type?: string; toolName?: string } | undefined;
      return event.type === "tool_event" && payload?.type === "tool_end" && payload.toolName === "bash";
    });

    expect(toolEndEvent?.payload).toEqual(
      expect.objectContaining({
        result: expect.objectContaining({
          data: expect.stringContaining("src/index.ts(1,1): error TS1000: boom"),
        }),
      }),
    );
  });
});

describe("background bash task notifications", () => {
  afterEach(async () => {
    const waits = bashTaskRegistry.listRunning().flatMap((task) => {
      const handle = bashTaskRegistry.getHandle(task.taskId);
      return handle ? [handle.wait] : [];
    });
    bashTaskRegistry.harvestAll();
    await Promise.all(waits);
    bashTaskRegistry.clear();
  });

  it("injects pending task notifications as steering messages at turn boundaries", async () => {
    const deps = createDeps();
    bashTaskRegistry.pushNotification({
      taskId: "bash_test123",
      sessionId: "session-notify",
      status: "completed",
      text: "<task_notification>\n<task_id>bash_test123</task_id>\n<status>completed</status>\n</task_notification>",
    });

    let modelSawNotification = false;
    deps.llm.setResponses([
      (context) => {
        modelSawNotification = context.messages.some(
          (message) =>
            message.role === "user" &&
            typeof message.content === "string" &&
            message.content.includes("<task_notification>"),
        );
        return mockText("Noted the background task result.");
      },
    ]);

    const result = await runAgentWithBridge(
      { sessionId: "session-notify", agentRunId: "turn-notify", userInput: "继续" },
      deps,
    );

    expect(modelSawNotification).toBe(true);
    const notificationEvent = result.events.find(
      (event) =>
        event.type === "user_message" &&
        (event.payload as { source?: string }).source === "task_notification",
    );
    expect(notificationEvent).toBeTruthy();
    expect((notificationEvent?.payload as { content: string }).content).toContain("bash_test123");

    // 通知已被 drain，不会重复注入
    expect(bashTaskRegistry.drainPendingNotifications("session-notify")).toHaveLength(0);
  });

  it("does not inject anything for sessions without pending notifications", async () => {
    const deps = createDeps();
    bashTaskRegistry.pushNotification({
      taskId: "bash_other",
      sessionId: "session-other",
      status: "completed",
      text: "<task_notification>other</task_notification>",
    });

    const result = await runAgentWithBridge(
      { sessionId: "session-no-notify", agentRunId: "turn-x", userInput: "hello" },
      deps,
    );

    const injected = result.events.filter(
      (event) =>
        event.type === "user_message" &&
        (event.payload as { source?: string }).source === "task_notification",
    );
    expect(injected).toHaveLength(0);
    // 其他会话的通知仍在队列里
    expect(bashTaskRegistry.drainPendingNotifications("session-other")).toHaveLength(1);
  });

  it("injects the running task list once before the first model call of a user turn", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "actspace-bridge-background-list-"));
    const sessionId = "session-running-list";
    const background = await bashExecutor(
      { command: "sleep 30", cwd: workspace, blockMs: 0 },
      workspace,
      { sessionId, maxRuntimeMs: 30_000 },
    );
    expect(background.success).toBe(true);

    const backgroundMessageCounts: number[] = [];
    const deps = createDeps();
    deps.llm.setResponses([
      (context) => {
        backgroundMessageCounts.push(context.messages.filter(
          (message) =>
            message.role === "user" &&
            typeof message.content === "string" &&
            message.content.includes("<background_tasks>"),
        ).length);
        return mockToolCall("read_file", { path: "README.md" });
      },
      (context) => {
        backgroundMessageCounts.push(context.messages.filter(
          (message) =>
            message.role === "user" &&
            typeof message.content === "string" &&
            message.content.includes("<background_tasks>"),
        ).length);
        return mockText("Background task noted once.");
      },
    ]);

    const result = await runAgentWithBridge(
      { sessionId, agentRunId: "turn-running-list", userInput: "继续" },
      deps,
    );

    expect(backgroundMessageCounts).toEqual([1, 1]);
    const runningListEvents = result.events.filter(
      (event) =>
        event.type === "user_message" &&
        typeof (event.payload as { content?: unknown }).content === "string" &&
        ((event.payload as { content: string }).content.includes("<background_tasks>")),
    );
    expect(runningListEvents).toHaveLength(1);
    await rm(workspace, { recursive: true, force: true });
  });
});
