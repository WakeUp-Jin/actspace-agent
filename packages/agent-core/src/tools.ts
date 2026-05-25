/**
 * 工具系统兼容层
 *
 * 保留旧版 ToolRegistry/createToolRegistry/createDefaultTools 接口，
 * 供 agent.ts、desktop/main/index.ts 等现有消费者使用。
 *
 * 新代码应直接使用 tools/ 目录下的 ToolManager 和 definition+executor 模式。
 * 此文件将在所有消费者迁移后移除。
 */

import type {
  RegisteredTool,
  ToolDefinition,
  ToolExecutionContext,
  ToolExecutor
} from "./types";
import type { ToolExecutionResult } from "@actspace/shared";

// Re-export 新工具系统的所有导出
export * from "./tools/index";

// ─── 旧版接口（向后兼容） ───

export type ToolRegistry = {
  register(tool: RegisteredTool): void;
  get(toolName: string): RegisteredTool | undefined;
  list(): ToolDefinition[];
  execute(toolName: string, input: Record<string, unknown>, context: ToolExecutionContext): Promise<Awaited<ReturnType<ToolExecutor>>>;
};

export function createToolRegistry(): ToolRegistry {
  const tools = new Map<string, RegisteredTool>();

  return {
    register(tool) {
      tools.set(tool.definition.name, tool);
    },
    get(toolName) {
      return tools.get(toolName);
    },
    list() {
      return [...tools.values()].map((tool) => tool.definition);
    },
    async execute(toolName, input, context) {
      const tool = tools.get(toolName);
      if (!tool) {
        return createToolResult({
          toolName,
          ok: false,
          summary: `Tool not found: ${toolName}`,
          rawOutput: "",
          error: {
            code: "TOOL_NOT_FOUND",
            message: `Tool not found: ${toolName}`,
            recoverable: true
          }
        });
      }

      return tool.execute(input, context);
    }
  };
}

function createToolResult(input: {
  toolName: string;
  ok: boolean;
  summary: string;
  rawOutput?: string;
  modelOutput?: string;
  uiPreview?: ToolExecutionResult["uiPreview"];
  artifacts?: ToolExecutionResult["artifacts"];
  error?: ToolExecutionResult["error"];
}): ToolExecutionResult {
  const now = new Date().toISOString();
  const rawOutput = input.rawOutput ?? "";
  const modelOutput = input.modelOutput ?? rawOutput.slice(0, 2000);

  return {
    toolName: input.toolName,
    ok: input.ok,
    summary: input.summary,
    rawOutput,
    truncatedOutput: modelOutput,
    rawOutputRef: {
      kind: "inline",
      value: rawOutput
    },
    modelOutput,
    uiPreview: input.uiPreview,
    artifacts: input.artifacts,
    error: input.error,
    startedAt: now,
    endedAt: now,
    durationMs: 0,
    tokenEstimate: Math.ceil(modelOutput.length / 4)
  };
}

function createReadFileTool(): RegisteredTool {
  const definition: ToolDefinition = {
        name: "read_file",
        description: "Read a local file and return a concise preview for the model.",
        previewKind: "read",
        inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" }
      },
      required: ["path"],
      additionalProperties: false
    }
  };

  return {
    definition,
    async execute(input) {
      const path = typeof input.path === "string" ? input.path : "";
      return createToolResult({
        toolName: definition.name,
        ok: path.length > 0,
        summary: path ? `Read ${path}` : "Missing path",
        rawOutput: path ? `Preview for ${path}` : "",
        modelOutput: path ? `Preview for ${path}` : "",
        uiPreview: path
          ? {
              kind: "read",
              filePath: path,
              displayText: `Read ${path}`
            }
          : undefined,
        artifacts: path ? [{ type: "file", name: path }] : undefined,
        error: path
          ? undefined
          : {
              code: "INVALID_INPUT",
              message: "path is required",
              recoverable: true
            }
      });
    }
  };
}

function createSearchFilesTool(): RegisteredTool {
  const definition: ToolDefinition = {
        name: "search_files",
        description: "Search for text across files in the workspace.",
        previewKind: "search",
        inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" }
      },
      required: ["query"],
      additionalProperties: false
    }
  };

  return {
    definition,
    async execute(input) {
      const query = typeof input.query === "string" ? input.query : "";
      return createToolResult({
        toolName: definition.name,
        ok: query.length > 0,
        summary: query ? `Search for ${query}` : "Missing query",
        rawOutput: query ? `No real search implementation yet for "${query}"` : "",
        modelOutput: query ? `No real search implementation yet for "${query}"` : "",
        uiPreview: query
          ? {
              kind: "search",
              query,
              displayText: `Searched files for "${query}"`
            }
          : undefined,
        error: query
          ? undefined
          : {
              code: "INVALID_INPUT",
              message: "query is required",
              recoverable: true
            }
      });
    }
  };
}

function createEditFileDiffTool(): RegisteredTool {
  const definition: ToolDefinition = {
        name: "edit_file_diff",
        description: "Stage a unified diff preview for a file edit.",
        previewKind: "edit_diff",
        inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        diff: { type: "string" }
      },
      required: ["path", "diff"],
      additionalProperties: false
    }
  };

  return {
    definition,
    async execute(input) {
      const path = typeof input.path === "string" ? input.path : "";
      const diff = typeof input.diff === "string" ? input.diff : "";
      return createToolResult({
        toolName: definition.name,
        ok: path.length > 0 && diff.length > 0,
        summary: path ? `Diff preview for ${path}` : "Missing path",
        rawOutput: diff,
        modelOutput: diff.slice(0, 600),
        uiPreview:
          path.length > 0 && diff.length > 0
            ? {
                kind: "edit_diff",
                filePath: path,
                additions: countDiffLines(diff, "+"),
                deletions: countDiffLines(diff, "-"),
                diff: diff.slice(0, 600),
                collapsedLines: 5
              }
            : undefined,
        artifacts: path ? [{ type: "diff", name: path }] : undefined,
        error:
          path.length > 0 && diff.length > 0
            ? undefined
            : {
                code: "INVALID_INPUT",
                message: "path and diff are required",
                recoverable: true
              }
      });
    }
  };
}

function createListDirectoryTool(): RegisteredTool {
  const definition: ToolDefinition = {
        name: "list_directory",
        description: "List files in a directory for lightweight navigation.",
        previewKind: "directory_list",
        inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" }
      },
      required: ["path"],
      additionalProperties: false
    }
  };

  return {
    definition,
    async execute(input) {
      const path = typeof input.path === "string" ? input.path : "";
      return createToolResult({
        toolName: definition.name,
        ok: path.length > 0,
        summary: path ? `List ${path}` : "Missing path",
        rawOutput: path ? `Directory listing for ${path}` : "",
        modelOutput: path ? `Directory listing for ${path}` : "",
        uiPreview: path
          ? {
              kind: "directory_list",
              path,
              displayText: `Listed ${path}`
            }
          : undefined,
        artifacts: path ? [{ type: "file", name: path }] : undefined,
        error: path
          ? undefined
          : {
              code: "INVALID_INPUT",
              message: "path is required",
              recoverable: true
            }
      });
    }
  };
}

function countDiffLines(diff: string, marker: "+" | "-"): number {
  return diff
    .split("\n")
    .filter((line) => line.startsWith(marker) && !line.startsWith(`${marker}${marker}${marker}`)).length;
}

export function createDefaultTools(): RegisteredTool[] {
  return [
    createReadFileTool(),
    createSearchFilesTool(),
    createEditFileDiffTool(),
    createListDirectoryTool()
  ];
}
