/**
 * 完整 turn mock fixtures
 *
 * 基于新类型体系（Message 判别联合），模拟一轮完整 Agent turn 的所有消息。
 * 覆盖：user_message → thinking + tool_calls → tool_results → final reply
 *
 * 这些 fixtures 可被前端、后端测试和执行引擎计划复用。
 */

import type {
  AssistantMessage,
  Context,
  Message,
  ToolResultMessage,
  Usage,
  UserMessage,
} from "./messages";
import { MessagePriority, createEmptyUsage } from "./messages";
import type { InternalTool, ToolResult } from "./internal-tools";

// ─── Usage Fixture ───

export function createMockUsage(overrides?: Partial<Usage>): Usage {
  return {
    input: 1200,
    output: 480,
    cacheRead: 0,
    cacheWrite: 0,
    reasoning: 0,
    cacheHit: 0,
    cacheMiss: 0,
    totalTokens: 1680,
    cost: { input: 0.0012, output: 0.0048, cacheRead: 0, cacheWrite: 0, total: 0.006 },
    ...overrides,
  };
}

// ─── 单条消息 Fixtures ───

export function createMockUserMessage(text = "Review the project structure and suggest improvements."): UserMessage {
  return {
    role: "user",
    content: text,
    timestamp: Date.now(),
    source: "user",
    priority: MessagePriority.HIGH,
  };
}

/**
 * 第一轮 assistant 回复：thinking + tool calls（stopReason: toolUse）
 * 模拟 agent 先思考再调工具的典型模式
 */
export function createMockAssistantWithToolCalls(): AssistantMessage {
  return {
    role: "assistant",
    content: [
      {
        type: "thinking",
        thinking: "I need to read the project structure first. Let me check the README and main architecture doc.",
      },
      {
        type: "toolCall",
        id: "tc_read_1",
        name: "read_file",
        arguments: { path: "README.md" },
      },
      {
        type: "toolCall",
        id: "tc_search_1",
        name: "search_files",
        arguments: { query: "export function" },
      },
    ],
    model: "deepseek-mock",
    provider: "deepseek",
    usage: createMockUsage({ input: 820, output: 340, totalTokens: 1160 }),
    stopReason: "toolUse",
    timestamp: Date.now(),
    source: "llm",
    priority: MessagePriority.HIGH,
  };
}

export function createMockReadFileResult(): ToolResultMessage {
  return {
    role: "toolResult",
    toolCallId: "tc_read_1",
    toolName: "read_file",
    content: [
      {
        type: "text",
        text: "# actspace\n\nA desktop workbench for AI-assisted development.\n\n## Tech Stack\n- Electron + React + TypeScript + Vite\n- Radix UI primitives\n- Local JSONL session storage",
      },
    ],
    isError: false,
    timestamp: Date.now(),
    source: "tool:read_file",
    priority: MessagePriority.HIGH,
  };
}

export function createMockSearchResult(): ToolResultMessage {
  return {
    role: "toolResult",
    toolCallId: "tc_search_1",
    toolName: "search_files",
    content: [
      {
        type: "text",
        text: "Found 12 matches in 5 files:\n- packages/agent-core/src/agent.ts:45 export function createAgentRuntime\n- packages/agent-core/src/tools.ts:16 export function createToolRegistry\n- packages/shared/src/session-selectors.ts:163 export function createMessageBlocks",
      },
    ],
    isError: false,
    timestamp: Date.now(),
    source: "tool:search_files",
    priority: MessagePriority.HIGH,
  };
}

/**
 * 第二轮 assistant 回复：thinking + edit diff tool call
 */
export function createMockAssistantWithEditDiff(): AssistantMessage {
  return {
    role: "assistant",
    content: [
      {
        type: "thinking",
        thinking: "I see the project structure. Let me suggest an improvement to the architecture doc.",
      },
      {
        type: "toolCall",
        id: "tc_diff_1",
        name: "edit-file",
        arguments: {
          path: "docs/ARCHITECTURE.md",
          diff: "@@ -1,3 +1,5 @@\n- Old architecture notes\n+ actspace desktop workbench skeleton\n+ typed agent runtime contracts\n+ local session persistence wiring\n",
        },
      },
    ],
    model: "deepseek-mock",
    provider: "deepseek",
    usage: createMockUsage({ input: 1400, output: 280, totalTokens: 1680 }),
    stopReason: "toolUse",
    timestamp: Date.now(),
    source: "llm",
  };
}

