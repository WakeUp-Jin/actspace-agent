/**
 * 工具调度器示例
 * 管理工具从 validating → executing → success/error 的完整生命周期。
 */

import { InternalTool, ToolResult, PermissionResult } from './tool-definition';

type ToolCallStatus =
  | 'validating'
  | 'awaiting_approval'
  | 'scheduled'
  | 'executing'
  | 'success'
  | 'error'
  | 'cancelled';

interface ToolCallRecord {
  callId: string;
  toolName: string;
  status: ToolCallStatus;
  args: Record<string, unknown>;
  result?: unknown;
  error?: string;
  startTime: number;
  durationMs?: number;
}

export interface ToolExecuteResult {
  success: boolean;
  resultString: string;
  error?: string;
}

type ApprovalMode = 'default' | 'yolo';
type SummarizeFn = (text: string) => Promise<string>;

export class ToolScheduler {
  private tools: Map<string, InternalTool>;
  private approvalMode: ApprovalMode;
  private summarize: SummarizeFn;
  private maxOutputChars: number;

  constructor(options: {
    tools: Map<string, InternalTool>;
    approvalMode?: ApprovalMode;
    summarize: SummarizeFn;
    maxOutputChars?: number;
  }) {
    this.tools = options.tools;
    this.approvalMode = options.approvalMode ?? 'yolo';
    this.summarize = options.summarize;
    this.maxOutputChars = options.maxOutputChars ?? 2000;
  }

  registerTool(tool: InternalTool): void {
    this.tools.set(tool.name, tool);
  }

  async execute(callId: string, toolName: string, args: Record<string, unknown>): Promise<ToolExecuteResult> {
    const record: ToolCallRecord = {
      callId,
      toolName,
      status: 'validating',
      args,
      startTime: Date.now(),
    };

    // 1. 查找工具
    const tool = this.tools.get(toolName);
    if (!tool) {
      return { success: false, resultString: '', error: `Unknown tool: ${toolName}` };
    }

    // 2. 权限验证
    if (tool.checkPermissions) {
      const permResult = await tool.checkPermissions(args);
      if (!permResult.passed) {
        record.status = 'error';
        record.error = permResult.error ?? 'Permission denied';
        return { success: false, resultString: '', error: record.error };
      }
      if (permResult.sanitizedArgs) {
        args = permResult.sanitizedArgs;
      }
    }

    // 3. 审批检查
    if (this.approvalMode === 'default' && !tool.isReadOnly) {
      record.status = 'awaiting_approval';
      // 实际实现中等待用户确认
    }

    // 4. 执行
    record.status = 'executing';
    let toolResult: ToolResult;
    try {
      toolResult = await tool.handler(args);
    } catch (err) {
      record.status = 'error';
      const errMsg = err instanceof Error ? err.message : String(err);
      return { success: false, resultString: '', error: errMsg };
    }

    record.durationMs = Date.now() - record.startTime;

    // 5. 格式化结果
    let resultString: string;
    if (tool.renderResult) {
      resultString = tool.renderResult(toolResult);
    } else {
      resultString = toolResult.success
        ? JSON.stringify(toolResult.data)
        : `Error: ${toolResult.error}`;
    }

    // 6. 输出裁剪
    if (resultString.length > this.maxOutputChars) {
      resultString = await this.summarize(resultString);
    }

    record.status = toolResult.success ? 'success' : 'error';
    record.result = toolResult.data;

    return {
      success: toolResult.success,
      resultString,
      error: toolResult.error ?? undefined,
    };
  }

  async executeBatch(
    calls: Array<{ callId: string; toolName: string; args: Record<string, unknown> }>,
    mode: 'sequential' | 'parallel' = 'sequential',
  ): Promise<Array<{ callId: string; toolName: string; result: ToolExecuteResult }>> {
    if (mode === 'parallel') {
      return Promise.all(
        calls.map(async (c) => ({
          callId: c.callId,
          toolName: c.toolName,
          result: await this.execute(c.callId, c.toolName, c.args),
        })),
      );
    }

    const results: Array<{ callId: string; toolName: string; result: ToolExecuteResult }> = [];
    for (const c of calls) {
      results.push({
        callId: c.callId,
        toolName: c.toolName,
        result: await this.execute(c.callId, c.toolName, c.args),
      });
    }
    return results;
  }
}
