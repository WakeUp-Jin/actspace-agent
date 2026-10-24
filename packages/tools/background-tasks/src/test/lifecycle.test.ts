import { MainAgentInbox } from "@actspace/core-agent";
import { BackgroundTaskRegistry, type BackgroundTaskSource, type BackgroundTaskTerminal } from "@actspace/background-tasks";
import { createCoreCodecRegistry, createSessionHeader } from "@actspace/session-journal";
import { SessionHandle } from "@actspace/session-persistence";
import { ToolRuntime, type ToolPreparedEnvironment } from "@actspace/tools-runtime";
import { apply } from "../plugin.js";

function session(sessionId: string): SessionHandle {
  const registry = createCoreCodecRegistry();
  return SessionHandle.createEphemeral({ registry, header: createSessionHeader({ sessionId, createdAt: "2026-10-22T00:00:00.000Z", lineage: null,
    createdWith: { profileId: "test", runtimeContractVersion: "1", manifestDigest: "test", plugins: [], codecSetDigest: registry.digest } }) });
}

function source(taskId: string, sessionId = "parent"): BackgroundTaskSource & { finish(): void } {
  let finish!: (terminal: BackgroundTaskTerminal) => void;
  const done = new Promise<BackgroundTaskTerminal>(resolve => { finish = resolve; });
  return { taskId, kind: "bash", sessionId, callId: `call-${taskId}`, description: `run ${taskId}`, done,
    output: async () => ({ text: `tail of ${taskId}`, outputPath: `/tmp/${taskId}.log` }),
    stop: async () => finish({ status: "stopped", summary: "stopped", body: "" }),
    finish: () => finish({ status: "completed", summary: "done", body: "ok", exitCode: 0 }) };
}

function setup() {
  const sessions = new Map(["parent", "other"].map(id => [id, session(id)]));
  const registry = new BackgroundTaskRegistry({ openSession: async id => sessions.get(id)!, wake: () => undefined, now: () => Date.parse("2026-10-22T06:00:00.000Z") });
  const tools = new ToolRuntime();
  let cleanup: (() => Promise<void>) | undefined;
  apply({ get: (id: string) => ({ "tools.runtime": tools, "actspace.host.background-tasks": registry })[id], provide: () => undefined, effect: (factory: () => () => Promise<void>) => { cleanup = factory(); } } as never);
  const env: ToolPreparedEnvironment = {
    workspaceRoot: "/workspace", hostCapabilities: new Set(), capabilitySet: { ids: [], has: () => false, get: () => { throw Error("unused"); } },
    journal: { recordDispatch: async () => {}, checkpointBeforeBody: async () => {}, commitResult: async () => {} }, createArtifact: async () => { throw Error("unused"); },
  };
  const run = async (name: string, args: unknown, sessionId = "parent") => {
    const [result] = await tools.executeBatch([{ name, callId: `${name}-${Math.random()}`, arguments: args, sessionId, agentRunId: "run", turnId: "turn", stepId: "step" }], env);
    return { status: result!.status, text: JSON.stringify(result) };
  };
  return { registry, sessions, run, cleanup: () => cleanup!() };
}

describe("background task tools", () => {
  it("lists, reads and stops tasks of the calling Session only", async () => {
    const { registry, sessions, run, cleanup } = setup();
    await registry.register(source("bash_1"));
    const listed = await run("task_list", {});
    expect(listed.text).toContain("active_background_tasks: 1");
    expect(listed.text).toContain("task_id: bash_1");
    expect(listed.text).toContain("started_at: 2026-10-22T06:00:00.000Z");
    expect((await run("task_output", { taskId: "bash_1" })).text).toContain("output_path: /tmp/bash_1.log");
    const foreign = await run("task_output", { taskId: "bash_1" }, "other");
    expect(foreign.status).toBe("failed");
    expect(foreign.text).toContain("TASK_NOT_FOUND");
    expect((await run("task_stop", { taskId: "bash_1" })).text).toContain("status: stopped");
    expect(new MainAgentInbox(sessions.get("parent")!).pending()).toEqual([]);
    expect((await run("task_list", { activeOnly: false })).text).toContain("background_tasks: 1");
    await cleanup();
    await expect(run("task_list", {})).rejects.toMatchObject({ failure: { code: "TOOL_NOT_FOUND" } });
  });

  it("waits for a running task and reports it instead of a notification", async () => {
    const { registry, sessions, run } = setup();
    const task = source("bash_2");
    await registry.register(task);
    const waiting = run("task_wait", { timeoutSeconds: 5 });
    setTimeout(() => task.finish(), 5);
    const result = await waiting;
    expect(result.text).toContain("wait_status: completed");
    expect(result.text).toContain("tail of bash_2");
    expect(new MainAgentInbox(sessions.get("parent")!).pending()).toEqual([]);
    expect((await run("task_wait", { timeoutSeconds: 1 })).text).toContain("no_running_tasks");
  });

  it("rejects an out-of-range timeout", async () => {
    const { run } = setup();
    const result = await run("task_wait", { timeoutSeconds: 500 });
    expect(result.status).toBe("failed");
  });
});
