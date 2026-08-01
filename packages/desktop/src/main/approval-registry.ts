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
  agentRunId: string;
  expiresAt: number;
  timer: ReturnType<typeof setTimeout>;
}

export interface ApprovalRegistryConfig {
  timeoutMs?: number;
  onApprovalRequired?: (request: ToolApprovalRequest, sessionId: string, agentRunId: string) => void;
  onApprovalResolved?: (
    request: ToolApprovalRequest,
    decision: ToolApprovalDecision,
    sessionId: string,
    agentRunId: string,
  ) => void;
}

export class PendingApprovalRegistry implements ApprovalGate {
  private pending = new Map<string, PendingEntry>();
  private browserAuthorizedSessions = new Set<string>();
  private browserDeniedAgentRuns = new Set<string>();
  private timeoutMs: number;
  private sessionId = "";
  private agentRunId = "";
  private externalOnApprovalRequired?: (request: ToolApprovalRequest, sessionId: string, agentRunId: string) => void;
  private externalOnApprovalResolved?: (
    request: ToolApprovalRequest,
    decision: ToolApprovalDecision,
    sessionId: string,
    agentRunId: string,
  ) => void;

  constructor(config?: ApprovalRegistryConfig) {
    this.timeoutMs = config?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.externalOnApprovalRequired = config?.onApprovalRequired;
    this.externalOnApprovalResolved = config?.onApprovalResolved;
  }

  setCurrentAgentRun(sessionId: string, agentRunId: string): void {
    this.sessionId = sessionId;
    this.agentRunId = agentRunId;
  }

  // ─── ApprovalGate 接口实现 ───

  waitForDecision(request: ToolApprovalRequest): Promise<ToolApprovalDecision> {
    const sessionId = request.sessionId ?? this.sessionId;
    const agentRunId = request.agentRunId ?? this.agentRunId;
    if (request.approvalScope === "browser_session") {
      if (this.browserAuthorizedSessions.has(sessionId)) {
        return Promise.resolve({
          requestId: request.id,
          decision: "approve_once",
          decidedAt: Date.now(),
        });
      }
      if (this.browserDeniedAgentRuns.has(browserAgentRunKey(sessionId, agentRunId))) {
        return Promise.resolve({
          requestId: request.id,
          decision: "deny",
          decidedAt: Date.now(),
        });
      }
    }

    return new Promise<ToolApprovalDecision>((resolve) => {
      const expiresAt = Date.now() + this.timeoutMs;

      const timer = setTimeout(() => {
        this.pending.delete(request.id);
        const decision: ToolApprovalDecision = {
          requestId: request.id,
          decision: "timeout",
          decidedAt: Date.now(),
        };
        this.rememberBrowserDecision(request, decision, sessionId, agentRunId);
        resolve(decision);
        this.externalOnApprovalResolved?.(request, decision, sessionId, agentRunId);
      }, this.timeoutMs);

      this.pending.set(request.id, {
        resolve,
        request,
        sessionId,
        agentRunId,
        expiresAt,
        timer,
      });
    });
  }

  onApprovalRequired(request: ToolApprovalRequest): void {
    const entry = this.pending.get(request.id);
    if (!entry) return;
    this.externalOnApprovalRequired?.(request, entry.sessionId, entry.agentRunId);
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

    this.resolveEntry(requestId, entry, decision);

    return { ok: true };
  }

  abortAgentRun(sessionId: string, agentRunId: string): number {
    let count = 0;
    for (const [id, entry] of this.pending) {
      if (entry.sessionId !== sessionId || entry.agentRunId !== agentRunId) continue;
      this.resolveEntry(id, entry, "abort");
      count++;
    }
    return count;
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
      this.resolveEntry(id, entry, "timeout");
      count++;
    }
    return count;
  }

  get size(): number {
    return this.pending.size;
  }

  isBrowserAuthorized(sessionId: string): boolean {
    return this.browserAuthorizedSessions.has(sessionId);
  }

  isBrowserDeniedForAgentRun(sessionId: string, agentRunId: string): boolean {
    return this.browserDeniedAgentRuns.has(browserAgentRunKey(sessionId, agentRunId));
  }

  private rememberBrowserDecision(
    request: ToolApprovalRequest,
    decision: ToolApprovalDecision,
    sessionId: string,
    agentRunId: string,
  ): void {
    if (request.approvalScope !== "browser_session") return;
    if (decision.decision === "abort") return;
    if (decision.decision === "approve_once" || decision.decision === "allow_similar") {
      this.browserAuthorizedSessions.add(sessionId);
      this.browserDeniedAgentRuns.delete(browserAgentRunKey(sessionId, agentRunId));
      return;
    }
    this.browserDeniedAgentRuns.add(browserAgentRunKey(sessionId, agentRunId));
  }

  private resolveEntry(
    requestId: string,
    entry: PendingEntry,
    decision: ToolApprovalDecisionKind,
  ): void {
    clearTimeout(entry.timer);
    this.pending.delete(requestId);
    const resolvedDecision: ToolApprovalDecision = {
      requestId,
      decision,
      decidedAt: Date.now(),
    };
    this.rememberBrowserDecision(entry.request, resolvedDecision, entry.sessionId, entry.agentRunId);
    entry.resolve(resolvedDecision);
    this.externalOnApprovalResolved?.(
      entry.request,
      resolvedDecision,
      entry.sessionId,
      entry.agentRunId,
    );
  }
}

function browserAgentRunKey(sessionId: string, agentRunId: string): string {
  return `${sessionId}\u0000${agentRunId}`;
}
