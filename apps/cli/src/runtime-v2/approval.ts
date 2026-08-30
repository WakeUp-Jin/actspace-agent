import type { ApprovalBroker, ApprovalDecision, ApprovalRequest } from "@actspace/tools-approval";
import type { TerminalLineInput } from "../terminal-input";
import type { RuntimeV2PermissionMode } from "./types";

export class CliV2ApprovalBroker implements ApprovalBroker {
  approvalRequired: ApprovalRequest | undefined;
  constructor(private readonly mode: RuntimeV2PermissionMode, private readonly input?: TerminalLineInput, private readonly write: (text: string) => void = () => undefined) {}

  async requestApproval(request: ApprovalRequest, signal: AbortSignal): Promise<ApprovalDecision> {
    if (this.mode === "trusted" || this.mode === "yolo") return decision(request, "allow", "permission mode");
    if (this.input === undefined) { this.approvalRequired = request; return decision(request, "deny", "non-interactive host"); }
    this.write(`\nApproval required\nTool: ${request.name}\nReason: ${request.reason}\nRisk: ${request.risk}\n`);
    while (!signal.aborted) {
      const answer = await this.input.readLine("Approve? [y] once / [n] deny: ");
      if (answer === null) return decision(request, "deny", "input closed");
      if (["y", "yes"].includes(answer.trim().toLowerCase())) return decision(request, "allow", "user approved");
      if (["n", "no"].includes(answer.trim().toLowerCase())) return decision(request, "deny", "user denied");
      this.write("Please enter y or n.\n");
    }
    return decision(request, "deny", "run aborted");
  }
}

function decision(request: ApprovalRequest, value: ApprovalDecision["decision"], reason: string): ApprovalDecision { return Object.freeze({ requestId: request.requestId, decision: value, decidedAt: new Date().toISOString(), reason }); }
