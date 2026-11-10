import { MainAgentInbox } from "@actspace/agent";
import { createCoreCodecRegistry, createSessionHeader } from "@actspace/session-journal";
import { SessionHandle } from "@actspace/session-persistence";
import { BackgroundTaskRegistry, type BackgroundTaskSource, type BackgroundTaskTerminal } from "../index.js";

type Controlled = BackgroundTaskSource & { finish(terminal?: Partial<BackgroundTaskTerminal>): void; stopped: string[] };

function session(sessionId = "parent"): SessionHandle {
  const registry = createCoreCodecRegistry();
  return SessionHandle.createEphemeral({ registry, header: createSessionHeader({ sessionId, createdAt: "2026-10-22T00:00:00.000Z", lineage: null,
    createdWith: { profileId: "test", runtimeContractVersion: "1", manifestDigest: "test", plugins: [], codecSetDigest: registry.digest } }) });
}

function source(taskId: string, sessionId = "parent"): Controlled {
  let finish!: (terminal: BackgroundTaskTerminal) => void;
  const done = new Promise<BackgroundTaskTerminal>(resolve => { finish = resolve; });
  const stopped: string[] = [];
  return { taskId, kind: "bash", sessionId, callId: `call-${taskId}`, description: `task ${taskId}`, done, stopped,
    output: async () => ({ text: `output of ${taskId}` }),
    stop: async reason => { stopped.push(reason); finish({ status: "stopped", summary: "stopped", body: "" }); },
    finish: terminal => finish({ status: "completed", summary: `${taskId} completed`, body: "tail", exitCode: 0, ...terminal }) };
}

