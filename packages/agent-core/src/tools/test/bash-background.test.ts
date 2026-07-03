import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bashExecutor, bashTaskRegistry, bashOutputTool, bashKillTool } from "../index";
import type { BashBackgroundedResult, BashTask } from "../index";

async function createWorkspace(): Promise<string> {
  return realpath(await mkdtemp(join(tmpdir(), "actspace-bash-bg-test-")));
}

async function createTmpRoot(): Promise<string> {
  return realpath(await mkdtemp(join(tmpdir(), "actspace-bash-bg-tmp-")));
}

async function backgroundTask(command: string, blockMs = 0): Promise<BashBackgroundedResult> {
  const workspace = await createWorkspace();
  const tmpRoot = await createTmpRoot();
  const result = await bashExecutor(
    { command, cwd: workspace, blockMs },
    workspace,
    { tmpRoot, sessionId: "sess-bg-test" },
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

afterEach(() => {
  bashTaskRegistry.harvestAll();
  bashTaskRegistry.clear();
});

describe("bash task registry lifecycle", () => {
  it("marks completed tasks and queues a task_notification", async () => {
    const data = await backgroundTask("printf done-marker; exit 0");
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

    const killed = bashTaskRegistry.harvestSession("sess-bg-test");
    expect(killed).toBe(1);

    const task = await waitForStatus(data.taskId);
    expect(task.status).toBe("killed");
  });
});

describe("bash_output tool", () => {
  it("returns incremental output and advances the read offset", async () => {
    const data = await backgroundTask("printf first-chunk; sleep 30");
    // 等首段输出落盘
    await new Promise((resolve) => setTimeout(resolve, 300));

    const first = await bashOutputTool.handler({ taskId: data.taskId });
    expect(first.success).toBe(true);
    expect(String(first.data)).toContain("first-chunk");

    const second = await bashOutputTool.handler({ taskId: data.taskId });
    expect(String(second.data)).toContain("(no new output)");
  });

  it("supports tail mode without advancing the offset", async () => {
    const data = await backgroundTask("printf 'l1\\nl2\\nl3\\n'; sleep 30");
    await new Promise((resolve) => setTimeout(resolve, 300));

    const tail = await bashOutputTool.handler({ taskId: data.taskId, tailLines: 2 });
    expect(String(tail.data)).toContain("l3");
    expect(String(tail.data)).not.toContain("l1\nl2\nl3");

    // tail 模式不吃掉增量
    const delta = await bashOutputTool.handler({ taskId: data.taskId });
    expect(String(delta.data)).toContain("l1");
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
        command: "printf 'booting\\nserver ready on :5173\\n'; sleep 30",
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
    const data = await backgroundTask("printf started; sleep 30");
    await new Promise((resolve) => setTimeout(resolve, 300));

    const result = await bashKillTool.handler({ taskId: data.taskId });
    expect(result.success).toBe(true);
    expect(String(result.data)).toContain("status=killed");
    expect(String(result.data)).toContain("started");

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
