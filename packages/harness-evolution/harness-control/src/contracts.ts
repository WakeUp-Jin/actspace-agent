import type { ResolvedComposition, HarnessCompatibilityHost } from "@actspace/composition";
import type { Patch } from "@actspace/bundle";
import type { CordisContext } from "@actspace/cordis-adapter";
import type { HarnessMountRequest } from "@actspace/boot";
export type ControlErrorCode = "PREPARE_FAILED" | "INVALID_PATCH" | "ARTIFACT_INVALID" | "CONTRACT_MISMATCH" | "RESTART_REQUIRED" | "BASELINE_CONFLICT" | "CANDIDATE_NOT_READY" | "AUTHORIZATION_REQUIRED" | "AUTHORIZATION_DENIED" | "AUTHORIZATION_EXPIRED" | "REQUEST_CONFLICT" | "STORE_LOCKED" | "DURABILITY_BLOCKED" | "RECOVERY_BLOCKED" | "CLOSED";
export class HarnessControlError extends Error {
  readonly diagnostics: readonly { readonly code: string; readonly entryId?: string; readonly message: string }[];
  constructor(readonly code: ControlErrorCode, message: string, options?: ErrorOptions & { readonly diagnostics?: readonly { readonly code: string; readonly entryId?: string; readonly message: string }[] }) {
    super(message, options); this.name = "HarnessControlError"; this.diagnostics = options?.diagnostics ?? [];
  }
}
export interface SelectionDescription { readonly hostContractDigest: string; readonly composition: ResolvedComposition; readonly artifactIds: readonly string[]; readonly sharedServices: readonly string[] }
export interface AuthorizationRequest {
  readonly harnessId: string; readonly candidateId: string; readonly executionDigest: string;
  readonly expectedRevision: number; readonly activationId: string;
}
export interface AuthorizationDecision extends AuthorizationRequest { readonly actor: string; readonly decisionId: string; readonly expiresAt: number }
export type HarnessAuthorizer = (request: AuthorizationRequest, context: unknown) => Promise<AuthorizationDecision | null>;
export interface SelectionRecord {
  readonly schemaVersion: 1; readonly activationId: string; readonly requestDigest: string;
  readonly harnessId: string; readonly revision: number; readonly previousRevision: number;
  readonly executionDigest: string; readonly description: SelectionDescription;
  readonly authorization: { readonly actor: string; readonly decisionId: string };
  readonly timestamp: string;
}
export interface HarnessPatchRequest { readonly harnessId: string; readonly expectedRevision: number; readonly baseExecutionDigest: string; readonly patch: Patch; readonly artifactIds: readonly string[] }
export interface HarnessBranchRequest extends HarnessPatchRequest {
  readonly sourceHarnessId: string;
  readonly sourceRevision: number;
}
export interface HarnessControlOptions {
  readonly context: CordisContext; readonly dataRoot: string; readonly artifactRoot: string;
  readonly runtimeId: string; readonly compatibility: HarnessCompatibilityHost;
  readonly sharedServices: readonly string[]; readonly builtin: () => Promise<HarnessMountRequest>;
  /** Host opts into updating its builtin history; custom selections/branches are excluded. */
  readonly upgradePristineBuiltin?: (current: SelectionRecord) => boolean;
  readonly authorize?: HarnessAuthorizer; readonly now?: () => number;
  readonly onDiagnostic?: (error: unknown) => void;
  /** @mode emit: called after durable selection and memory publication. */
  readonly onSelection?: (record: SelectionRecord) => void;
}

export interface HarnessControlEvents {
  /** @mode emit */
  "harness/selection-updated": (record: SelectionRecord) => void;
}
declare module "@actspace/cordis-adapter" { interface DomainEvents extends HarnessControlEvents {} }