export function createMockEditDiffResult(): ToolResultMessage {
  return {
    role: "toolResult",
    toolCallId: "tc_diff_1",
    toolName: "edit-file",
    content: [
      {
        type: "text",
        text: "Edited ARCHITECTURE.md: +3 additions, -1 deletion",
      },
    ],
    isError: false,
    timestamp: Date.now(),
    source: "tool:edit-file",
  };
}

/**
 * 最终 assistant 回复：thinking + text（stopReason: stop）
 */
export function createMockFinalReply(): AssistantMessage {
  return {
    role: "assistant",
    content: [
      {
        type: "thinking",
        thinking: "All changes staged. Let me summarize what I found and did.",
      },
      {
        type: "text",
        text: "I reviewed the project structure and made the following observations:\n\n1. The monorepo is well-organized with `packages/desktop`, `packages/agent-core`, and `packages/shared`.\n2. The agent runtime contracts are cleanly typed.\n3. I staged an architecture doc improvement that reflects the current state.\n\nThe project is in good shape for the next development phase.",
      },
    ],
    model: "deepseek-mock",
    provider: "deepseek",
    usage: createMockUsage({ input: 2100, output: 520, totalTokens: 2620 }),
    stopReason: "stop",
    timestamp: Date.now(),
    source: "llm",
  };
}

// ─── 失败场景 Fixtures ───

export function createMockToolErrorResult(): ToolResultMessage {
  return {
    role: "toolResult",
    toolCallId: "tc_read_err",
    toolName: "read_file",
    content: [
      {
        type: "text",
        text: "Error: File not found: nonexistent.ts",
      },
    ],
    isError: true,
    timestamp: Date.now(),
    source: "tool:read_file",
  };
}

export function createMockProviderErrorReply(): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text: "" }],
    model: "unknown",
    provider: "unknown",
    usage: createEmptyUsage(),
    stopReason: "error",
    errorMessage: "Provider returned HTTP 429: Rate limit exceeded",
    timestamp: Date.now(),
  };
}

export function createMockAbortedReply(): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text: "" }],
    model: "deepseek-mock",
    provider: "deepseek",
    usage: createEmptyUsage(),
    stopReason: "aborted",
    errorMessage: "User cancelled the request",
    timestamp: Date.now(),
  };
}

// ─── 完整 Turn Fixture ───

/**
 * 模拟完整 turn 的消息序列：
 *
 * 1. UserMessage
 * 2. AssistantMessage (thinking + read_file + search_files tool calls)
 * 3. ToolResultMessage (read_file result)
 * 4. ToolResultMessage (search_files result)
 * 5. AssistantMessage (thinking + edit-file tool call)
 * 6. ToolResultMessage (edit-file result)
 * 7. AssistantMessage (thinking + final text reply)
 */
export function createMockFullTurnMessages(): Message[] {
  return [
    createMockUserMessage(),
    createMockAssistantWithToolCalls(),
    createMockReadFileResult(),
    createMockSearchResult(),
    createMockAssistantWithEditDiff(),
    createMockEditDiffResult(),
    createMockFinalReply(),
  ];
}

/**
 * 完整 turn 的 Context 快照（包含 system prompt + messages + tools）
 */
export function createMockFullTurnContext(): Context {
  return {
    systemPrompt: "You are actspace, a helpful AI assistant for software development.",
    messages: createMockFullTurnMessages(),
    tools: [
      { name: "read_file", description: "Read a local file.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
      { name: "search_files", description: "Search for text across files.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
      { name: "list_directory", description: "List files in a directory.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
      { name: "edit-file", description: "Stage a diff preview.", parameters: { type: "object", properties: { path: { type: "string" }, diff: { type: "string" } }, required: ["path", "diff"] } },
    ],
  };
}

// ─── InternalTool Fixture ───

export function createMockInternalTool(): InternalTool {
  return {
    name: "read_file",
    description: "Read a local file and return a concise preview.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path relative to workspace root" },
      },
      required: ["path"],
    },
    isReadOnly: true,
    category: "file",
    previewKind: "read",
    handler: async (args): Promise<ToolResult> => {
      const path = args.path as string;
      if (!path) {
        return { success: false, error: "path is required" };
      }
      return { success: true, data: `Mock content of ${path}` };
    },
    renderResult: (result) => {
      if (!result.success) return `Error: ${result.error}`;
      return String(result.data);
    },
  };
}
