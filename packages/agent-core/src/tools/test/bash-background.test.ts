import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  bashExecutor,
  bashTaskRegistry,
  bashOutputTool,
  bashKillTool,
  DEFAULT_MAX_BACKGROUND_TASKS_PER_SESSION,
} from "../index";
import type { BashBackgroundedResult, BashExecutorConfig, BashTask } from "../index";

async function createWorkspace(): Promise<string> {
  return realpath(await mkdtemp(join(tmpdir(), "actspace-bash-bg-test-")));
}

async function createTmpRoot(): Promise<string> {
  return realpath(await mkdtemp(join(tmpdir(), "actspace-bash-bg-tmp-")));
}

async function backgroundTask(
  command: string,
  blockMs = 0,
  config: BashExecutorConfig = {},
): Promise<BashBackgroundedResult> {
  const workspace = await createWorkspace();
  const tmpRoot = await createTmpRoot();
  const result = await bashExecutor(
    { command, cwd: workspace, blockMs },
    workspace,
    { tmpRoot, sessionId: "sess-bg-test", ...config },
  );
  expect(result.success).toBe(true);
  return result.data as BashBackgroundedResult;
}

function waitForStatus(taskId: string, timeoutMs = 5_000): Promise<BashTask> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const poll = () => {
      const task = bashTaskRegistry.get(taskId);
      if (task && task.status !== "running") return resolve(task);
      if (Date.now() - startedAt > timeoutMs) return reject(new Error("task did not finish in time"));
      setTimeout(poll, 25);
    };
    poll();
  });
}

async function waitForNotification(taskId: string, timeoutMs = 2_000): Promise<string> {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const notification = bashTaskRegistry
      .drainPendingNotifications("sess-bg-test")
      .find((item) => item.taskId === taskId);
    if (notification) return notification.text;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`notification not received for ${taskId}`);
}

afterEach(async () => {
  const waits = bashTaskRegistry.listRunning().flatMap((task) => {
    const handle = bashTaskRegistry.getHandle(task.taskId);
    return handle ? [handle.wait] : [];
  });
  bashTaskRegistry.harvestAll();
  await Promise.all(waits);
  await new Promise((resolve) => setTimeout(resolve, 10));
  bashTaskRegistry.clear();
});

