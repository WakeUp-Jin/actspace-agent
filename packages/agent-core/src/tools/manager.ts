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
  PermissionChecker,
  ToolResult,
  ResultRenderer,
} from "../internal-tools";
import { toToolDefinition } from "../internal-tools";
import type { Tool } from "../messages";
import type {
  ReadFileRangeCacheEntry,
  ToolDefinitionSpec,
  ToolExecutorFn,
  ToolManagerConfig,
} from "./types";
import { ToolScheduler, type ApprovalGate } from "./scheduler";

const DEFAULT_TRUNCATE_THRESHOLD = 2000;

export class ToolManager {
  private tools = new Map<string, InternalTool>();
  private disposers: Array<() => Promise<void> | void> = [];
  private disposed = false;
  private workspaceRoot: string;
  private additionalWritableRoots: string[];
  private truncateThreshold: number;
  private scheduler: ToolScheduler;
  private readFileCache = new Map<string, ReadFileRangeCacheEntry>();

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
      approvalContext: { sessionId: config.sessionId, turnId: config.turnId },
    });
  }

  /**
   * 从 definition + executor 注册一个工具
   * 将两者合并为完整的 InternalTool
   */
  registerFromSpec(
    spec: ToolDefinitionSpec,
    executor: ToolExecutorFn,
    renderResult?: ResultRenderer,
    checkPermissions?: PermissionChecker,
  ): void {
    const tool: InternalTool = {
      name: spec.name,
      description: spec.description,
      parameters: spec.parameters,
      handler: (args) => executor(args, this.workspaceRoot, {
        additionalWritableRoots: this.additionalWritableRoots,
        readFileCache: this.readFileCache,
      }),
      isReadOnly: spec.isReadOnly,
      category: spec.category,
      previewKind: spec.previewKind,
      renderResult,
      checkPermissions,
      extractPaths: spec.extractPaths,
    };
    this.tools.set(tool.name, tool);
  }

  /** 直接注册一个完整的 InternalTool */
  register(tool: InternalTool): void {
    this.tools.set(tool.name, tool);
  }

  /** 注册与当前 ToolManager 同生命周期的资源清理函数。 */
  registerDisposer(disposer: () => Promise<void> | void): void {
    this.disposers.push(disposer);
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
    const execution = await this.scheduler.execute(tool, toolName, args, toolCallId, {
      ...options,
      toolCallId,
    });
    return execution.result;
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    const disposers = this.disposers.splice(0).reverse();
    const results = await Promise.allSettled(disposers.map((dispose) => dispose()));
    const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failure) throw failure.reason;
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
  toolCallId?: string;
  signal?: AbortSignal;
  subagentEventSink?: import("./tools/agent/runner").SubAgentEventSink;
  blockWriteToolsForTruncatedAssistant?: boolean;
}

/** Kairos 工具调用守卫上下文：allowedRoots（读写白名单）+ readOnlyRoots（只读白名单）+ blocklist（黑名单）+ toolsDenied（双保险） */
export interface KairosGuardContext {
  /** 可读**可写**的根路径（paths.json 声明，默认只有 Kairos workspace）。 */
  allowedRoots: string[];
  /**
   * 只读授权的根路径：只读工具（isReadOnly=true）额外放行；
   * 写类工具命中这里仍拒绝。来源：Skill 目录 + fs-watch 监听目录。
   */
  readOnlyRoots?: string[];
  blocklistPaths: string[];           // glob，由 kairos/guard/blocklist-check.ts 解析
  toolsDenied: string[];
}
