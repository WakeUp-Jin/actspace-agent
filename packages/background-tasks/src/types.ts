export type BackgroundTaskKind = "bash" | "agent";
export type BackgroundTaskStatus = "running" | "completed" | "failed" | "stopped" | "lost";
export type BackgroundTaskTerminalStatus = "completed" | "failed" | "stopped";
/** How a settled task's result reached the model. */
export type BackgroundTaskDelivery = "notified" | "wait" | "stopped" | "lost";

/** Final result from a source; `body` is already redacted and bounded by the source. */
export type BackgroundTaskTerminal = {
  readonly status: BackgroundTaskTerminalStatus;
  readonly summary: string;
  readonly body: string;
  readonly exitCode?: number | null;
};

/** Non-blocking snapshot shown by `task_output`. */
export type BackgroundTaskOutput = { readonly text: string; readonly outputPath?: string };

/** Implemented by Bash and Subagent; the registry owns delivery, persistence and wake-up. */
export interface BackgroundTaskSource {
  readonly taskId: string;
  readonly kind: BackgroundTaskKind;
  /** Parent Session that started the task. */
  readonly sessionId: string;
  /** Tool call that started the task; the UI uses it to find the card. */
  readonly callId: string;
  readonly description: string;
  readonly done: Promise<BackgroundTaskTerminal>;
  output(): Promise<BackgroundTaskOutput>;
  stop(reason: string): Promise<void>;
}

export type BackgroundTaskRecord = {
  readonly taskId: string;
  readonly kind: BackgroundTaskKind;
  readonly sessionId: string;
  readonly callId: string;
  readonly description: string;
  readonly status: BackgroundTaskStatus;
  readonly startedAt: number;
  readonly endedAt?: number;
  readonly exitCode?: number | null;
  readonly summary?: string;
};

export type BackgroundTaskWaitResult =
  | { readonly status: "completed"; readonly task: BackgroundTaskRecord; readonly output: BackgroundTaskOutput }
  | { readonly status: "timed_out" | "interrupted"; readonly running: readonly BackgroundTaskRecord[] }
  | { readonly status: "no_running_tasks" };

export class BackgroundTaskError extends Error {
  constructor(readonly code: "TASK_NOT_FOUND" | "TASK_ID_CONFLICT", message: string) { super(message); this.name = "BackgroundTaskError"; }
}