describe("bash task registry lifecycle", () => {
  it("uses a default per-session background task limit of 8", () => {
    expect(DEFAULT_MAX_BACKGROUND_TASKS_PER_SESSION).toBe(8);
  });

  it("marks completed tasks and queues a task_notification", async () => {
    // 注意：断言的关键词不能是命令文本的子串——通知/输出都会回显命令本身，
    // 否则断言会被命令回显「假阳性」满足（曾掩盖过转后台后停止写盘的 bug）。
    const data = await backgroundTask("printf 'done-%s' marker; exit 0");
    const task = await waitForStatus(data.taskId);

    expect(task.status).toBe("completed");
    expect(task.exitCode).toBe(0);

    const notifications = bashTaskRegistry.drainPendingNotifications("sess-bg-test");
    expect(notifications).toHaveLength(1);
    expect(notifications[0].text).toContain("<task_notification>");
    expect(notifications[0].text).toContain(data.taskId);
    expect(notifications[0].text).toContain("completed");
    expect(notifications[0].text).toContain("done-marker");

    // drain 后队列清空
    expect(bashTaskRegistry.drainPendingNotifications("sess-bg-test")).toHaveLength(0);
  });

  it("marks failed tasks with exit code", async () => {
    const data = await backgroundTask("exit 7");
    const task = await waitForStatus(data.taskId);

    expect(task.status).toBe("failed");
    expect(task.exitCode).toBe(7);
    const notifications = bashTaskRegistry.drainPendingNotifications("sess-bg-test");
    expect(notifications[0].text).toContain("failed");
  });

  it("drains notifications per session only", async () => {
    const data = await backgroundTask("exit 0");
    await waitForStatus(data.taskId);

    expect(bashTaskRegistry.drainPendingNotifications("other-session")).toHaveLength(0);
    expect(bashTaskRegistry.drainPendingNotifications("sess-bg-test")).toHaveLength(1);
  });

  it("harvestSession kills running tasks of that session", async () => {
    const data = await backgroundTask("sleep 30");
    expect(bashTaskRegistry.listRunning("sess-bg-test")).toHaveLength(1);
    const handle = bashTaskRegistry.getHandle(data.taskId);

    const killed = bashTaskRegistry.harvestSession("sess-bg-test");
    expect(killed).toBe(1);

    await handle?.wait;
    expect(bashTaskRegistry.get(data.taskId)?.status).toBe("killed");
  });

  it("kills a background task when its maximum runtime is reached", async () => {
    const data = await backgroundTask("sleep 30", 0, { maxRuntimeMs: 50 });
    const handle = bashTaskRegistry.getHandle(data.taskId);
    expect(handle).toBeDefined();
    await handle?.wait;
    const task = bashTaskRegistry.get(data.taskId);

    expect(task?.status).toBe("killed");
    expect(task?.maxRuntimeHit).toBe(true);
    expect(await waitForNotification(data.taskId)).toContain("maximum runtime reached");
  });

  it("reuses an identical running cwd + command instead of spawning again", async () => {
    const workspace = await createWorkspace();
    const tmpRoot = await createTmpRoot();
    const config = { tmpRoot, sessionId: "sess-bg-test", maxRuntimeMs: 30_000 };
    const args = { command: "sleep 30", cwd: workspace, blockMs: 0 };

    const first = await bashExecutor(args, workspace, config);
    const second = await bashExecutor({ ...args, cwd: join(workspace, ".") }, workspace, config);
    const firstData = first.data as BashBackgroundedResult;
    const secondData = second.data as BashBackgroundedResult;

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(secondData.reason).toBe("already_running");
    expect(secondData.taskId).toBe(firstData.taskId);
    expect(bashTaskRegistry.listRunning("sess-bg-test")).toHaveLength(1);
  });

  it("rejects a new background task when the per-session limit is reached", async () => {
    const workspace = await createWorkspace();
    const tmpRoot = await createTmpRoot();
    const config = {
      tmpRoot,
      sessionId: "sess-bg-test",
      maxRuntimeMs: 30_000,
      maxBackgroundTasksPerSession: 1,
    };

    const first = await bashExecutor({ command: "sleep 30", cwd: workspace, blockMs: 0 }, workspace, config);
    const second = await bashExecutor({ command: "sleep 31", cwd: workspace, blockMs: 0 }, workspace, config);

    expect(first.success).toBe(true);
    expect(second.success).toBe(false);
    expect(second.error).toContain("Background task limit reached for this session (1/1)");
    expect(bashTaskRegistry.listRunning("sess-bg-test")).toHaveLength(1);
  });
});

