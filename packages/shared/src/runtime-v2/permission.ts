export type PermissionMode = "default" | "full-access";
export type FileScope = "workspace" | "all";
export type GrantLifetime = "once" | "session";

export type GrantAction = "file.read" | "file.write";
export type GrantAccess = "read" | "write";

export type FileGrantSelector =
  | { readonly kind: "exact"; readonly canonicalPath: string }
  | { readonly kind: "subtree"; readonly canonicalRoot: string };

export type GrantAudience = {
  readonly pluginId: string;
  readonly permissionDomain: string;
  readonly policyVersion: number;
};

export type SessionGrant = {
  readonly schemaVersion: 1;
  readonly grantId: string;
  readonly sessionId: string;
  readonly agentId: string;
  readonly audience: GrantAudience;
  readonly action: GrantAction;
  readonly access: GrantAccess;
  readonly selector: FileGrantSelector;
  readonly sourceRequestId: string;
  readonly sourceCallId: string;
  readonly sourceToolName: string;
  readonly issuedAt: string;
  readonly expiresAt?: string;
};

export type ApprovalReason = {
  readonly code: string;
  readonly message: string;
  readonly risk: "low" | "medium" | "high";
};

export type ApprovalResourceSummary =
  | {
      readonly kind: "file";
      readonly access: "read" | "write" | "delete";
      readonly path: string;
      readonly targetKind: "file" | "directory" | "missing";
    }
  | {
      readonly kind: "process";
      readonly access: "execute";
      readonly commandDigest: string;
      readonly cwd: string;
      readonly dynamic: boolean;
    };

export type GrantSuggestion = {
  readonly suggestionId: string;
  readonly lifetime: "session";
  readonly action: GrantAction;
  readonly access: GrantAccess;
  readonly selector: FileGrantSelector;
  readonly audience: GrantAudience;
  readonly label: string;
};

export type ApprovalRequest = {
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly callId: string;
  readonly sessionId: string;
  readonly agentRunId: string;
  readonly agentId: string;
  readonly pluginId: string;
  readonly toolName: string;
  readonly definitionDigest: string;
  readonly normalizedArgsDigest: string;
  readonly reasons: readonly ApprovalReason[];
  readonly resources: readonly ApprovalResourceSummary[];
  readonly grantSuggestions: readonly GrantSuggestion[];
  readonly supportedLifetimes: readonly GrantLifetime[];
  readonly requestedAt: string;
  readonly expiresAt: string;
};

export type ApprovalDecision =
  | { readonly requestId: string; readonly kind: "once"; readonly decidedAt: string }
  | { readonly requestId: string; readonly kind: "session"; readonly suggestionId: string; readonly decidedAt: string }
  | {
      readonly requestId: string;
      readonly kind: "deny";
      readonly code: "user-denied" | "timeout" | "aborted" | "broker-unavailable" | "invalid-decision";
      readonly decidedAt: string;
    };
