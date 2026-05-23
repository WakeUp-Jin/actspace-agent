/**
 * ToolManager — V0 工具调度器
 *
 * 职责：
 * 1. 注册：将 ToolDefinitionSpec + ToolExecutorFn 合并为 InternalTool
 * 2. 查询：按名称获取工具
 * 3. 执行：调用 handler，对结果做硬截断
 * 4. 导出：输出 LLM 可消费的 Tool[] 列表
 *
 * V1 升级路径：引入 ToolScheduler 替代 execute()，增加生命周期状态机和 OutputTruncator。
 */

import type {
  InternalTool,
  ToolResult,
  ResultRenderer,
} from "../internal-tools";
import { toToolDefinition } from "../internal-tools";
import type { Tool } from "../messages";
import type { ToolDefinitionSpec, ToolExecutorFn, ToolManagerConfig } from "./types";

const DEFAULT_TRUNCATE_THRESHOLD = 2000;

export class ToolManager {
  private tools = new Map<string, InternalTool>();
  private workspaceRoot: string;
  private truncateThreshold: number;

  constructor(config: ToolManagerConfig) {
    this.workspaceRoot = config.workspaceRoot;
    this.truncateThreshold = config.truncateThreshold ?? DEFAULT_TRUNCATE_THRESHOLD;
  }

  /**
   * 从 definition + executor 注册一个工具
   * 将两者合并为完整的 InternalTool
   */
  registerFromSpec(spec: ToolDefinitionSpec, executor: ToolExecutorFn, renderResult?: ResultRenderer): void {
    const tool: InternalTool = {
      name: spec.name,
      description: spec.description,
      parameters: spec.parameters,
      handler: (args) => executor(args, this.workspaceRoot),
      isReadOnly: spec.isReadOnly,
      category: spec.category,
      renderResult,
    };
    this.tools.set(tool.name, tool);
  }

  /** 直接注册一个完整的 InternalTool */
  register(tool: InternalTool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): InternalTool | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  getAll(): InternalTool[] {
    return Array.from(this.tools.values());
  }

  /** 导出 LLM 消费的 Tool[] */
  getToolDefinitions(): Tool[] {
    return this.getAll().map(toToolDefinition);
  }

  /**
   * 执行工具并对结果做硬截断
   *
   * 流程：handler → renderResult（可选）→ truncate
   */
  async execute(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return {
        success: false,
        error: `Tool not found: ${toolName}`,
      };
    }

    try {
      const result = await tool.handler(args);
      return this.postProcess(tool, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `Tool execution failed: ${message}`,
      };
    }
  }

  private postProcess(tool: InternalTool, result: ToolResult): ToolResult {
    if (!result.success) return result;

    let rendered: string | undefined;
    if (tool.renderResult && result.data !== undefined) {
      rendered = tool.renderResult(result);
    }

    const rawData = rendered ?? (typeof result.data === "string" ? result.data : JSON.stringify(result.data));
    if (rawData && rawData.length > this.truncateThreshold) {
      return {
        success: true,
        data: rawData.slice(0, this.truncateThreshold) +
          `\n\n[Output truncated. Showing ${this.truncateThreshold} of ${rawData.length} characters]`,
      };
    }

    return result;
  }
}
