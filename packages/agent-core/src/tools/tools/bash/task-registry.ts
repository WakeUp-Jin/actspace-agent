/**
 * Bash 后台任务注册表
 *
 * 模块级单例：Agent 及其依赖是每 turn 新建的（见 desktop/main/agent-turn.ts），
 * 后台任务必须活在能跨 turn 存活的位置。按 sessionId 分组，不持久化——
 * 进程活不过应用退出，恢复注册表无意义（设计文档「被排除的方案」）。
 *
 * 设计事实来源：docs/design-docs/agent-bash工具设计文档.md「后台运行与通知机制」。
 */

import { readFile } from "node:fs/promises";
import type { ProcessSinkHandle } from "../../subprocess/run-process";
import type { TaskOutputMonitor } from "./output-monitor";

export type BashTaskStatus = "running" | "completed" | "failed" | "killed";

export interface BashTask {
  taskId: string;
  sessionId: string;
  command: string;
  intent?: string;
  cwd: string;
  pid?: number;
  outputFilePath?: string;
  status: BashTaskStatus;
  exitCode?: number | null;
  startedAt: number;
  endedAt?: number;
  /** diskCap 命中被磁盘看门狗终止。 */
  diskCapHit?: boolean;
  /** 终态通知已投递（或无需投递），防止重复通知。 */
  notified: boolean;
  /** bash_output 增量读取记账（字符 offset）。 */
  lastReadOffset: number;
  /** 本任务是否在沙盒内执行。 */
  sandboxed?: boolean;
}

export type BashTaskEventStatus = BashTaskStatus | "output_match" | "stalled" | "stall_recovered";

export interface BashTaskNotification {
  taskId: string;
  sessionId: string;
  status: BashTaskEventStatus;
  /** 注入模型上下文的 <task_notification> 文本。stall_recovered 仅供前端，text 为空。 */
  text: string;
}

/** 任务终态回调：main 进程订阅它把状态推给前端。 */
export type BashTaskListener = (task: BashTask) => void;

const OUTPUT_TAIL_CHARS = 2_000;

