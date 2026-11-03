import type { BackgroundTaskRecord } from "./types.js";

/** The model-facing completion message of a background Bash task: an output tail and its log path. */
export function renderTaskNotification(task: Pick<BackgroundTaskRecord, "taskId" | "kind"> & { readonly outputPath?: string }, terminal: { readonly status: string; readonly summary: string; readonly body: string }): string {
  return [
    "<task_notification>",
    `<task_id>${escapeXml(task.taskId)}</task_id>`,
    `<kind>${task.kind}</kind>`,
    `<status>${escapeXml(terminal.status)}</status>`,
    `<summary>${escapeXml(terminal.summary)}</summary>`,
    ...(task.outputPath ? [`<output_path>${escapeXml(task.outputPath)}</output_path>`] : []),
    ...(terminal.body ? ["<output_tail>", escapeXml(terminal.body), "</output_tail>"] : []),
    "</task_notification>",
  ].join("\n");
}

export function renderOutputMatchNotification(task: Pick<BackgroundTaskRecord, "taskId" | "kind">, summary: string, line: string): string {
  return renderTaskNotification(task, { status: "output_match", summary, body: line });
}

export function renderLostNotification(task: Pick<BackgroundTaskRecord, "taskId" | "kind" | "description">): string {
  return renderTaskNotification(task, { status: "lost", summary: `Lost contact with background ${task.kind} task "${task.description}" because the app exited. Do not assume it finished. Check its side effects before relying on it; run it again if needed.`, body: "" });
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
