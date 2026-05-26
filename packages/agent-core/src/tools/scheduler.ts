/**
 * ToolScheduler — 工具权限调度
 *
 * 职责：权限检查 → 审核等待 → 执行 → 结果渲染与截断。
 *
 * `ask` 权限通过 ApprovalGate 异步等待用户决策。
 * 无 gate 时退回 cancelled（兼容测试和无审核环境）。
 */

import type {
  InternalTool,
  PermissionResult,
  ToolResult,
  ToolRiskLevel,
} from "../internal-tools";

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
  createdAt: number;
}

export type ToolApprovalDecisionKind = "approve_once" | "deny" | "allow_similar" | "timeout";

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
  truncateThreshold: number;
  approvalGate?: ApprovalGate;
  now?: () => number;
  createId?: () => string;
}

export interface ToolSchedulerExecution {
  result: ToolResult;
  record: ToolCallRecord;
}

export class ToolScheduler {
  private truncateThreshold: number;
  private approvalGate?: ApprovalGate;
  private now: () => number;
  private createId: () => string;

  constructor(config: ToolSchedulerConfig) {
    this.truncateThreshold = config.truncateThreshold;
    this.approvalGate = config.approvalGate;
    this.now = config.now ?? Date.now;
    this.createId = config.createId ?? createDefaultId;
  }

  async execute(
    tool: InternalTool | undefined,
    toolName: string,
    args: Record<string, unknown>,
    toolCallId?: string,
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

    try {
      const permission = await this.checkPermission(tool, args);
      record.permission = permission;

      if (permission.decision === "deny") {
        const result = {
          success: false,
          error: permission.reason ?? `Permission denied for tool: ${toolName}`,
        };
        return this.finish(record, "cancelled", result);
      }

      if (permission.decision === "ask") {
        return await this.handleAskDecision(tool, toolName, args, permission, record, toolCallId);
      }

      return await this.runHandler(tool, permission.sanitizedArgs ?? args, record);
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

    this.approvalGate.onApprovalRequired?.(approvalRequest);

    const decision = await this.approvalGate.waitForDecision(approvalRequest);
    record.approvalDecision = decision;

    if (decision.decision === "approve_once" || decision.decision === "allow_similar") {
      return this.runHandler(tool, permission.sanitizedArgs ?? args, record);
    }

    const reason = decision.decision === "timeout"
      ? `Approval timed out for tool: ${toolName}`
      : `User denied tool: ${toolName}`;
    return this.finish(record, "cancelled", { success: false, error: reason });
  }

  private async runHandler(
    tool: InternalTool,
    executionArgs: Record<string, unknown>,
    record: ToolCallRecord,
  ): Promise<ToolSchedulerExecution> {
    record.args = executionArgs;
    record.status = "scheduled";
    record.status = "executing";
    const result = await tool.handler(executionArgs);
    return this.finish(record, result.success ? "success" : "error", this.postProcess(tool, result));
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
      createdAt: this.now(),
    };
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

    if (rendered !== undefined) {
      return {
        ...result,
        data: rendered,
      };
    }

    return result;
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

function createDefaultId(): string {
  return `tool_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
