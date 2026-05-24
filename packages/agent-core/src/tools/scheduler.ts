/**
 * ToolScheduler — 工具权限调度地基
 *
 * 首版只负责 agent-core 内部的权限检查、执行、结果渲染与截断。
 * `ask` 会产出结构化待审核结果，但暂不接 Electron 审核恢复流程。
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

export type ToolApprovalDecisionKind = "approve_once" | "deny" | "allow_similar";

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
  result?: ToolResult;
  error?: string;
}

export interface ToolSchedulerConfig {
  truncateThreshold: number;
  now?: () => number;
  createId?: () => string;
}

export interface ToolSchedulerExecution {
  result: ToolResult;
  record: ToolCallRecord;
}

export class ToolScheduler {
  private truncateThreshold: number;
  private now: () => number;
  private createId: () => string;

  constructor(config: ToolSchedulerConfig) {
    this.truncateThreshold = config.truncateThreshold;
    this.now = config.now ?? Date.now;
    this.createId = config.createId ?? createDefaultId;
  }

  async execute(
    tool: InternalTool | undefined,
    toolName: string,
    args: Record<string, unknown>,
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
        const approvalRequest = this.createApprovalRequest(tool, args, permission);
        record.status = "awaiting_approval";
        record.approvalRequest = approvalRequest;

        const result = {
          success: false,
          error: permission.reason ?? `Tool requires approval: ${toolName}`,
          data: {
            status: "awaiting_approval",
            approvalRequest,
          },
        };
        return this.finish(record, "cancelled", result);
      }

      const executionArgs = permission.sanitizedArgs ?? args;
      record.args = executionArgs;
      record.status = "scheduled";
      record.status = "executing";

      const result = await tool.handler(executionArgs);
      return this.finish(record, result.success ? "success" : "error", this.postProcess(tool, result));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const result = {
        success: false,
        error: `Tool execution failed: ${message}`,
      };
      return this.finish(record, "error", result);
    }
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
  ): ToolApprovalRequest {
    return {
      id: this.createId(),
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
