/**
 * ToolScheduler — 工具权限调度
 *
 * 职责：权限检查 → 审核等待 → 执行 → 结果渲染与截断。
 *
 * `ask` 权限通过 ApprovalGate 异步等待用户决策。
 * 无 gate 时退回 cancelled（兼容测试和无审核环境）。
 */

import { resolve } from "node:path";
import type {
  InternalTool,
  PermissionResult,
  ToolResult,
  ToolRiskLevel,
} from "../internal-tools";
import { extractPathsFromArgs } from "../kairos/guard/extract-paths";
import { createBlocklistMatcher } from "../kairos/guard/blocklist-check";
import { guardWorkspacePath } from "./workspace-guard";
import { processToolOutput } from "./output-truncator";
import type { Summarizer } from "../context/compression/summarizer";

export type ToolCallStatus =
  | "validating"
  | "awaiting_approval"
  | "scheduled"
  | "executing"
  | "success"
  | "error"
  | "cancelled";

export interface ToolApprovalRequest {
  id: string;
  toolCallId?: string;
  toolName: string;
  args: Record<string, unknown>;
  summary: string;
  reason: string;
  riskLevel?: ToolRiskLevel;
  approvalScope?: "browser_session";
  sessionId?: string;
  turnId?: string;
  createdAt: number;
}

export type ToolApprovalDecisionKind = "approve_once" | "deny" | "allow_similar" | "timeout" | "abort";

export interface ToolApprovalDecision {
  requestId: string;
  decision: ToolApprovalDecisionKind;
  decidedAt: number;
}

export interface ToolCallRecord {
  id: string;
  toolName: string;
  status: ToolCallStatus;
  args: Record<string, unknown>;
  startedAt: number;
  endedAt?: number;
  permission?: PermissionResult;
  approvalRequest?: ToolApprovalRequest;
  approvalDecision?: ToolApprovalDecision;
  result?: ToolResult;
  error?: string;
}

/**
 * ApprovalGate — scheduler 与外部审核系统的桥接口。
 *
 * scheduler 调用 waitForDecision 后会 await 返回的 Promise，
 * 直到外部（PendingApprovalRegistry）通过 resolve 注入用户决策。
 *
 * onApprovalRequired 在 Promise 创建后立即调用，
 * 用于 emit 事件通知前端显示审核面板。
 */
export interface ApprovalGate {
  waitForDecision(request: ToolApprovalRequest): Promise<ToolApprovalDecision>;
  onApprovalRequired?: (request: ToolApprovalRequest) => void;
}

export interface ToolSchedulerConfig {
  /** 通用工具（web/generic）摘要触发阈值（字符） */
  truncateThreshold: number;
  /** 读取类工具摘要触发阈值（字符），默认见 DEFAULT_COMPRESSION_CONFIG */
  readTruncateThreshold?: number;
  /** 非 bash 工具送 flash 前的头尾截断上限（字符） */
  absoluteMaxChars?: number;
  /** flash 摘要器；缺省时非 bash 工具退化为确定性头尾截断 */
  summarizer?: Summarizer;
  approvalGate?: ApprovalGate;
  approvalContext?: { sessionId?: string; turnId?: string };
  now?: () => number;
  createId?: () => string;
}

export interface ToolSchedulerExecution {
  result: ToolResult;
  record: ToolCallRecord;
}

export class ToolScheduler {
  private truncateThreshold: number;
  private readTruncateThreshold?: number;
  private absoluteMaxChars?: number;
  private summarizer?: Summarizer;
  private approvalGate?: ApprovalGate;
  private approvalContext?: { sessionId?: string; turnId?: string };
  private now: () => number;
  private createId: () => string;

  constructor(config: ToolSchedulerConfig) {
    this.truncateThreshold = config.truncateThreshold;
    this.readTruncateThreshold = config.readTruncateThreshold;
    this.absoluteMaxChars = config.absoluteMaxChars;
    this.summarizer = config.summarizer;
    this.approvalGate = config.approvalGate;
    this.approvalContext = config.approvalContext;
    this.now = config.now ?? Date.now;
    this.createId = config.createId ?? createDefaultId;
  }

