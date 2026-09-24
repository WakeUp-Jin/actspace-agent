export type DesktopRuntimeV2Roots = {
  readonly dataRoot: string;
  readonly sessionRoot: string;
  readonly logRoot: string;
  readonly tmpRoot: string;
  readonly defaultWorkspaceRoot: string;
  readonly workspaceRoot: string;
};

export type DesktopRuntimeV2ApprovalRequest = {
  readonly id: string;
  readonly toolCallId?: string;
  readonly toolName: string;
  readonly args: Record<string, unknown>;
  readonly summary: string;
  readonly reason: string;
  readonly riskLevel?: "low" | "medium" | "high";
  readonly approvalScope?: "browser_session";
  readonly executionEnvironment?: "sandbox" | "real";
  readonly sessionId?: string;
  readonly agentRunId?: string;
  readonly createdAt: number;
  readonly grantSuggestions?: readonly import("@actspace/shared/runtime-v2").GrantSuggestion[];
  readonly supportedLifetimes?: readonly import("@actspace/shared/runtime-v2").GrantLifetime[];
};

export type DesktopRuntimeV2ApprovalDecision = {
  readonly requestId: string;
  readonly decision: "once" | "session" | "deny" | "timeout" | "abort";
  readonly suggestionId?: string;
  readonly decidedAt: number;
};

export interface DesktopRuntimeV2ApprovalPort {
  waitForDecision(request: DesktopRuntimeV2ApprovalRequest): Promise<DesktopRuntimeV2ApprovalDecision>;
  onApprovalRequired(request: DesktopRuntimeV2ApprovalRequest): void;
  abortAgentRun?(sessionId: string, agentRunId: string): number;
  expireAll?(sessionId?: string): number;
}

export interface DesktopRuntimeV2BrowserPort {
  readonly socketPath: string;
  getStatus(): Promise<{ readonly runState: string }>;
}
