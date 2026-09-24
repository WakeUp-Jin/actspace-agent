import type { ApprovalBroker, ApprovalDecision, ApprovalRequest } from "@actspace/tools-approval";
import type { TerminalLineInput } from "../terminal-input";

export class CliV2ApprovalBroker implements ApprovalBroker {
  approvalRequired: ApprovalRequest | undefined;
  constructor(private readonly input?: TerminalLineInput, private readonly write: (text: string) => void = () => undefined) {}

  async requestApproval(request: ApprovalRequest, signal: AbortSignal): Promise<ApprovalDecision> {
    if (this.input === undefined) { this.approvalRequired = request; return denied(request, "broker-unavailable"); }
    this.write(`\nApproval required\nTool: ${request.toolName}\n${request.reasons.map((reason) => `Reason: ${reason.message}\nRisk: ${reason.risk}`).join("\n")}\n`);
    while (!signal.aborted) {
      const answer = await this.input.readLine("Approve? [y] once / [n] deny: ");
      if (answer === null) return denied(request, "user-denied");
      if (["y", "yes"].includes(answer.trim().toLowerCase())) return Object.freeze({ requestId: request.requestId, kind: "once", decidedAt: new Date().toISOString() });
      if (["n", "no"].includes(answer.trim().toLowerCase())) return denied(request, "user-denied");
      this.write("Please enter y or n.\n");
    }
    return denied(request, "aborted");
  }
}

function denied(request: ApprovalRequest, code: Extract<ApprovalDecision, { kind: "deny" }>["code"]): ApprovalDecision { return Object.freeze({ requestId: request.requestId, kind: "deny", code, decidedAt: new Date().toISOString() }); }