  async execute(
    tool: InternalTool | undefined,
    toolName: string,
    args: Record<string, unknown>,
    toolCallId?: string,
    options?: SchedulerExecuteOptions,
  ): Promise<ToolSchedulerExecution> {
    const startedAt = this.now();
    const record: ToolCallRecord = {
      id: this.createId(),
      toolName,
      status: "validating",
      args,
      startedAt,
    };

    if (!tool) {
      const result = {
        success: false,
        error: `Tool not found: ${toolName}`,
      };
      return this.finish(record, "error", result);
    }

    if (options?.signal?.aborted) {
      return this.finish(record, "cancelled", {
        success: false,
        error: `Turn stopped before tool execution: ${toolName}`,
      });
    }

    // 仅 Kairos 调用路径走"白名单 + blocklist"额外校验；主 Agent 默认零开销。
    if (options?.callerAgent === "kairos") {
      const guardResult = checkKairosGuard(tool, args, options.kairosGuard);
      if (!guardResult.ok) {
        return this.finish(record, "cancelled", { success: false, error: guardResult.reason });
      }
    }

    try {
      const permission = await this.checkPermission(tool, args);
      record.permission = permission;

      if (options?.signal?.aborted) {
        return this.finish(record, "cancelled", {
          success: false,
          error: `Turn stopped before tool execution: ${toolName}`,
        });
      }

      if (permission.decision === "deny") {
        const result = {
          success: false,
          error: permission.reason ?? `Permission denied for tool: ${toolName}`,
        };
        return this.finish(record, "cancelled", result);
      }

      if (permission.decision === "ask") {
        return await this.handleAskDecision(tool, toolName, args, permission, record, toolCallId, options);
      }

      return await this.runHandler(tool, permission.sanitizedArgs ?? args, record, options);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const result = {
        success: false,
        error: `Tool execution failed: ${message}`,
      };
      return this.finish(record, "error", result);
    }
  }

  private async handleAskDecision(
    tool: InternalTool,
    toolName: string,
    args: Record<string, unknown>,
    permission: PermissionResult,
    record: ToolCallRecord,
    toolCallId?: string,
    options?: SchedulerExecuteOptions,
  ): Promise<ToolSchedulerExecution> {
    const approvalRequest = this.createApprovalRequest(tool, args, permission, toolCallId);
    record.status = "awaiting_approval";
    record.approvalRequest = approvalRequest;

    if (!this.approvalGate) {
      const result = {
        success: false,
        error: permission.reason ?? `Tool requires approval: ${toolName}`,
        data: { status: "awaiting_approval" as const, approvalRequest },
      };
      return this.finish(record, "cancelled", result);
    }

    const decisionPromise = this.approvalGate.waitForDecision(approvalRequest);
    this.approvalGate.onApprovalRequired?.(approvalRequest);

    const decision = await decisionPromise;
    record.approvalDecision = decision;

    if (decision.decision === "abort" || options?.signal?.aborted) {
      return this.finish(record, "cancelled", {
        success: false,
        error: requestDenialMessage(approvalRequest, "abort"),
      });
    }

    if (decision.decision === "allow_similar" && permission.allowSimilar === false) {
      return this.finish(record, "cancelled", {
        success: false,
        error: `Tool does not allow similar-operation approval: ${toolName}`,
      });
    }

    if (decision.decision === "approve_once" || decision.decision === "allow_similar") {
      return this.runHandler(tool, permission.sanitizedArgs ?? args, record, options);
    }

    const reason = decision.decision === "timeout"
      ? requestDenialMessage(approvalRequest, "timeout")
      : requestDenialMessage(approvalRequest, "deny");
    return this.finish(record, "cancelled", { success: false, error: reason });
  }

