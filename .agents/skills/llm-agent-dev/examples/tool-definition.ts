/**
 * 工具类型体系示例
 * definition + executor 分离模式的核心类型定义。
 */

export interface ToolParameterSchema {
  type: 'object';
  properties: Record<string, {
    type: string;
    description: string;
    enum?: string[];
    items?: { type: string };
  }>;
  required: string[];
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface PermissionResult {
  passed: boolean;
  error?: string;
  sanitizedArgs?: Record<string, unknown>; // 验证后可修正参数
}

export type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;
export type PermissionChecker = (args: Record<string, unknown>) => Promise<PermissionResult>;
export type ResultRenderer = (result: ToolResult) => string;

export interface InternalTool {
  name: string;
  description: string;
  parameters: ToolParameterSchema;
  handler: ToolHandler;
  checkPermissions?: PermissionChecker;
  renderResult?: ResultRenderer;
  category?: string;
  isReadOnly?: boolean;
}

/** 转换为 OpenAI function calling 格式 */
export function toOpenAIFunction(tool: InternalTool) {
  return {
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}

/** 工具注册表：管理所有已注册工具 */
export class ToolRegistry {
  private tools = new Map<string, InternalTool>();

  static from(tools: InternalTool[]): ToolRegistry {
    const registry = new ToolRegistry();
    for (const tool of tools) {
      registry.register(tool);
    }
    return registry;
  }

  register(tool: InternalTool) {
    this.tools.set(tool.name, tool);
  }

  get(name: string): InternalTool | undefined {
    return this.tools.get(name);
  }

  getAll(): InternalTool[] {
    return Array.from(this.tools.values());
  }

  /** 获取所有工具的 LLM 格式定义（用于 complete 调用） */
  getDefinitions() {
    return this.getAll().map(toOpenAIFunction);
  }
}
