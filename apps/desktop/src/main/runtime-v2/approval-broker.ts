import type { ApprovalBroker, ApprovalDecision, ApprovalRequest } from "@actspace/tools-approval";
import type { DesktopRuntimeV2ApprovalPort } from "./host-ports";

export class DesktopApprovalBroker implements ApprovalBroker {
  constructor(private readonly approvals: DesktopRuntimeV2ApprovalPort) {}

  async requestApproval(request: ApprovalRequest, signal: AbortSignal): Promise<ApprovalDecision> {
    if (signal.aborted) return denied(request.requestId, "Approval was aborted.");
    const legacyRequest = {
      id: request.requestId,
      toolCallId: request.callId,
      toolName: request.name,
      args: { ...request.argumentSummary },
      summary: request.reason,
      reason: request.reason,
      riskLevel: request.risk,
      sessionId: request.sessionId,
      agentRunId: request.agentRunId,
      createdAt: Date.now(),
    } as const;
    const decisionPromise = this.approvals.waitForDecision(legacyRequest);
    this.approvals.onApprovalRequired(legacyRequest);
    let rejectAbort!: (reason?: unknown) => void;
    const onAbort = () => {
      this.approvals.abortAgentRun?.(request.sessionId, request.agentRunId);
      rejectAbort(signal.reason ?? new Error("Approval was aborted."));
    };
    const abortPromise = new Promise<never>((_, reject) => {
      rejectAbort = reject;
      signal.addEventListener("abort", onAbort, { once: true });
    });
    if (signal.aborted) onAbort();
    try {
      const decision = await Promise.race([decisionPromise, abortPromise]);
      return Object.freeze({
        requestId: request.requestId,
        decision: decision.decision === "approve_once" || decision.decision === "allow_similar" ? "allow" : "deny",
        decidedAt: new Date(decision.decidedAt).toISOString(),
        ...(decision.decision === "approve_once" || decision.decision === "allow_similar" ? {} : { reason: decision.decision }),
      });
    } catch {
      return denied(request.requestId, "Approval was aborted.");
    } finally {
      signal.removeEventListener("abort", onAbort);
    }
  }
}

function denied(requestId: string, reason: string): ApprovalDecision {
  return Object.freeze({ requestId, decision: "deny", decidedAt: new Date().toISOString(), reason });
}
