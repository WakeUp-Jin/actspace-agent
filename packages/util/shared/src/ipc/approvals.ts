// 审批与中止 IPC（`approvals.*`、`agent.abort`）。

import type { GrantLifetime, GrantSuggestion } from "../runtime-v2/permission";
import type { ToolUiPreview } from "../session";

export type AbortAgentRunInput = {
  sessionId: string;
  agentRunId: string;
};

/** `hostId`：远端审批所在的 Host，main 按它路由（15 T10）；本机审批不带。 */
export type ApprovalDecideInput =
  | { requestId: string; hostId?: string; decision: "once" | "deny" }
  | { requestId: string; hostId?: string; decision: "session"; suggestionId: string };

export type ApprovalDecideResult = {
  ok: boolean;
  reason?: string;
};

export type ApprovalListPendingInput = {
  sessionId?: string;
};

export type PendingApprovalInfo = {
  requestId: string;
  /** 远端审批所在的 Host；本机审批没有。 */
  hostId?: string;
  /** Live recovery facts; absent on older hosts, never inferred from stale history. */
  recovery?: {
    agentRunId: string;
    toolCallId: string;
    preview: ToolUiPreview;
    approvalScope?: "browser_session";
  };
  toolName: string;
  summary: string;
  reason: string;
  riskLevel?: string;
  command?: string;
  createdAt: number;
  expiresAt: number;
  grantSuggestions?: readonly GrantSuggestion[];
  supportedLifetimes?: readonly GrantLifetime[];
};
