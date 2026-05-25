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
import { ToolScheduler } from "./scheduler";

const DEFAULT_TRUNCATE_THRESHOLD = 2000;

export class ToolManager {
  private tools = new Map<string, InternalTool>();
  private workspaceRoot: string;
  private truncateThreshold: number;
  private scheduler: ToolScheduler;

  constructor(config: ToolManagerConfig) {
    this.workspaceRoot = config.workspaceRoot;
    this.truncateThreshold = config.truncateThreshold ?? DEFAULT_TRUNCATE_THRESHOLD;
    this.scheduler = new ToolScheduler({
      truncateThreshold: this.truncateThreshold,
    });
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
      previewKind: spec.previewKind,
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

  /** 执行工具：权限检查 → handler → renderResult（可选）→ truncate */
  async execute(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.tools.get(toolName);
    const execution = await this.scheduler.execute(tool, toolName, args);
    return execution.result;
  }
}
