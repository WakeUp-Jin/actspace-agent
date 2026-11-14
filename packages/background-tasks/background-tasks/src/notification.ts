import type { BackgroundTaskKind, BackgroundTaskRecord } from "./types.js";

/** What a notification names besides id and kind: the Bash log, or a subagent's description and transcript. */
export type NotifiedTask = Pick<BackgroundTaskRecord, "taskId" | "kind"> & {
  readonly outputPath?: string;
  readonly description?: string;
  readonly transcriptPath?: string;
};
type Terminal = { readonly status: string; readonly summary: string; readonly body: string; readonly note?: string };

/**
 * The model-facing completion message of a background task. Bash carries an output tail and its log path;
 * a subagent carries its transcript and closing message (design 02 §6.2).
 */
export function renderTaskNotification(task: NotifiedTask, terminal: Terminal): string {
  const agent = task.kind === "agent";
  return [
    "<task_notification>",
    `<task_id>${escapeXml(task.taskId)}</task_id>`,
    `<kind>${task.kind}</kind>`,
    ...(agent && task.description !== undefined ? [`<description>${escapeXml(task.description)}</description>`] : []),
    `<status>${escapeXml(terminal.status)}</status>`,
    `<summary>${escapeXml(terminal.summary)}</summary>`,
    ...(task.outputPath ? [`<output_path>${escapeXml(task.outputPath)}</output_path>`] : []),
    ...(task.transcriptPath ? [`<transcript>${escapeXml(task.transcriptPath)}</transcript>`] : []),
    ...(agent ? closing(terminal) : terminal.body ? ["<output_tail>", escapeXml(terminal.body), "</output_tail>"] : []),
    "</task_notification>",
  ].join("\n");
}

/** A subagent's closing message is kept as written; a lost or stopped one may have none. */
function closing(terminal: Terminal): string[] {
  if (terminal.note) return [`<note>${escapeXml(terminal.note)}</note>`];
  if (terminal.status === "lost" || terminal.status === "stopped")
    return terminal.body ? ["<closing_message>", terminal.body, "</closing_message>"] : [];
  return ["<closing_message>", terminal.body || "(no closing message)", "</closing_message>"];
}

export function renderOutputMatchNotification(
  task: Pick<BackgroundTaskRecord, "taskId" | "kind">,
  summary: string,
  line: string,
): string {
  return renderTaskNotification(task, { status: "output_match", summary, body: line });
}

export function renderLostNotification(task: NotifiedTask & { readonly description: string }): string {
  return renderTaskNotification(task, { status: "lost", summary: lostSummary(task), body: "" });
}

function lostSummary(task: {
  readonly taskId: string;
  readonly kind: BackgroundTaskKind;
  readonly description: string;
}): string {
  return task.kind === "agent"
    ? `Subagent ${task.taskId} (${task.description}) was interrupted because the app exited. Its transcript shows how far it got; start a new subagent if the work still needs doing.`
    : `Lost contact with background ${task.kind} task "${task.description}" because the app exited. Do not assume it finished. Check its side effects before relying on it; run it again if needed.`;
}

/** What the model reads at its next step after the user stopped a task from the app. */
export function userStoppedSummary(task: {
  readonly taskId: string;
  readonly kind: BackgroundTaskKind;
  readonly description: string;
}): string {
  return task.kind === "agent"
    ? `The user stopped subagent ${task.taskId} (${task.description}) from the app.`
    : `The user stopped background ${task.kind} task "${task.description}" from the app.`;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
