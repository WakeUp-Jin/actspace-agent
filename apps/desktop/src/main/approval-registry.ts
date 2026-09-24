/**
 * PendingApprovalRegistry — 审核暂停恢复的核心状态管理。
 *
 * 活在 Electron main 进程内存中。
 * 每个待审核工具调用注册一条 entry，存着 Promise 的 resolve 函数。
 * 用户决策通过 IPC 到达后，调用 resolve 恢复 Tool Runtime 的 await。
 *
 * 同时实现 Runtime v2 的 Desktop approval port，由 ApprovalBroker 适配给 Tool Runtime。
 */

import type { DesktopRuntimeV2ApprovalDecision, DesktopRuntimeV2ApprovalPort, DesktopRuntimeV2ApprovalRequest } from "./runtime-v2/host-ports";

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

interface PendingEntry {
  resolve: (decision: DesktopRuntimeV2ApprovalDecision) => void;
  request: DesktopRuntimeV2ApprovalRequest;
  sessionId: string;
  agentRunId: string;
  expiresAt: number;
  timer: ReturnType<typeof setTimeout>;
}

export interface ApprovalRegistryConfig {
  timeoutMs?: number;
  onApprovalRequired?: (request: DesktopRuntimeV2ApprovalRequest, sessionId: string, agentRunId: string) => void;
  onApprovalResolved?: (
    request: DesktopRuntimeV2ApprovalRequest,
    decision: DesktopRuntimeV2ApprovalDecision,
    sessionId: string,
    agentRunId: string,
  ) => void;
}

export class PendingApprovalRegistry implements DesktopRuntimeV2ApprovalPort {
  private pending = new Map<string, PendingEntry>();
  private timeoutMs: number;
  private sessionId = "";
  private agentRunId = "";
  private externalOnApprovalRequired?: (request: DesktopRuntimeV2ApprovalRequest, sessionId: string, agentRunId: string) => void;
  private externalOnApprovalResolved?: (
    request: DesktopRuntimeV2ApprovalRequest,
    decision: DesktopRuntimeV2ApprovalDecision,
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

  // Runtime v2 Desktop approval port

  waitForDecision(request: DesktopRuntimeV2ApprovalRequest): Promise<DesktopRuntimeV2ApprovalDecision> {
    const sessionId = request.sessionId ?? this.sessionId;
    const agentRunId = request.agentRunId ?? this.agentRunId;

    return new Promise<DesktopRuntimeV2ApprovalDecision>((resolve) => {
      const expiresAt = Date.now() + this.timeoutMs;

      const timer = setTimeout(() => {
        this.pending.delete(request.id);
        const decision: DesktopRuntimeV2ApprovalDecision = {
          requestId: request.id,
          decision: "timeout",
          decidedAt: Date.now(),
        };
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

  onApprovalRequired(request: DesktopRuntimeV2ApprovalRequest): void {
    const entry = this.pending.get(request.id);
    if (!entry) return;
    this.externalOnApprovalRequired?.(request, entry.sessionId, entry.agentRunId);
  }

  // ─── IPC 消费的公共方法 ───

  decide(requestId: string, decision: DesktopRuntimeV2ApprovalDecision["decision"], suggestionId?: string): { ok: true } | { ok: false; reason: string } {
    const entry = this.pending.get(requestId);

    if (!entry) {
      return { ok: false, reason: "not_found_or_already_resolved" };
    }

    if (decision === "session" && (suggestionId === undefined || !entry.request.grantSuggestions?.some((suggestion) => suggestion.suggestionId === suggestionId))) {
      return { ok: false, reason: "invalid_grant_suggestion" };
    }
    this.resolveEntry(requestId, entry, decision, suggestionId);

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

  listPending(sessionId?: string): Array<DesktopRuntimeV2ApprovalRequest & { readonly expiresAt: number }> {
    const result: Array<DesktopRuntimeV2ApprovalRequest & { readonly expiresAt: number }> = [];
    for (const entry of this.pending.values()) {
      if (sessionId && entry.sessionId !== sessionId) continue;
      result.push({
        ...entry.request,
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

  private resolveEntry(
    requestId: string,
    entry: PendingEntry,
    decision: DesktopRuntimeV2ApprovalDecision["decision"],
    suggestionId?: string,
  ): void {
    clearTimeout(entry.timer);
    this.pending.delete(requestId);
    const resolvedDecision: DesktopRuntimeV2ApprovalDecision = {
      requestId,
      decision,
      decidedAt: Date.now(),
      ...(suggestionId === undefined ? {} : { suggestionId }),
    };
    entry.resolve(resolvedDecision);
    this.externalOnApprovalResolved?.(
      entry.request,
      resolvedDecision,
      entry.sessionId,
      entry.agentRunId,
    );
  }
}
