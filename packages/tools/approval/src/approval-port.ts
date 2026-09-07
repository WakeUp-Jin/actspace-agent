export type ApprovalRequest = {
  readonly requestId: string;
  readonly callId: string;
  readonly sessionId: string;
  readonly agentRunId: string;
  readonly pluginId: string;
  readonly name: string;
  readonly definitionDigest: string;
  readonly normalizedArgsDigest: string;
  readonly requestedEffects: readonly unknown[];
  readonly reason: string;
  readonly risk: "low" | "medium" | "high";
  readonly argumentSummary: Readonly<Record<string, unknown>>;
};

export type ApprovalDecision = {
  readonly requestId: string;
  readonly decision: "allow" | "deny";
  readonly reason?: string;
  readonly decidedAt: string;
};

export interface ApprovalBroker {
  requestApproval(request: ApprovalRequest, signal: AbortSignal): Promise<ApprovalDecision>;
}
