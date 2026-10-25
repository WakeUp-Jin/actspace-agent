import type { ApprovalBroker, ApprovalDecision, ApprovalRequest } from "@actspace/tools-approval";
import type { ApprovalResourceSummary } from "@actspace/shared/runtime-v2";
import type { DesktopRuntimeV2ApprovalPort, DesktopRuntimeV2ApprovalRequest } from "./host-ports";

export class DesktopApprovalBroker implements ApprovalBroker {
  constructor(private readonly approvals: DesktopRuntimeV2ApprovalPort) {}

  async requestApproval(request: ApprovalRequest, signal: AbortSignal): Promise<ApprovalDecision> {
    if (signal.aborted) return denied(request.requestId, "aborted");
    const primaryReason = request.reasons[0];
    const hostRequest = {
      id: request.requestId,
      toolCallId: request.callId,
      toolName: request.toolName,
      args: { resources: request.resources },
      summary: primaryReason?.message ?? "Approval required",
      reason: request.reasons.map((reason) => reason.message).join("\n"),
      riskLevel: highestRisk(request.reasons.map((reason) => reason.risk)),
      executionEnvironment: executionEnvironment(request.resources),
      sessionId: request.sessionId,
      agentRunId: request.agentRunId,
      createdAt: Date.parse(request.requestedAt),
      grantSuggestions: request.grantSuggestions,
      supportedLifetimes: request.supportedLifetimes,
    } as const;
    const decisionPromise = this.approvals.waitForDecision(hostRequest);
    this.approvals.onApprovalRequired(hostRequest);
    let rejectAbort!: (reason?: unknown) => void;
    const onAbort = () => {
      this.approvals.abortRequest?.(request.requestId);
      rejectAbort(signal.reason ?? new Error("Approval was aborted."));
    };
    const abortPromise = new Promise<never>((_, reject) => {
      rejectAbort = reject;
      signal.addEventListener("abort", onAbort, { once: true });
    });
    if (signal.aborted) onAbort();
    try {
      const decision = await Promise.race([decisionPromise, abortPromise]);
      const decidedAt = new Date(decision.decidedAt).toISOString();
      if (decision.decision === "once") return Object.freeze({ requestId: request.requestId, kind: "once", decidedAt });
      if (decision.decision === "session" && decision.suggestionId !== undefined) return Object.freeze({ requestId: request.requestId, kind: "session", suggestionId: decision.suggestionId, decidedAt });
      return Object.freeze({ requestId: request.requestId, kind: "deny", decidedAt, code: decision.decision === "timeout" ? "timeout" : decision.decision === "abort" ? "aborted" : "user-denied" });
    } catch {
      return denied(request.requestId, "aborted");
    } finally {
      signal.removeEventListener("abort", onAbort);
    }
  }
}

/** Where an approved process runs: the card shows "real environment" when Bash leaves the sandbox. */
export function executionEnvironment(resources: readonly ApprovalResourceSummary[]): DesktopRuntimeV2ApprovalRequest["executionEnvironment"] {
  const process = resources.find((resource) => resource.kind === "process");
  return process?.kind !== "process" || process.noSandbox === undefined ? undefined : process.noSandbox ? "real" : "sandbox";
}

function denied(requestId: string, code: Extract<ApprovalDecision, { kind: "deny" }>["code"]): ApprovalDecision {
  return Object.freeze({ requestId, kind: "deny", decidedAt: new Date().toISOString(), code });
}

function highestRisk(risks: readonly ("low" | "medium" | "high")[]): "low" | "medium" | "high" {
  return risks.includes("high") ? "high" : risks.includes("medium") ? "medium" : "low";
}
