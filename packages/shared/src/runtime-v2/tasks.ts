import type { RuntimeV2JsonValue } from "./host-dto";
export type TaskState = "pending" | "claimed" | "completed" | "failed" | "cancelled" | "interrupted";
export type RunOutcome = "completed" | "failed" | "cancelled" | "interrupted";
export type HarnessIdentity = { readonly harnessId: string; readonly generationId: string; readonly revision: number };
export type TaskRecord = {
  readonly taskId: string;
  readonly submissionId: string;
  readonly content: RuntimeV2JsonValue;
  /** Durable result of a scheduling operation; ordinary Run results live on RunRecord. */
  readonly result?: RuntimeV2JsonValue;
  readonly acceptedSeq: number;
  readonly state: TaskState;
  readonly targetRunId: string | null;
  readonly runId: string | null;
  readonly continuationOf: string | null;
};
export type RunRecord = {
  readonly runId: string;
  readonly taskId: string;
  readonly harness: HarnessIdentity;
  readonly configuration: RuntimeV2JsonValue;
  readonly state: "running" | RunOutcome;
  readonly result: RuntimeV2JsonValue;
};
export type TaskSnapshot = {
  readonly sessionId: string;
  readonly revision: number;
  readonly paused: boolean;
  readonly tasks: readonly TaskRecord[];
  readonly queue: readonly string[];
  readonly runs: readonly RunRecord[];
};
export type TaskReceipt = {
  readonly task: TaskRecord;
  readonly revision: number;
  /** null for explicitly ephemeral sessions; never claim disk durability for them. */
  readonly durableSeq: number | null;
};

export type TaskConfiguration = {
  readonly durationMs?: number;
  readonly deadline?: number;
  readonly model?: string;
  readonly thinkingEnabled?: boolean;
  readonly reasoningEffort?: import("../model-config").ModelReasoningEffort;
  readonly selectedSkillIds?: readonly string[];
};
export type TaskCommand = { readonly sessionId: string } & (
  | { readonly op: "snapshot" }
  | { readonly op: "configure"; readonly configuration: TaskConfiguration }
  | { readonly op: "designate"; readonly taskId: string; readonly runId: string | null; readonly revision: number }
  | { readonly op: "cancel"; readonly taskId: string; readonly revision: number }
  | { readonly op: "move"; readonly taskId: string; readonly beforeTaskId: string; readonly revision: number }
  | { readonly op: "resume"; readonly revision: number }
  | { readonly op: "stop"; readonly runId: string }
);
export type TaskCommandResult = { readonly snapshot: TaskSnapshot; readonly error?: string };
export type SubmitTaskInput = { readonly sessionId: string; readonly submissionId: string; readonly userInput: string; readonly attachments?: import("../session").ComposerAttachment[]; readonly fileReferences?: import("../composer-content").FileReference[]; readonly responseAnnotations?: import("../composer-content").ResponseAnnotationReference[] };
export type TaskContentEnvelope = { readonly kind: "composer-task"; readonly original: RuntimeV2JsonValue; readonly prepared: RuntimeV2JsonValue };

/** A rejected preparation is distinct from an unacknowledged network submission. */
export type TaskSubmissionFailure = { readonly status: "submission-failed"; readonly acknowledgement: "rejected" | "unknown"; readonly message: string; readonly attachmentIssue?: import("../chat-attachments").ChatAttachmentIssue; readonly referenceIssue?: import("../composer-content").ComposerReferenceIssue };
export type TaskSubmissionResult = TaskReceipt | TaskSubmissionFailure;

/** One command interpretation for local, remote, queue and supplement admission. */
export function taskOperation(content: RuntimeV2JsonValue): "compact" | undefined {
  let text: unknown = content;
  if (content && typeof content === "object" && !Array.isArray(content) && "kind" in content && content.kind === "composer-task") {
    const original = "original" in content ? content.original : null;
    text = original && typeof original === "object" && !Array.isArray(original) && "userInput" in original ? original.userInput : undefined;
  }
  return typeof text === "string" && text.trim() === "/compact" ? "compact" : undefined;
}