function createTaskId(): string {
  return `bash_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** 读落盘文件末尾 ≤ 2KB，供通知内嵌，多数场景免去一次 bash_output。 */
async function readOutputTail(task: BashTask): Promise<string> {
  if (!task.outputFilePath) return "";
  try {
    const content = await readFile(task.outputFilePath, "utf8");
    return content.length > OUTPUT_TAIL_CHARS ? content.slice(-OUTPUT_TAIL_CHARS) : content;
  } catch {
    return "";
  }
}

/** output_match / stalled 事件通知文本（终态通知见 formatTaskNotification）。 */
export function formatTaskEventNotification(
  task: BashTask,
  status: "output_match" | "stalled",
  line: string,
  reason?: string,
): string {
  const summary =
    status === "output_match"
      ? `Background command "${task.command}" output matched your subscription${reason ? ` (${reason})` : ""}`
      : `Background command "${task.command}" produced no output for a while and its last line looks like an interactive prompt. ` +
        `It is likely waiting for input. Consider bash_kill then re-running with non-interactive flags (e.g. --yes) or piped input.`;
  const lines = [
    "<task_notification>",
    `<task_id>${task.taskId}</task_id>`,
    `<status>${status}</status>`,
    ...(task.outputFilePath ? [`<output_file>${task.outputFilePath}</output_file>`] : []),
    `<summary>${summary}</summary>`,
    "<output_tail>",
    line,
    "</output_tail>",
    "</task_notification>",
  ];
  return lines.join("\n");
}

export function formatTaskNotification(task: BashTask, outputTail: string): string {
  const summaryByStatus: Record<BashTaskStatus, string> = {
    running: `Background command "${task.command}" is running`,
    completed: `Background command "${task.command}" completed (exit code ${task.exitCode})`,
    failed: `Background command "${task.command}" failed (exit code ${task.exitCode})`,
    killed: task.diskCapHit
      ? `Background command "${task.command}" was killed: output reached the disk cap`
      : `Background command "${task.command}" was killed`,
  };
  const lines = [
    "<task_notification>",
    `<task_id>${task.taskId}</task_id>`,
    `<status>${task.status}</status>`,
    `<exit_code>${task.exitCode ?? "null"}</exit_code>`,
    ...(task.outputFilePath ? [`<output_file>${task.outputFilePath}</output_file>`] : []),
    `<summary>${summaryByStatus[task.status]}</summary>`,
    ...(outputTail ? ["<output_tail>", outputTail, "</output_tail>"] : []),
    "</task_notification>",
  ];
  return lines.join("\n");
}

interface RegisteredTask {
  task: BashTask;
  handle: ProcessSinkHandle;
  monitor?: TaskOutputMonitor;
}

export class BashTaskRegistry {
  private tasks = new Map<string, RegisteredTask>();
  private pendingNotifications: BashTaskNotification[] = [];
  private listeners = new Set<BashTaskListener>();
  private notificationListeners = new Set<(notification: BashTaskNotification) => void>();

  /**
   * 注册一个已转后台的任务，挂接终态回调与输出监控（订阅 + 看门狗）。
   * 调用方（bash executor）负责在转后台前先 ensureOutputFile。
   */
  register(input: {
    sessionId: string;
    command: string;
    intent?: string;
    cwd: string;
    handle: ProcessSinkHandle;
    outputFilePath?: string;
    monitor?: TaskOutputMonitor;
    subscriptionReason?: string;
    sandboxed?: boolean;
  }): BashTask {
    const task: BashTask = {
      taskId: createTaskId(),
      sessionId: input.sessionId,
      command: input.command,
      intent: input.intent,
      cwd: input.cwd,
      pid: input.handle.pid,
      outputFilePath: input.outputFilePath,
      status: "running",
      startedAt: Date.now(),
      notified: false,
      lastReadOffset: 0,
      sandboxed: input.sandboxed,
    };
    this.tasks.set(task.taskId, { task, handle: input.handle, monitor: input.monitor });

    // 输出订阅 + 卡死看门狗：转后台后才挂接（前台完成的命令输出已全量回填）
    input.monitor?.attach({
      onOutputMatch: (line) => {
        this.pushNotification({
          taskId: task.taskId,
          sessionId: task.sessionId,
          status: "output_match",
          text: formatTaskEventNotification(task, "output_match", line, input.subscriptionReason),
        });
      },
      onStall: (tailLine) => {
        this.pushNotification({
          taskId: task.taskId,
          sessionId: task.sessionId,
          status: "stalled",
          text: formatTaskEventNotification(task, "stalled", tailLine),
        });
      },
      onStallRecovered: () => {
        // 仅前端状态复位，不打扰模型
        this.emitNotificationEvent({
          taskId: task.taskId,
          sessionId: task.sessionId,
          status: "stall_recovered",
          text: "",
        });
      },
    });

    void input.handle.wait.then(async (status) => {
      input.monitor?.dispose();
      task.endedAt = Date.now();
      task.exitCode = status.exitCode;
      if (task.status === "running") {
        task.status = status.signal ? "killed" : status.exitCode === 0 ? "completed" : "failed";
      }
      if (status.truncated && status.signal) {
        task.diskCapHit = true;
      }
      if (!task.notified) {
        task.notified = true;
        const tail = await readOutputTail(task);
        this.pendingNotifications.push({
          taskId: task.taskId,
          sessionId: task.sessionId,
          status: task.status,
          text: formatTaskNotification(task, tail),
        });
      }
      for (const listener of this.listeners) {
        try {
          listener(task);
        } catch {
          // 监听者异常不影响注册表
        }
      }
    });

    return task;
  }

  get(taskId: string): BashTask | undefined {
    return this.tasks.get(taskId)?.task;
  }

  getHandle(taskId: string): ProcessSinkHandle | undefined {
    return this.tasks.get(taskId)?.handle;
  }

  listRunning(sessionId?: string): BashTask[] {
    return [...this.tasks.values()]
      .map((entry) => entry.task)
      .filter((task) => task.status === "running" && (!sessionId || task.sessionId === sessionId));
  }

  /** 模型已通过 bash_kill / bash_output 拿到终态结果时抑制冗余通知。 */
  suppressNotification(taskId: string): void {
    const entry = this.tasks.get(taskId);
    if (entry) entry.task.notified = true;
  }

  /** 取走该会话的待投递通知（turn 边界 steering 注入用）。 */
  drainPendingNotifications(sessionId: string): BashTaskNotification[] {
    const drained = this.pendingNotifications.filter((n) => n.sessionId === sessionId);
    this.pendingNotifications = this.pendingNotifications.filter((n) => n.sessionId !== sessionId);
    return drained;
  }

  /** 追加一条通知：进模型待投递队列 + 广播给通知监听者（前端推送）。 */
  pushNotification(notification: BashTaskNotification): void {
    this.pendingNotifications.push(notification);
    this.emitNotificationEvent(notification);
  }

  private emitNotificationEvent(notification: BashTaskNotification): void {
    for (const listener of this.notificationListeners) {
      try {
        listener(notification);
      } catch {
        // 监听者异常不影响注册表
      }
    }
  }

  /** 订阅任务终态（main 进程推前端）。返回退订函数。 */
  subscribe(listener: BashTaskListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 订阅通知事件（output_match / stalled / stall_recovered 的前端推送）。返回退订函数。 */
  subscribeNotifications(listener: (notification: BashTaskNotification) => void): () => void {
    this.notificationListeners.add(listener);
    return () => this.notificationListeners.delete(listener);
  }

  /** 杀掉指定任务（bash_kill / 用户 UI 操作）。 */
  kill(taskId: string): boolean {
    const entry = this.tasks.get(taskId);
    if (!entry || entry.task.status !== "running") return false;
    entry.task.status = "killed";
    entry.handle.kill();
    return true;
  }

  /** 会话收割：杀掉该会话全部 running 任务。 */
  harvestSession(sessionId: string): number {
    let count = 0;
    for (const entry of this.tasks.values()) {
      if (entry.task.sessionId === sessionId && entry.task.status === "running") {
        entry.task.status = "killed";
        entry.handle.kill();
        count++;
      }
    }
    return count;
  }

  /** 应用退出收割：杀掉所有 running 任务，绝不留孤儿 dev server。 */
  harvestAll(): number {
    let count = 0;
    for (const entry of this.tasks.values()) {
      if (entry.task.status === "running") {
        entry.task.status = "killed";
        entry.handle.kill();
        count++;
      }
    }
    return count;
  }

  /** 测试用：清空注册表状态（不杀进程，先 harvestAll）。 */
  clear(): void {
    for (const entry of this.tasks.values()) {
      entry.monitor?.dispose();
    }
    this.tasks.clear();
    this.pendingNotifications = [];
    this.listeners.clear();
    this.notificationListeners.clear();
  }
}

/** 模块级单例：跨 turn 存活（对照 agent-turn.ts activeTurnAborts 先例）。 */
export const bashTaskRegistry = new BashTaskRegistry();
