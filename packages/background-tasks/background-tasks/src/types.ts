/**
 * `bash`: a command moved to the background; `agent`: a background subagent (its `taskId` is the agent id).
 * `agent` starts written before subagents joined the registry carry no `transcriptPath` and are ignored.
 */
export type BackgroundTaskKind = "bash" | "agent";
export type BackgroundTaskStatus = "running" | "completed" | "failed" | "stopped" | "lost";
export type BackgroundTaskTerminalStatus = "completed" | "failed" | "stopped";
/** How a settled task's result reached the model. Old Journals also hold `wait` (the removed `task_wait`). */
export type BackgroundTaskDelivery = "notified" | "stopped" | "lost";

/**
 * Final result from a source; `body` is already redacted and bounded by the source: a Bash output tail or a
 * subagent's closing message. `note` replaces a subagent's closing message (it messaged its parent instead).
 */
export type BackgroundTaskTerminal = {
  readonly status: BackgroundTaskTerminalStatus;
  readonly summary: string;
  readonly body: string;
  readonly exitCode?: number | null;
  readonly note?: string;
};

/** What a background Bash command is, for the 「后台任务」 panel. `outputPath` is its log under the Session directory. */
export type BackgroundBashDetails = {
  readonly command: string;
  readonly cwd: string;
  readonly sandboxed: boolean;
  readonly outputPath?: string;
};

/** A background subagent: its transcript and its kind label (`general`, `explore`, `fork`, `codex`, `claude-code`). */
export type BackgroundAgentDetails = { readonly transcriptPath: string; readonly label: string };

/**
 * Non-blocking snapshot shown by `task_output`. Bash also reports the log size and the byte offset to pass as
 * `since` next time; `pruned` means the log was deleted by the per-Session cap and `text` is empty.
 */
export type BackgroundTaskOutput = {
  readonly text: string;
  readonly outputPath?: string;
  readonly logSize?: number;
  readonly nextOffset?: number;
  readonly pruned?: boolean;
};

/** `since`: Bash log byte offset to read from; without it a source returns its tail. */
export type BackgroundTaskOutputOptions = { readonly since?: number };

/** Implemented by background Bash and background subagents; the registry owns delivery, persistence and wake-up. */
export interface BackgroundTaskSource {
  readonly taskId: string;
  readonly kind: BackgroundTaskKind;
  /** Parent Session that started the task. */
  readonly sessionId: string;
  /** Tool call that started the task; the UI uses it to find the card. */
  readonly callId: string;
  readonly description: string;
  /** Bash only: the command, where and how it runs. */
  readonly bash?: BackgroundBashDetails;
  /** Subagents only. */
  readonly agent?: BackgroundAgentDetails;
  readonly done: Promise<BackgroundTaskTerminal>;
  output(options?: BackgroundTaskOutputOptions): Promise<BackgroundTaskOutput>;
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
  readonly bash?: BackgroundBashDetails;
  readonly agent?: BackgroundAgentDetails;
};

export type BackgroundTaskErrorCode = "TASK_NOT_FOUND" | "TASK_ID_CONFLICT";

export class BackgroundTaskError extends Error {
  constructor(
    readonly code: BackgroundTaskErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "BackgroundTaskError";
  }
}

/** Harness artifacts inline their own copy of this package, so a Host error is recognised by shape, never by `instanceof`. */
export function isBackgroundTaskError(
  error: unknown,
): error is { readonly name: "BackgroundTaskError"; readonly code: BackgroundTaskErrorCode; readonly message: string } {
  if (typeof error !== "object" || error === null) return false;
  const { name, code, message } = error as {
    readonly name?: unknown;
    readonly code?: unknown;
    readonly message?: unknown;
  };
  return (
    name === "BackgroundTaskError" &&
    (code === "TASK_NOT_FOUND" || code === "TASK_ID_CONFLICT") &&
    typeof message === "string"
  );
}
