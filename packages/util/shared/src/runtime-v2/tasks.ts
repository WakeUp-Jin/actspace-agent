import type { RuntimeJsonValue } from "./host-dto";
export type TaskState = "pending" | "claimed" | "completed" | "failed" | "cancelled" | "interrupted";
export type RunOutcome = "completed" | "failed" | "cancelled" | "interrupted";
export type HarnessIdentity = { readonly harnessId: string; readonly generationId: string; readonly revision: number };
export type TaskRecord = {
  readonly taskId: string;
  readonly submissionId: string;
  readonly content: RuntimeJsonValue;
  /** Durable result of a scheduling operation; ordinary Run results live on RunRecord. */
  readonly result?: RuntimeJsonValue;
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
  readonly configuration: RuntimeJsonValue;
  readonly state: "running" | RunOutcome;
  readonly result: RuntimeJsonValue;
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
export type SubmitTaskInput = {
  readonly sessionId: string;
  readonly submissionId: string;
  readonly userInput: string;
  readonly attachments?: import("../session").ComposerAttachment[];
  readonly fileReferences?: import("../composer-content").FileReference[];
  readonly responseAnnotations?: import("../composer-content").ResponseAnnotationReference[];
  /** Start over from this Turn: drop it and everything after it, then accept this prompt in its place. */
  readonly rewind?: TaskRewind;
  /** The Run id the client already shows this prompt under; the Host starts the task with it. */
  readonly agentRunId?: string;
};
/** The edited Turn's Run, and the Journal position (`throughJournalSeq`) the client saw. */
export type TaskRewind = { readonly runId: string; readonly expectedThroughSeq: number };
/** Rewind refusals the client shows with its own wording (agent-edit-resend-rewind.md §3.7). */
export const REWIND_ERROR_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  SESSION_BUSY: "正在运行或有排队消息，结束后再编辑。",
  REWIND_CONFLICT: "这段对话有了新内容，看过最新内容后再编辑。",
  REWIND_TURN_NOT_FOUND: "这条提问不能再编辑。",
  REWIND_INHERITED: "这条提问不能再编辑。",
  REWIND_UNAVAILABLE: "这条提问不能再编辑。",
});
/** The client-facing message of a rewind refusal, or undefined for any other failure. */
export function rewindErrorMessage(error: unknown): string | undefined {
  const code = error && typeof error === "object" && "code" in error ? (error as { code?: unknown }).code : undefined;
  const fromMessage = error instanceof Error ? error.message : undefined;
  const key =
    typeof code === "string" && code in REWIND_ERROR_MESSAGES
      ? code
      : fromMessage && fromMessage in REWIND_ERROR_MESSAGES
        ? fromMessage
        : undefined;
  return key ? REWIND_ERROR_MESSAGES[key] : undefined;
}
export type TaskContentEnvelope = {
  readonly kind: "composer-task";
  readonly original: RuntimeJsonValue;
  readonly prepared: RuntimeJsonValue;
};

/** A rejected preparation is distinct from an unacknowledged network submission. */
export type TaskSubmissionFailure = {
  readonly status: "submission-failed";
  readonly acknowledgement: "rejected" | "unknown";
  readonly message: string;
  readonly attachmentIssue?: import("../chat-attachments").ChatAttachmentIssue;
  readonly referenceIssue?: import("../composer-content").ComposerReferenceIssue;
};
export type TaskSubmissionResult = TaskReceipt | TaskSubmissionFailure;

/** One command interpretation for local, remote, queue and supplement admission. */
export function taskOperation(content: RuntimeJsonValue): "compact" | undefined {
  let text: unknown = content;
  if (
    content &&
    typeof content === "object" &&
    !Array.isArray(content) &&
    "kind" in content &&
    content.kind === "composer-task"
  ) {
    const original = "original" in content ? content.original : null;
    text =
      original && typeof original === "object" && !Array.isArray(original) && "userInput" in original
        ? original.userInput
        : undefined;
  }
  return typeof text === "string" && text.trim() === "/compact" ? "compact" : undefined;
}

/** Host-submitted task that opens a Run only to deliver pending background notifications. */
export const BACKGROUND_WAKE_KIND = "background-wake";
export type BackgroundWakeContent = { readonly kind: typeof BACKGROUND_WAKE_KIND };

export function isBackgroundWake(content: RuntimeJsonValue | undefined): boolean {
  return (
    !!content &&
    typeof content === "object" &&
    !Array.isArray(content) &&
    "kind" in content &&
    content.kind === BACKGROUND_WAKE_KIND
  );
}

/** A background Bash command as the right-panel 「后台任务」 shows it. Background Agents live in the 子 Agent panel. */
export type BackgroundBashTaskView = {
  readonly taskId: string;
  /** Tool call that started it; the chat's Bash row carries the same id. */
  readonly callId: string;
  readonly description: string;
  readonly command: string;
  readonly cwd: string;
  readonly sandboxed: boolean;
  readonly status: "running" | "completed" | "failed" | "stopped" | "lost";
  readonly startedAt: number;
  readonly endedAt?: number;
  readonly exitCode?: number | null;
};
export type BackgroundTaskListInput = { readonly sessionId: string };
export type BackgroundTaskInput = { readonly sessionId: string; readonly taskId: string };
/** `text` is the redacted tail of the output; earlier output is replaced by a one-line marker. */
export type BackgroundTaskOutputView = { readonly task: BackgroundBashTaskView; readonly text: string };
