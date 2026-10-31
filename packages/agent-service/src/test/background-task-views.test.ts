import { expect, it, vi } from "vitest";
import { AgentApplication } from "../application.js";

const bash = { taskId: "bash_1", kind: "bash", callId: "call-1", description: "启动开发服务器", status: "running", startedAt: 1_000, bash: { command: "pnpm dev", cwd: "/work", sandboxed: true } };
const agent = { taskId: "agent_1", kind: "agent", callId: "call-2", description: "调研", status: "running", startedAt: 2_000 };

function app(backgroundTasks?: Record<string, unknown>) {
  const services: Record<string, unknown> = { "session.runtime": {}, "agent.runtime": { runs: { service: {} }, backgroundTasks } };
  return new AgentApplication({ get: (key: string) => services[key] } as never);
}

it("lists only background Bash commands, with where and how they run", () => {
  const list = vi.fn(() => [bash, agent, { ...bash, taskId: "bash_2", status: "completed", endedAt: 5_000, exitCode: 0 }]);
  expect(app({ list }).listBackgroundTasks("s")).toEqual([
    { taskId: "bash_1", callId: "call-1", description: "启动开发服务器", command: "pnpm dev", cwd: "/work", sandboxed: true, status: "running", startedAt: 1_000 },
    expect.objectContaining({ taskId: "bash_2", status: "completed", endedAt: 5_000, exitCode: 0 }),
  ]);
  expect(list).toHaveBeenCalledWith("s");
});

it("reads output and stops for the user, refusing background agents", async () => {
  const output = vi.fn(async (_sessionId: string, taskId: string) => ({ task: taskId === "agent_1" ? agent : bash, output: { text: "ready" } }));
  const stopByUser = vi.fn(async () => ({ ...bash, status: "stopped", endedAt: 3_000, exitCode: null }));
  const application = app({ list: () => [], output, stopByUser });
  await expect(application.readBackgroundTaskOutput("s", "bash_1")).resolves.toEqual({ task: expect.objectContaining({ taskId: "bash_1", command: "pnpm dev" }), text: "ready" });
  await expect(application.readBackgroundTaskOutput("s", "agent_1")).rejects.toThrow("is not a Bash command");
  await expect(application.stopBackgroundTask("s", "bash_1")).resolves.toMatchObject({ status: "stopped", exitCode: null });
  expect(stopByUser).toHaveBeenCalledWith("s", "bash_1");
});

it("says so when the runtime has no background task registry", async () => {
  const application = app();
  expect(application.listBackgroundTasks("s")).toEqual([]);
  await expect(application.stopBackgroundTask("s", "bash_1")).rejects.toThrow("Background tasks are unavailable");
});
