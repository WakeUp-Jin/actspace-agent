import type { ApprovalBroker, ApprovalDecision, ApprovalRequest } from "@actspace/approval";

/**
 * CLI 没有交互式审批面：stdin 整段作为提示词读完即关闭，所以任何需要人工审批的调用都直接拒绝，
 * 并把请求记在 `approvalRequired` 上，由 run 结果以 `APPROVAL_REQUIRED` 报告给调用方。
 */
export class CliV2ApprovalBroker implements ApprovalBroker {
  approvalRequired: ApprovalRequest | undefined;

  async requestApproval(request: ApprovalRequest): Promise<ApprovalDecision> {
    this.approvalRequired = request;
    return Object.freeze({ requestId: request.requestId, kind: "deny", code: "broker-unavailable", decidedAt: new Date().toISOString() });
  }
}