  private async runHandler(
    tool: InternalTool,
    executionArgs: Record<string, unknown>,
    record: ToolCallRecord,
    options?: SchedulerExecuteOptions,
  ): Promise<ToolSchedulerExecution> {
    if (options?.signal?.aborted) {
      return this.finish(record, "cancelled", {
        success: false,
        error: `Turn stopped before tool execution: ${tool.name}`,
      });
    }
    record.args = executionArgs;
    record.status = "scheduled";
    record.status = "executing";
    const result = await tool.handler(executionArgs, options);
    const processed = await this.postProcess(tool, result);
    return this.finish(record, result.success ? "success" : "error", processed);
  }

  private async checkPermission(
    tool: InternalTool,
    args: Record<string, unknown>,
  ): Promise<PermissionResult> {
    if (!tool.checkPermissions) {
      return { decision: "allow" };
    }

    return tool.checkPermissions(args);
  }

  private createApprovalRequest(
    tool: InternalTool,
    args: Record<string, unknown>,
    permission: PermissionResult,
    toolCallId?: string,
  ): ToolApprovalRequest {
    return {
      id: this.createId(),
      toolCallId,
      toolName: tool.name,
      args: permission.sanitizedArgs ?? args,
      summary: permission.summary ?? `Run ${tool.name}`,
      reason: permission.reason ?? `Tool requires approval: ${tool.name}`,
      riskLevel: permission.riskLevel,
      approvalScope: permission.approvalScope,
      sessionId: this.approvalContext?.sessionId,
      turnId: this.approvalContext?.turnId,
      createdAt: this.now(),
    };
  }

  private async postProcess(tool: InternalTool, result: ToolResult): Promise<ToolResult> {
    let rendered: string | undefined;
    if (tool.renderResult && result.data !== undefined) {
      rendered = tool.renderResult(result);
    }

    // renderResult 会用回填文本覆盖 data；原始结构化结果保留在 structured，
    // 供 bridge 提取 preview 元数据（bash 的 backgrounded taskId、edit/write 的
    // diff/additions/deletions 等），不受后续摘要/截断影响。
    if (!result.success) {
      return rendered !== undefined ? { ...result, data: rendered, structured: result.data } : result;
    }

    const rawData = rendered ?? (typeof result.data === "string" ? result.data : JSON.stringify(result.data));

    // bash 自处理输出（run-process 流式落盘 + executor 头部截断），不走通用摘要/截断。
    // agent 的输出是 SubAgent 给主 Agent 的结构化报告 + transcriptRef，也不能再被普通工具压缩误伤。
    if (tool.previewKind === "bash" || tool.previewKind === "agent") {
      return rendered !== undefined ? { ...result, data: rendered, structured: result.data } : result;
    }

    if (result.preserveModelOutput) {
      return {
        ...result,
        ...(rendered !== undefined ? { data: rendered, structured: result.data } : {}),
        outputRef: result.outputRef ?? { kind: "inline", value: rawData },
      };
    }

    if (!rawData) {
      return rendered !== undefined ? { ...result, data: rendered, structured: result.data } : result;
    }

    const processed = await processToolOutput(tool.previewKind, rawData, {
      toolTruncateThreshold: this.truncateThreshold,
      readTruncateThreshold: this.readTruncateThreshold,
      absoluteMaxChars: this.absoluteMaxChars,
      summarizer: this.summarizer,
    });

    return {
      ...result,
      data: processed.modelOutput,
      ...(rendered !== undefined ? { structured: result.data } : {}),
      outputRef: result.outputRef ?? processed.rawOutputRef,
    };
  }

  private finish(
    record: ToolCallRecord,
    status: ToolCallStatus,
    result: ToolResult,
  ): ToolSchedulerExecution {
    record.status = status;
    record.result = result;
    record.endedAt = this.now();
    if (!result.success) {
      record.error = result.error;
    }

    return { record, result };
  }
}

