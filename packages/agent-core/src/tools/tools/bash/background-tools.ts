/**
 * bash 后台任务配套工具：bash_output（读增量输出）/ bash_kill（终止任务）
 *
 * 操作对象都是模型自己启动的后台任务（taskId 由 bash 转后台时返回），
 * permission 默认 allow。不做 bash_list——运行中任务清单在 turn 边界注入。
 */

import { readFile } from "node:fs/promises";
import type { InternalTool, ToolResult } from "../../../internal-tools";
import { bashTaskRegistry, type BashTask } from "./task-registry";

/** 单次回填上限（字符）。 */
const MAX_OUTPUT_CHARS = 64_000;

function describeTask(task: BashTask): string {
  const runtime = `${Math.round(((task.endedAt ?? Date.now()) - task.startedAt) / 1000)}s`;
  const base = `Task ${task.taskId} (${task.command}) status=${task.status} runtime=${runtime}`;
  return task.status === "running" ? base : `${base} exitCode=${task.exitCode}`;
}

async function readTaskOutput(task: BashTask): Promise<string> {
  if (!task.outputFilePath) return "";
  try {
    return await readFile(task.outputFilePath, "utf8");
  } catch {
    return "";
  }
}

export const bashOutputTool: InternalTool = {
  name: "bash_output",
  description:
    "Read output from a background bash task started earlier (taskId comes from a backgrounded bash call). " +
    "By default returns only the new output since your last bash_output call for this task. " +
    "Set tailLines to read the last N lines instead. " +
    "Do NOT poll this tool in a loop; you will receive a task_notification when the task finishes.",
  parameters: {
    type: "object",
    properties: {
      taskId: {
        type: "string",
        description: "Background task id returned by a backgrounded bash call.",
      },
      tailLines: {
        type: "number",
        description: "Optional. Read the last N lines of the full output instead of the incremental delta.",
      },
    },
    required: ["taskId"],
    additionalProperties: false,
  },
  isReadOnly: true,
  category: "system",
  previewKind: "bash",
  handler: async (args): Promise<ToolResult> => {
    const taskId = typeof args.taskId === "string" ? args.taskId : "";
    const task = bashTaskRegistry.get(taskId);
    if (!task) {
      return { success: false, error: `Unknown background task: ${taskId || "(missing taskId)"}` };
    }

    const full = await readTaskOutput(task);
    const tailLines = typeof args.tailLines === "number" && args.tailLines > 0 ? Math.trunc(args.tailLines) : undefined;

    let slice: string;
    let mode: string;
    if (tailLines !== undefined) {
      const lines = full.split("\n");
      slice = lines.slice(-tailLines).join("\n");
      mode = `tail ${tailLines} lines`;
    } else {
      slice = full.slice(task.lastReadOffset);
      mode = `delta from offset ${task.lastReadOffset}`;
      task.lastReadOffset = full.length;
    }

    let omitted = "";
    if (slice.length > MAX_OUTPUT_CHARS) {
      omitted = `\n\n[输出超出单次上限，省略前 ${slice.length - MAX_OUTPUT_CHARS} 字符，完整原文见 ${task.outputFilePath}]`;
      slice = slice.slice(-MAX_OUTPUT_CHARS);
    }

    // 任务已终态且模型主动来读过 → 抑制冗余终态通知
    if (task.status !== "running") {
      bashTaskRegistry.suppressNotification(taskId);
    }

    const text = [
      describeTask(task),
      `read mode: ${mode}`,
      "",
      slice || "(no new output)",
      omitted,
    ].join("\n");

    return { success: true, data: text };
  },
};

export const bashKillTool: InternalTool = {
  name: "bash_kill",
  description:
    "Terminate a background bash task (SIGTERM, then SIGKILL after a grace period). " +
    "Use this to stop dev servers / watchers you started, or commands that are stuck.",
  parameters: {
    type: "object",
    properties: {
      taskId: {
        type: "string",
        description: "Background task id returned by a backgrounded bash call.",
      },
    },
    required: ["taskId"],
    additionalProperties: false,
  },
  isReadOnly: false,
  category: "system",
  previewKind: "bash",
  handler: async (args): Promise<ToolResult> => {
    const taskId = typeof args.taskId === "string" ? args.taskId : "";
    const task = bashTaskRegistry.get(taskId);
    if (!task) {
      return { success: false, error: `Unknown background task: ${taskId || "(missing taskId)"}` };
    }
    if (task.status !== "running") {
      bashTaskRegistry.suppressNotification(taskId);
      return { success: true, data: `${describeTask(task)}\n(already finished, nothing to kill)` };
    }

    // 先抑制通知：kill 的结果就在本工具返回里，终态通知是冗余的
    bashTaskRegistry.suppressNotification(taskId);
    bashTaskRegistry.kill(taskId);

    const handle = bashTaskRegistry.getHandle(taskId);
    if (handle) await handle.wait;

    const full = await readTaskOutput(task);
    const tail = full.length > 2_000 ? full.slice(-2_000) : full;
    const text = [
      describeTask(task),
      ...(tail ? ["", "output tail:", tail] : []),
    ].join("\n");

    return { success: true, data: text };
  },
};
