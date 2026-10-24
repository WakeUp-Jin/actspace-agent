import type { CordisContext } from "@actspace/cordis-adapter";
import type { ContextSource } from "@actspace/context-engine";
import type { BackgroundTaskHost, BackgroundTaskRecord } from "@actspace/background-tasks";
import { publish } from "@actspace/prompt/source-support";

export const BACKGROUND_TASKS_CONTEXT_OWNER = "actspace.context-background-tasks";

/**
 * Running background tasks, refreshed once per turn. The engine dedupes an
 * unchanged text and re-mounts it after compaction; a Session that never had
 * background work gets nothing.
 */
export function createBackgroundTasksSource(tasks: Pick<BackgroundTaskHost, "list">): ContextSource {
  let turn: string | undefined; let text: string | undefined;
  return { id: "context-background-tasks", owner: BACKGROUND_TASKS_CONTEXT_OWNER, order: 15, criticality: "optional", fields: ["supplements"],
    get: (context, write) => {
      if (turn !== context.request.turnId) { turn = context.request.turnId; text = render(tasks.list(context.request.sessionId)); }
      if (text === undefined) return;
      // Ending all tasks writes a closing text instead of removing the list, so earlier prompt-cache prefixes stay valid.
      write({ supplements: [{ id: "background-tasks", owner: BACKGROUND_TASKS_CONTEXT_OWNER, text, sourceEventSeq: -1, afterEventSeq: -1 }] });
    } };
}

function render(all: readonly BackgroundTaskRecord[]): string | undefined {
  if (all.length === 0) return undefined;
  const running = all.filter(task => task.status === "running").sort((a, b) => a.startedAt - b.startedAt);
  if (running.length === 0) return "No background tasks are running.";
  return [
    "Background tasks still running (this list supersedes earlier lists; completion notifications supersede it):",
    ...running.map(task => `- ${task.taskId} · ${task.kind} · ${task.description} · started ${localIso(task.startedAt)}`),
    "Do not start duplicates. Use task_output / task_wait only if you need them.",
  ].join("\n");
}

function localIso(ms: number): string {
  const date = new Date(ms), offset = -date.getTimezoneOffset(), sign = offset >= 0 ? "+" : "-", pad = (value: number) => String(Math.trunc(Math.abs(value))).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${pad(offset / 60)}:${pad(offset % 60)}`;
}

export function apply(ctx: CordisContext): void {
  const tasks = ctx.get?.("actspace.host.background-tasks") as BackgroundTaskHost | undefined;
  publish(ctx, "background-tasks", () => createBackgroundTasksSource(tasks ?? { list: () => [] }));
}
