export type ToolFailureCode =
  | "TOOL_NOT_FOUND"
  | "TOOL_REGISTRATION_CONFLICT"
  | "TOOL_REGISTRATION_DRAINING"
  | "TOOL_ALREADY_EXECUTED"
  | "INVALID_ARGUMENTS"
  | "POLICY_DENIED"
  | "APPROVAL_REQUIRED"
  | "APPROVAL_DENIED"
  | "APPROVAL_STALE"
  | "APPROVAL_TIMEOUT"
  | "CAPABILITY_DENIED"
  | "WORKSPACE_BOUNDARY_DENIED"
  | "CHECKPOINT_FAILED"
  | "TOOL_EXECUTION_FAILED"
  | "TOOL_ABORTED"
  | "TOOL_OUTCOME_UNKNOWN"
  | "TOOL_COMMIT_FAILED";

export type ToolFailure = {
  readonly code: ToolFailureCode | string;
  readonly message: string;
  readonly retryable: boolean;
  readonly fieldPath?: string;
  readonly phase: "prepare" | "policy" | "approval" | "guard" | "checkpoint" | "body" | "finalize" | "commit";
};

export class ToolRuntimeError extends Error {
  constructor(readonly failure: ToolFailure, readonly cause?: unknown) {
    super(failure.message, { cause });
    this.name = "ToolRuntimeError";
  }
}
