import type { TaskSnapshot } from "@actspace/shared/runtime-v2";
export type { TaskState, RunOutcome, HarnessIdentity, TaskRecord, RunRecord, TaskSnapshot, TaskReceipt } from "@actspace/shared/runtime-v2";
export type TaskErrorCode = "SUBMISSION_CONFLICT" | "REVISION_CONFLICT" | "TASK_NOT_FOUND" | "TASK_NOT_PENDING" | "RUN_NOT_ACTIVE" | "SESSION_BUSY" | "QUEUE_PAUSED" | "QUEUE_ORDER" | "DURABILITY_BLOCKED" | "INVALID_EVENT";
export class TaskError extends Error {
  constructor(readonly code: TaskErrorCode, readonly snapshot?: TaskSnapshot, options?: ErrorOptions) { super(code, options); this.name = "TaskError"; }
}
