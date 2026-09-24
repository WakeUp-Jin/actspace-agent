export type { ApprovalDecision, ApprovalRequest } from "@actspace/shared/runtime-v2";
import type { ApprovalDecision, ApprovalRequest } from "@actspace/shared/runtime-v2";

export interface ApprovalBroker {
  requestApproval(request: ApprovalRequest, signal: AbortSignal): Promise<ApprovalDecision>;
}
