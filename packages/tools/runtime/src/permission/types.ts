import type {
  FileGrantSelector,
  GrantAccess,
  GrantAction,
  GrantAudience,
  PermissionMode,
  RuntimeV2JsonValue,
} from "@actspace/shared/runtime-v2";

export type ToolResource =
  | {
      readonly kind: "file";
      readonly access: "read" | "write" | "delete";
      readonly canonicalPath: string;
      readonly targetKind: "file" | "directory" | "missing";
    }
  | {
      readonly kind: "process";
      readonly access: "execute";
      readonly commandDigest: string;
      readonly cwd: string;
      readonly dynamic: boolean;
    };

export type ResourceSensitivity =
  | { readonly kind: "normal" }
  | { readonly kind: "once-only"; readonly code: string; readonly reason: string }
  | { readonly kind: "protected"; readonly code: string; readonly reason: string };

export type GlobalBoundaryDecision =
  | { readonly kind: "pass" }
  | { readonly kind: "ask"; readonly reasons: readonly PermissionReason[] }
  | { readonly kind: "deny"; readonly code: string; readonly reason: string };

export type ToolPermissionDecision =
  | { readonly kind: "allow" }
  | { readonly kind: "ask"; readonly reason: string; readonly risk: "low" | "medium" | "high" }
  | { readonly kind: "deny"; readonly code: string; readonly reason: string };

export type PermissionReason = {
  readonly code: string;
  readonly message: string;
  readonly risk: "low" | "medium" | "high";
  readonly reusable: boolean;
};

export type PermissionDecision =
  | { readonly kind: "allow" }
  | { readonly kind: "ask"; readonly reasons: readonly PermissionReason[] }
  | { readonly kind: "deny"; readonly code: string; readonly reason: string };

export type ResourceExtractionContext = {
  readonly workspaceRoot: string;
  canonicalizeFile(path: string, access: "read" | "write" | "delete"): Promise<Extract<ToolResource, { kind: "file" }>>;
};

export type ToolPermissionContext = {
  readonly mode: PermissionMode;
  readonly workspaceRoot: string;
  readonly hostCapabilities: readonly string[];
};

export type ToolPermissionContract = {
  readonly grantAudience?: GrantAudience;
  extractResources(
    args: Readonly<Record<string, RuntimeV2JsonValue>>,
    context: ResourceExtractionContext,
  ): readonly ToolResource[] | Promise<readonly ToolResource[]>;
  evaluate(
    args: Readonly<Record<string, RuntimeV2JsonValue>>,
    resources: readonly ToolResource[],
    context: ToolPermissionContext,
  ): ToolPermissionDecision | Promise<ToolPermissionDecision>;
  suggestGrants?(
    args: Readonly<Record<string, RuntimeV2JsonValue>>,
    resources: readonly ToolResource[],
    context: ToolPermissionContext,
  ): readonly ToolGrantSuggestion[] | Promise<readonly ToolGrantSuggestion[]>;
};

export type ToolGrantSuggestion = {
  readonly action: GrantAction;
  readonly access: GrantAccess;
  readonly selector: FileGrantSelector;
  readonly label: string;
};

export type OnceApproval = {
  readonly kind: "once";
  readonly requestId: string;
  readonly callId: string;
  readonly sessionId: string;
  readonly agentRunId: string;
  readonly pluginId: string;
  readonly toolName: string;
  readonly definitionDigest: string;
  readonly normalizedArgsDigest: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  consumedAt?: string;
};
