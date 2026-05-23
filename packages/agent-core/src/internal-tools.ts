/**
 * Agent-core 内部工具类型体系
 *
 * 采用 definition + executor 分离模式：
 * - InternalTool：系统内部完整工具（含 handler/checkPermissions/renderResult/isReadOnly）
 * - Tool（来自 messages.ts）：给 LLM 看的 definition 子集（name/description/parameters）
 *
 * InternalTool.handler 返回统一的 ToolResult { success, data?, error? }，
 * 调度器用同一套逻辑处理所有工具的结果（裁剪、格式化、错误重试等）。
 *
 * 设计参考：.agents/skills/llm-agent-dev/references/tools/tool-definition.md
 * 代码参考：.agents/skills/llm-agent-dev/examples/tool-definition.ts
 */

import type { Tool } from "./messages";

// ─── ToolResult（统一返回类型） ───

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

// ─── Permission（权限验证） ───

export interface PermissionResult {
  passed: boolean;
  error?: string;
  /** 验证通过后可修正参数（如路径展开、超时值清洗） */
  sanitizedArgs?: Record<string, unknown>;
}

// ─── 函数类型 ───

export type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;
export type PermissionChecker = (args: Record<string, unknown>) => Promise<PermissionResult>;
export type ResultRenderer = (result: ToolResult) => string;

// ─── Parameter Schema ───

export interface ToolParameterProperty {
  type: string;
  description: string;
  enum?: string[];
  items?: { type: string };
}

export interface ToolParameterSchema {
  type: "object";
  properties: Record<string, ToolParameterProperty>;
  required: string[];
  additionalProperties?: boolean;
}

// ─── InternalTool（系统内部完整工具） ───

export interface InternalTool {
  name: string;
  /** 工具描述：LLM 选择工具的唯一依据。应包含功能定位 + 使用约束 + 负面指引 */
  description: string;
  parameters: ToolParameterSchema;
  handler: ToolHandler;
  /** 权限验证，在执行前调用。可拒绝/修正参数/通过 */
  checkPermissions?: PermissionChecker;
  /** 结果格式化，将 ToolResult 转为 LLM 可读自然语言 */
  renderResult?: ResultRenderer;
  /** 工具分类 */
  category?: string;
  /** 只读标记，影响审批模式和并行调度策略 */
  isReadOnly?: boolean;
}

// ─── InternalTool → Tool 转换 ───

export function toToolDefinition(tool: InternalTool): Tool {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters as unknown as Record<string, unknown>,
  };
}

// ─── InternalToolRegistry ───

export class InternalToolRegistry {
  private tools = new Map<string, InternalTool>();

  static from(tools: InternalTool[]): InternalToolRegistry {
    const registry = new InternalToolRegistry();
    for (const tool of tools) {
      registry.register(tool);
    }
    return registry;
  }

  register(tool: InternalTool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): InternalTool | undefined {
    return this.tools.get(name);
  }

  getAll(): InternalTool[] {
    return Array.from(this.tools.values());
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  /** 导出为 LLM 消费的 Tool[] 格式 */
  getToolDefinitions(): Tool[] {
    return this.getAll().map(toToolDefinition);
  }
}