describe("bash_output tool", () => {
  it("returns incremental output and advances the read offset", async () => {
    // 'chunk-one' 不是命令文本的子串 → 断言只能被真实落盘输出满足
    const data = await backgroundTask("printf 'chunk-%s' one; sleep 30");
    // 等首段输出落盘
    await new Promise((resolve) => setTimeout(resolve, 300));

    const first = await bashOutputTool.handler({ taskId: data.taskId });
    expect(first.success).toBe(true);
    expect(String(first.data)).toContain("chunk-one");

    const second = await bashOutputTool.handler({ taskId: data.taskId });
    expect(String(second.data)).toContain("(no new output)");
  });

  it("supports tail mode without advancing the offset", async () => {
    // 输出 line-1/line-2/line-3；命令文本只含 'line-%s'，不会假阳性命中
    const data = await backgroundTask("printf 'line-%s\\n' 1 2 3; sleep 30");
    await new Promise((resolve) => setTimeout(resolve, 300));

    const tail = await bashOutputTool.handler({ taskId: data.taskId, tailLines: 2 });
    expect(String(tail.data)).toContain("line-3");
    expect(String(tail.data)).not.toContain("line-1\nline-2\nline-3");

    // tail 模式不吃掉增量
    const delta = await bashOutputTool.handler({ taskId: data.taskId });
    expect(String(delta.data)).toContain("line-1");
  });

  it("rejects unknown task ids", async () => {
    const result = await bashOutputTool.handler({ taskId: "bash_nonexistent" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Unknown background task");
  });

  it("suppresses the completion notification after the model reads a finished task", async () => {
    const data = await backgroundTask("exit 0");
    await waitForStatus(data.taskId);

    await bashOutputTool.handler({ taskId: data.taskId });
    // 已读过终态 → 该任务不再需要通知；队列里此前的通知仍会被 drain（先到先得），
    // 但 notified 标志保证后续不再重复入队。
    expect(bashTaskRegistry.get(data.taskId)?.notified).toBe(true);
  });
});

describe("notifyOnOutput subscription (integration)", () => {
  it("queues an output_match notification when a background task's output matches", async () => {
    const workspace = await createWorkspace();
    const tmpRoot = await createTmpRoot();
    const result = await bashExecutor(
      {
        // 输出 'server ready on :5173'；命令文本只含 ':%s'，通知内容断言不会被命令回显假阳性满足
        command: "printf 'booting\\nserver ready on :%s\\n' 5173; sleep 30",
        cwd: workspace,
        blockMs: 0,
        notifyOnOutput: { pattern: "ready on", reason: "dev server ready" },
      },
      workspace,
      { tmpRoot, sessionId: "sess-bg-test" },
    );
    expect(result.success).toBe(true);
    const data = result.data as BashBackgroundedResult;

    // 等输出经过 onChunk 扫描
    await new Promise((resolve) => setTimeout(resolve, 400));

    const notifications = bashTaskRegistry.drainPendingNotifications("sess-bg-test");
    expect(notifications).toHaveLength(1);
    expect(notifications[0].status).toBe("output_match");
    expect(notifications[0].taskId).toBe(data.taskId);
    expect(notifications[0].text).toContain("dev server ready");
    expect(notifications[0].text).toContain("server ready on :5173");
  });

  it("rejects invalid notifyOnOutput patterns before spawning", async () => {
    const workspace = await createWorkspace();
    const result = await bashExecutor(
      {
        command: "printf hi",
        cwd: workspace,
        notifyOnOutput: { pattern: "([unclosed", reason: "bad regex" },
      },
      workspace,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("not a valid regex");
  });

  it("rejects notifyOnOutput without a reason", async () => {
    const workspace = await createWorkspace();
    const result = await bashExecutor(
      { command: "printf hi", cwd: workspace, notifyOnOutput: { pattern: "ok" } },
      workspace,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("reason is required");
  });
});

describe("bash_kill tool", () => {
  it("kills a running task and returns the output tail", async () => {
    // 输出 'boot-ok'；命令文本只含 'boot-%s'，输出尾断言不会被命令回显假阳性满足
    const data = await backgroundTask("printf 'boot-%s' ok; sleep 30");
    await new Promise((resolve) => setTimeout(resolve, 300));
    // 清掉前序用例被 afterEach harvest 杀掉后异步落队的遗留通知（跨用例隔离）
    bashTaskRegistry.drainPendingNotifications("sess-bg-test");

    const result = await bashKillTool.handler({ taskId: data.taskId });
    expect(result.success).toBe(true);
    expect(String(result.data)).toContain("status=killed");
    expect(String(result.data)).toContain("boot-ok");

    // kill 结果已在工具返回里 → 不再投递终态通知
    expect(bashTaskRegistry.drainPendingNotifications("sess-bg-test")).toHaveLength(0);
  });

  it("is a no-op for already finished tasks", async () => {
    const data = await backgroundTask("exit 0");
    await waitForStatus(data.taskId);

    const result = await bashKillTool.handler({ taskId: data.taskId });
    expect(result.success).toBe(true);
    expect(String(result.data)).toContain("already finished");
  });
});
