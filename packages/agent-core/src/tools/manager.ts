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
import { ToolScheduler, type ApprovalGate } from "./scheduler";

const DEFAULT_TRUNCATE_THRESHOLD = 2000;

export class ToolManager {
  private tools = new Map<string, InternalTool>();
  private workspaceRoot: string;
  private additionalWritableRoots: string[];
  private truncateThreshold: number;
  private scheduler: ToolScheduler;

  constructor(config: ToolManagerConfig) {
    this.workspaceRoot = config.workspaceRoot;
    this.additionalWritableRoots = config.additionalWritableRoots ?? [];
    this.truncateThreshold = config.truncateThreshold ?? DEFAULT_TRUNCATE_THRESHOLD;
    this.scheduler = new ToolScheduler({
      truncateThreshold: this.truncateThreshold,
      readTruncateThreshold: config.readTruncateThreshold,
      absoluteMaxChars: config.absoluteMaxChars,
      summarizer: config.summarizer,
      approvalGate: config.approvalGate,
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
      handler: (args) => executor(args, this.workspaceRoot, {
        additionalWritableRoots: this.additionalWritableRoots,
      }),
      isReadOnly: spec.isReadOnly,
      category: spec.category,
      previewKind: spec.previewKind,
      renderResult,
      extractPaths: spec.extractPaths,
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
  async execute(
    toolName: string,
    args: Record<string, unknown>,
    toolCallId?: string,
    options?: ToolExecuteOptions,
  ): Promise<ToolResult> {
    const tool = this.tools.get(toolName);
    const execution = await this.scheduler.execute(tool, toolName, args, toolCallId, options);
    return execution.result;
  }
}

/**
 * Caller-specific options for tool execution.
 * Main Agent 调用时不传或传 `callerAgent: "main"`，行为与历史一致。
 * Kairos 调用时必须传 `callerAgent: "kairos"` + `kairosGuard`，scheduler 会做额外路径/blocklist 校验。
 */
export interface ToolExecuteOptions {
  callerAgent?: "main" | "kairos";
  kairosGuard?: KairosGuardContext;
}

/** Kairos 工具调用守卫上下文：allowedRoots（白名单）+ blocklist（黑名单）+ toolsDenied（双保险） */
export interface KairosGuardContext {
  allowedRoots: string[];
  blocklistPaths: string[];           // glob，由 kairos/guard/blocklist-check.ts 解析
  toolsDenied: string[];
}
