/**
 * PendingApprovalRegistry — 审核暂停恢复的核心状态管理。
 *
 * 活在 Electron main 进程内存中。
 * 每个待审核工具调用注册一条 entry，存着 Promise 的 resolve 函数。
 * 用户决策通过 IPC 到达后，调用 resolve 恢复 ToolScheduler 的 await。
 *
 * 同时实现 ApprovalGate 接口，可直接传给 ToolScheduler。
 */

import type {
  ApprovalGate,
  ToolApprovalRequest,
  ToolApprovalDecision,
  ToolApprovalDecisionKind,
} from "@actspace/agent-core";
import type { PendingApprovalInfo, ApprovalDecideResult } from "@actspace/shared";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

interface PendingEntry {
  resolve: (decision: ToolApprovalDecision) => void;
  request: ToolApprovalRequest;
  sessionId: string;
  turnId: string;
  expiresAt: number;
  timer: ReturnType<typeof setTimeout>;
}

export interface ApprovalRegistryConfig {
  timeoutMs?: number;
  onApprovalRequired?: (request: ToolApprovalRequest, sessionId: string, turnId: string) => void;
  onApprovalResolved?: (
    request: ToolApprovalRequest,
    decision: ToolApprovalDecision,
    sessionId: string,
    turnId: string,
  ) => void;
}

export class PendingApprovalRegistry implements ApprovalGate {
  private pending = new Map<string, PendingEntry>();
  private timeoutMs: number;
  private sessionId = "";
  private turnId = "";
  private externalOnApprovalRequired?: (request: ToolApprovalRequest, sessionId: string, turnId: string) => void;
  private externalOnApprovalResolved?: (
    request: ToolApprovalRequest,
    decision: ToolApprovalDecision,
    sessionId: string,
    turnId: string,
  ) => void;

  constructor(config?: ApprovalRegistryConfig) {
    this.timeoutMs = config?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.externalOnApprovalRequired = config?.onApprovalRequired;
    this.externalOnApprovalResolved = config?.onApprovalResolved;
  }

  setCurrentTurn(sessionId: string, turnId: string): void {
    this.sessionId = sessionId;
    this.turnId = turnId;
  }

  // ─── ApprovalGate 接口实现 ───

  waitForDecision(request: ToolApprovalRequest): Promise<ToolApprovalDecision> {
    return new Promise<ToolApprovalDecision>((resolve) => {
      const expiresAt = Date.now() + this.timeoutMs;
      const sessionId = this.sessionId;
      const turnId = this.turnId;

      const timer = setTimeout(() => {
        this.pending.delete(request.id);
        const decision: ToolApprovalDecision = {
          requestId: request.id,
          decision: "timeout",
          decidedAt: Date.now(),
        };
        resolve(decision);
        this.externalOnApprovalResolved?.(request, decision, sessionId, turnId);
      }, this.timeoutMs);

      this.pending.set(request.id, {
        resolve,
        request,
        sessionId,
        turnId,
        expiresAt,
        timer,
      });
    });
  }

  onApprovalRequired(request: ToolApprovalRequest): void {
    this.externalOnApprovalRequired?.(request, this.sessionId, this.turnId);
  }

  // ─── IPC 消费的公共方法 ───

  decide(requestId: string, decision: ToolApprovalDecisionKind): ApprovalDecideResult {
    const entry = this.pending.get(requestId);

    if (!entry) {
      return { ok: false, reason: "not_found_or_already_resolved" };
    }

    if (entry.request.toolName === "delete_file" && decision === "allow_similar") {
      return { ok: false, reason: "delete_file_only_allows_approve_once_or_deny" };
    }

    clearTimeout(entry.timer);
    this.pending.delete(requestId);

    const resolvedDecision: ToolApprovalDecision = {
      requestId,
      decision,
      decidedAt: Date.now(),
    };

    entry.resolve(resolvedDecision);
    this.externalOnApprovalResolved?.(
      entry.request,
      resolvedDecision,
      entry.sessionId,
      entry.turnId,
    );

    return { ok: true };
  }

  listPending(sessionId?: string): PendingApprovalInfo[] {
    const result: PendingApprovalInfo[] = [];
    for (const entry of this.pending.values()) {
      if (sessionId && entry.sessionId !== sessionId) continue;
      result.push({
        requestId: entry.request.id,
        toolName: entry.request.toolName,
        summary: entry.request.summary,
        reason: entry.request.reason,
        riskLevel: entry.request.riskLevel,
        command: typeof entry.request.args.command === "string" ? entry.request.args.command : undefined,
        createdAt: entry.request.createdAt,
        expiresAt: entry.expiresAt,
      });
    }
    return result;
  }

  expireAll(sessionId?: string): number {
    let count = 0;
    for (const [id, entry] of this.pending) {
      if (sessionId && entry.sessionId !== sessionId) continue;
      clearTimeout(entry.timer);
      this.pending.delete(id);
      const decision: ToolApprovalDecision = {
        requestId: id,
        decision: "timeout",
        decidedAt: Date.now(),
      };
      entry.resolve(decision);
      this.externalOnApprovalResolved?.(entry.request, decision, entry.sessionId, entry.turnId);
      count++;
    }
    return count;
  }

  get size(): number {
    return this.pending.size;
  }
}