function setup(...ids: string[]) {
  const sessions = new Map(ids.map(id => [id, session(id)]));
  const wakes: string[] = [];
  const registry = new BackgroundTaskRegistry({ openSession: async id => sessions.get(id)!, wake: id => wakes.push(id), now: () => Date.parse("2026-10-22T06:00:00.000Z") });
  const facts = (id = ids[0]) => sessions.get(id)!.journal.events.filter(event => event.type === "background/task").map(event => event.data as Record<string, unknown>);
  const inbox = (id = ids[0]) => new MainAgentInbox(sessions.get(id)!);
  return { registry, sessions, wakes, facts, inbox };
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe("BackgroundTaskRegistry", () => {
  it("records start and settle, notifies once and wakes the Session", async () => {
    const { registry, wakes, facts, inbox } = setup("parent");
    const task = source("bash_1");
    await registry.register(task);
    expect(registry.list("parent", { activeOnly: true })).toEqual([expect.objectContaining({ taskId: "bash_1", status: "running" })]);
    task.finish();
    await flush(); await flush();
    expect(facts()).toEqual([expect.objectContaining({ op: "start", kind: "bash", callId: "call-bash_1" }), expect.objectContaining({ op: "settle", status: "completed", exitCode: 0, delivery: "notified" })]);
    const pending = inbox().pending();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ source: "task_notification", notice: { taskId: "bash_1", kind: "bash", title: "task bash_1", status: "completed" } });
    expect(String(pending[0].content)).toContain("<kind>bash</kind>");
    expect(String(pending[0].content)).toContain("<output_tail>");
    expect(wakes).toEqual(["parent"]);
    expect(registry.hasRunning("parent")).toBe(false);
  });

  it("reports through task_wait instead of a notification", async () => {
    const { registry, facts, inbox, wakes } = setup("parent");
    const task = source("bash_9");
    await registry.register(task);
    const waiting = registry.wait("parent", { timeoutMs: 1_000 });
    task.finish();
    await expect(waiting).resolves.toMatchObject({ status: "completed", task: { taskId: "bash_9", status: "completed" }, output: { text: "output of bash_9" } });
    expect(inbox().pending()).toEqual([]);
    expect(facts().at(-1)).toMatchObject({ op: "settle", delivery: "wait" });
    expect(wakes).toEqual([]);
  });

  it("discards an unread notification when task_wait reports an already settled task", async () => {
    const { registry, inbox } = setup("parent");
    const task = source("bash_1");
    await registry.register(task);
    task.finish();
    await flush(); await flush();
    expect(inbox().pending()).toHaveLength(1);
    await expect(registry.wait("parent", { taskId: "bash_1", timeoutMs: 10 })).resolves.toMatchObject({ status: "completed" });
    expect(inbox().pending()).toEqual([]);
  });

  it("stops without a notification", async () => {
    const { registry, facts, inbox, wakes } = setup("parent");
    const task = source("bash_1");
    await registry.register(task);
    await expect(registry.stop("parent", "bash_1", "user asked")).resolves.toMatchObject({ status: "stopped" });
    expect(task.stopped).toEqual(["user asked"]);
    expect(inbox().pending()).toEqual([]);
    expect(facts().at(-1)).toMatchObject({ op: "settle", status: "stopped", delivery: "stopped" });
    expect(wakes).toEqual([]);
  });

  it("stops for the user and tells the model at its next step without waking", async () => {
    const { registry, facts, inbox, wakes } = setup("parent");
    const task = source("bash_1");
    await registry.register({ ...task, bash: { command: "pnpm dev", cwd: "/work", sandboxed: true } });
    expect(registry.get("parent", "bash_1")).toMatchObject({ bash: { command: "pnpm dev", cwd: "/work", sandboxed: true } });
    await expect(registry.stopByUser("parent", "bash_1")).resolves.toMatchObject({ status: "stopped" });
    expect(task.stopped).toEqual(["user"]);
    expect(facts().at(-1)).toMatchObject({ op: "settle", status: "stopped", delivery: "stopped" });
    const pending = inbox().pending();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ source: "task_notification", notice: { taskId: "bash_1", kind: "bash", status: "stopped" } });
    expect(String(pending[0].content)).toContain("The user stopped background bash task");
    expect(wakes).toEqual([]);
    // Stopping an ended task again neither stops nor notifies twice.
    await registry.stopByUser("parent", "bash_1");
    expect(inbox().pending()).toHaveLength(1);
  });

  it("forgets ended tasks a rewind dropped, and keeps running tasks and other Sessions' tasks", async () => {
    const { registry } = setup("parent", "other");
    const ended = source("bash_1"), running = source("bash_2"), other = source("bash_3", "other");
    await registry.register(ended); await registry.register(running); await registry.register(other);
    ended.finish(); other.finish();
    await flush(); await flush();
    registry.forget("parent", ["bash_1", "bash_2", "bash_3", "missing"]);
    expect(registry.list("parent").map(task => task.taskId)).toEqual(["bash_2"]);
    expect(registry.list("other").map(task => task.taskId)).toEqual(["bash_3"]);
  });

  it("hides tasks owned by another Session", async () => {
    const { registry } = setup("parent", "other");
    await registry.register(source("bash_1", "other"));
    expect(registry.list("parent")).toEqual([]);
    expect(() => registry.get("parent", "bash_1")).toThrow(expect.objectContaining({ code: "TASK_NOT_FOUND" }));
    await expect(registry.stop("parent", "bash_1", "x")).rejects.toMatchObject({ code: "TASK_NOT_FOUND" });
  });

  it("times out without stopping and waits only for tasks running at call time", async () => {
    const { registry } = setup("parent");
    await expect(registry.wait("parent", { timeoutMs: 10 })).resolves.toEqual({ status: "no_running_tasks" });
    await registry.register(source("bash_1"));
    await expect(registry.wait("parent", { timeoutMs: 10 })).resolves.toMatchObject({ status: "timed_out", running: [expect.objectContaining({ taskId: "bash_1" })] });
    const controller = new AbortController();
    const waiting = registry.wait("parent", { timeoutMs: 1_000, signal: controller.signal });
    controller.abort();
    await expect(waiting).resolves.toMatchObject({ status: "interrupted" });
    expect(registry.hasRunning("parent")).toBe(true);
  });

  it("ignores agent tasks recorded by older versions", async () => {
    const first = setup("parent");
    const session = first.sessions.get("parent")!;
    await session.append({ type: "background/task", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { op: "start", taskId: "agent_old", kind: "agent", sessionId: "parent", callId: "call-old", description: "old agent", startedAt: "2026-10-22T00:00:00.000Z" }, surface: null } as never);
    await new BackgroundTaskRegistry({ openSession: async () => session, wake: () => undefined }).reconcile(session);
    expect(first.inbox().pending()).toEqual([]);
  });

  it("marks tasks from an earlier process as lost without waking", async () => {
    const first = setup("parent");
    await first.registry.register(source("bash_9"));
    const second = new BackgroundTaskRegistry({ openSession: async () => first.sessions.get("parent")!, wake: () => { throw new Error("must not wake"); } });
    await second.reconcile(first.sessions.get("parent")!);
    expect(first.facts().at(-1)).toMatchObject({ op: "settle", taskId: "bash_9", status: "lost", delivery: "lost" });
    expect(first.inbox().pending()).toEqual([expect.objectContaining({ notice: expect.objectContaining({ status: "lost" }) })]);
    await second.reconcile(first.sessions.get("parent")!);
    expect(first.inbox().pending()).toHaveLength(1);
  });

  it("names the Bash log in the completion notification and passes since to the source", async () => {
    const { registry, inbox } = setup("parent");
    const reads: (number | undefined)[] = [];
    const task = { ...source("bash_1"), bash: { command: "make", cwd: "/w", sandboxed: true, outputPath: "/data/sessions-v2/parent/bash-log/bash_1.log" }, output: async (options?: { since?: number }) => { reads.push(options?.since); return { text: "new", logSize: 9, nextOffset: 9 }; } };
    await registry.register(task);
    await expect(registry.output("parent", "bash_1", { since: 4 })).resolves.toMatchObject({ output: { text: "new", nextOffset: 9 } });
    expect(reads).toEqual([4]);
    task.finish();
    await flush(); await flush();
    const content = String(inbox().pending()[0].content);
    expect(content).toContain("</summary>\n<output_path>/data/sessions-v2/parent/bash-log/bash_1.log</output_path>\n<output_tail>");
  });

  it("records a pruned log once, for tasks of this or an earlier process, and reports it from task_output", async () => {
    const { registry, facts } = setup("parent");
    await registry.register({ ...source("bash_1"), bash: { command: "make", cwd: "/w", sandboxed: true, outputPath: "/logs/bash_1.log" } });
    await registry.markPruned("parent", "bash_1");
    await registry.markPruned("parent", "bash_1");
    await expect(registry.output("parent", "bash_1")).resolves.toMatchObject({ output: { text: "", outputPath: "/logs/bash_1.log", pruned: true } });
    // An earlier process's task is known from the Journal; a log that never became a task writes nothing.
    const earlier = setup("parent");
    await earlier.registry.register(source("bash_old"));
    await earlier.registry.dispose();
    const restarted = new BackgroundTaskRegistry({ openSession: async () => earlier.sessions.get("parent")!, wake: () => undefined, now: () => Date.parse("2026-10-22T07:00:00.000Z") });
    await restarted.markPruned("parent", "bash_old");
    await restarted.markPruned("parent", "bash_old");
    await restarted.markPruned("parent", "bash_foreground");
    await restarted.markPruned("other", "bash_1");
    expect(facts().filter(fact => fact.op === "prune")).toEqual([{ op: "prune", taskId: "bash_1", prunedAt: "2026-10-22T06:00:00.000Z", reason: "session-cap" }]);
    expect(earlier.facts().filter(fact => fact.op === "prune")).toEqual([{ op: "prune", taskId: "bash_old", prunedAt: "2026-10-22T07:00:00.000Z", reason: "session-cap" }]);
  });

  it("tells the model that an output subscription stopped, wakes it, and leaves the task running", async () => {
    const { registry, wakes, facts, inbox } = setup("parent");
    const task = source("bash_1");
    await registry.register(task);
    await registry.notifySubscriptionStopped("bash_1", "Stopped watching: the pattern took too long.");
    const pending = inbox().pending();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ source: "task_notification", notice: { taskId: "bash_1", kind: "bash", title: "task bash_1", status: "subscription_stopped" } });
    expect(String(pending[0].content)).toContain("<status>subscription_stopped</status>");
    expect(String(pending[0].content)).toContain("<summary>Stopped watching: the pattern took too long.</summary>");
    expect(String(pending[0].content)).not.toContain("<output_tail>");
    expect(wakes).toEqual(["parent"]);
    expect(registry.hasRunning("parent")).toBe(true);
    expect(facts().map(fact => fact.op)).toEqual(["start"]);

    task.finish();
    await flush(); await flush();
    await registry.notifySubscriptionStopped("bash_1", "late");
    expect(inbox().pending().map(item => item.notice?.status)).toEqual(["subscription_stopped", "completed"]);
  });

  it("stops running tasks on dispose and leaves them for restart reconciliation", async () => {
    const { registry, facts, inbox } = setup("parent");
    const task = source("bash_1");
    await registry.register(task);
    await registry.dispose();
    expect(task.stopped).toEqual(["host-shutdown"]);
    expect(facts().map(fact => fact.op)).toEqual(["start"]);
    expect(inbox().pending()).toEqual([]);
  });
});