function requestDenialMessage(
  request: ToolApprovalRequest,
  decision: "deny" | "timeout" | "abort",
): string {
  if (request.approvalScope === "browser_session") {
    const cause = decision === "abort"
      ? "当前 Turn 已停止，浏览器授权已取消"
      : decision === "timeout" ? "浏览器授权请求已超时" : "用户拒绝了本轮浏览器授权";
    return `${cause}。当前 Turn 不得再次调用任何 browser_* 工具；下一次用户输入可以重新申请授权。`;
  }
  if (decision === "abort") {
    return `Turn stopped while waiting for approval: ${request.toolName}`;
  }
  return decision === "timeout"
    ? `Approval timed out for tool: ${request.toolName}`
    : `User denied tool: ${request.toolName}`;
}

function createDefaultId(): string {
  return `tool_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// ─── Kairos guard 集成 ──────────────────────────────────────────────────

export interface SchedulerExecuteOptions {
  callerAgent?: "main" | "kairos";
  kairosGuard?: KairosSchedulerGuard;
  toolCallId?: string;
  signal?: AbortSignal;
  subagentEventSink?: import("./tools/agent/runner").SubAgentEventSink;
}

/** scheduler 视角的 Kairos guard（不耦合 ToolManager 命名空间）。 */
export interface KairosSchedulerGuard {
  /** 可读**可写**的根路径。 */
  allowedRoots: string[];
  /** 只读授权的根路径；仅 isReadOnly=true 的工具放行。 */
  readOnlyRoots?: string[];
  blocklistPaths: string[];
  toolsDenied: string[];
}

interface KairosGuardCheckResult {
  ok: boolean;
  reason?: string;
}

function checkKairosGuard(
  tool: InternalTool,
  args: Record<string, unknown>,
  guard: KairosSchedulerGuard | undefined,
): KairosGuardCheckResult {
  if (!guard) {
    return { ok: false, reason: "Kairos guard missing; refusing tool call." };
  }

  if (guard.toolsDenied.includes(tool.name)) {
    return { ok: false, reason: `Tool ${tool.name} is denied for Kairos by blocklist.` };
  }

  // 优先用 tool 自带 extractPaths；fallback 到通用提取器。
  const extracted = tool.extractPaths
    ? tool.extractPaths(args)
    : extractPathsFromArgs(args);

  // 无任何已声明路径 → 默认放行（如 web_search / analyze-media 这类无路径工具）。
  // 注意：如果某个工具实际操作文件却没声明 extractPaths 且 args 也没有可识别字段，
  // 那就是工具定义不完整的 bug；blocklist + toolsDenied 是双保险。
  if (extracted.length === 0) return { ok: true };

  const matchBlocklist = createBlocklistMatcher(guard.blocklistPaths);

  // 读写授权分离：只读工具（isReadOnly=true）可访问 allowedRoots ∪ readOnlyRoots；
  // 写类工具只放行 allowedRoots——readOnlyRoots（Skill 目录 / fs-watch 监听目录）
  // 对写操作是硬拒绝，"写入范围 = paths.json"由此成为代码强制而非软约定。
  const readable = tool.isReadOnly === true
    ? [...guard.allowedRoots, ...(guard.readOnlyRoots ?? [])]
    : guard.allowedRoots;

  for (const raw of extracted) {
    // 1. 路径必须落在某个授权根之下
    const inAnyRoot = readable.some((root) => guardWorkspacePath(raw, root).ok);
    if (!inAnyRoot) {
      const scope = tool.isReadOnly === true ? "readable roots" : "writable roots (allowedRoots)";
      return { ok: false, reason: `Path ${raw} is not within any Kairos ${scope}.` };
    }
    // 2. 命中 blocklist glob 即拒绝
    const absolute = resolve(raw);
    if (matchBlocklist(raw) || matchBlocklist(absolute)) {
      return { ok: false, reason: `Path ${raw} matches Kairos blocklist.` };
    }
  }

  return { ok: true };
}
