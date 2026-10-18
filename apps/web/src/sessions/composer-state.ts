import type { TaskSnapshot } from "@actspace/shared/runtime-v2";

export type PrimaryAction = "send" | "stop" | "disabled";

/** 主按钮：有字发送；没字且在运行或等审批时停止；其余置灰。断开时全部置灰，维护中不能发送但仍可停止。 */
export function primaryAction(input: { hasText: boolean; running: boolean; awaitingApproval: boolean; connected: boolean; maintenance?: boolean }): PrimaryAction {
  if (!input.connected) return "disabled";
  if (input.hasText) return input.maintenance ? "disabled" : "send";
  return input.running || input.awaitingApproval ? "stop" : "disabled";
}

export type QueuedMessage = { readonly taskId: string; readonly text: string };

function taskText(content: unknown): string {
  if (typeof content === "string") return content;
  if (content && typeof content === "object" && "original" in content) {
    const original = (content as { original?: unknown }).original;
    if (original && typeof original === "object" && "userInput" in original && typeof (original as { userInput: unknown }).userInput === "string") return (original as { userInput: string }).userInput;
  }
  return "";
}

/** 排队中的消息：queue 里还在 pending 的任务，按队列顺序。 */
export function queuedMessages(tasks: TaskSnapshot | null): QueuedMessage[] {
  if (!tasks) return [];
  const byId = new Map(tasks.tasks.map(task => [task.taskId, task]));
  const items: QueuedMessage[] = [];
  for (const taskId of tasks.queue) {
    const task = byId.get(taskId);
    if (task && task.state === "pending") items.push({ taskId, text: taskText(task.content) });
  }
  return items;
}

export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

export type StatusKind = "approval" | "running" | "online" | "offline" | "maintenance";
export function statusKind(input: { awaitingApproval: boolean; running: boolean; connected: boolean; maintenance: boolean }): StatusKind {
  if (!input.connected) return "offline";
  if (input.maintenance) return "maintenance";
  if (input.awaitingApproval) return "approval";
  return input.running ? "running" : "online";
}
