import type { BackgroundTaskRecord } from "./types.js";

export const AGENT_RESULT_LIMIT_BYTES = 8 * 1024;

/** The model-facing completion message; Bash carries an output tail, an Agent its final text. */
export function renderTaskNotification(task: Pick<BackgroundTaskRecord, "taskId" | "kind">, terminal: { readonly status: string; readonly summary: string; readonly body: string }): string {
  const tag = task.kind === "agent" ? "result" : "output_tail";
  return [
    "<task_notification>",
    `<task_id>${escapeXml(task.taskId)}</task_id>`,
    `<kind>${task.kind}</kind>`,
    `<status>${escapeXml(terminal.status)}</status>`,
    `<summary>${escapeXml(terminal.summary)}</summary>`,
    ...(terminal.body ? [`<${tag}>`, escapeXml(terminal.body), `</${tag}>`] : []),
    "</task_notification>",
  ].join("\n");
}

export function renderOutputMatchNotification(task: Pick<BackgroundTaskRecord, "taskId" | "kind">, summary: string, line: string): string {
  return renderTaskNotification(task, { status: "output_match", summary, body: line });
}

export function renderLostNotification(task: Pick<BackgroundTaskRecord, "taskId" | "kind" | "description">): string {
  const advice = task.kind === "agent" ? "Delegate it again if the result is still needed." : "Check its side effects before relying on it; run it again if needed.";
  return renderTaskNotification(task, { status: "lost", summary: `Lost contact with background ${task.kind} task "${task.description}" because the app exited. Do not assume it finished. ${advice}`, body: "" });
}

/** Cut at a UTF-8 byte budget without splitting a character. */
export function truncateUtf8(text: string, limitBytes: number): { readonly text: string; readonly truncated: boolean } {
  const bytes = Buffer.from(text, "utf8");
  if (bytes.length <= limitBytes) return { text, truncated: false };
  let end = limitBytes;
  while (end > 0 && (bytes[end]! & 0xc0) === 0x80) end -= 1;
  return { text: bytes.subarray(0, end).toString("utf8"), truncated: true };
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
