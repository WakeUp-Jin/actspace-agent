import { MainAgentInbox } from "@actspace/core-agent";
import { createCoreCodecRegistry, createSessionHeader } from "@actspace/session-journal";
import { SessionHandle } from "@actspace/session-persistence";
import { BackgroundTaskRegistry, type BackgroundTaskSource, type BackgroundTaskTerminal } from "../index.js";

type Controlled = BackgroundTaskSource & { finish(terminal?: Partial<BackgroundTaskTerminal>): void; stopped: string[] };

function session(sessionId = "parent"): SessionHandle {
  const registry = createCoreCodecRegistry();
  return SessionHandle.createEphemeral({ registry, header: createSessionHeader({ sessionId, createdAt: "2026-10-22T00:00:00.000Z", lineage: null,
    createdWith: { profileId: "test", runtimeContractVersion: "1", manifestDigest: "test", plugins: [], codecSetDigest: registry.digest } }) });
}

function source(taskId: string, sessionId = "parent", kind: "bash" | "agent" = "bash"): Controlled {
  let finish!: (terminal: BackgroundTaskTerminal) => void;
  const done = new Promise<BackgroundTaskTerminal>(resolve => { finish = resolve; });
  const stopped: string[] = [];
  return { taskId, kind, sessionId, callId: `call-${taskId}`, description: `task ${taskId}`, done, stopped,
    output: async () => ({ text: `output of ${taskId}` }),
    stop: async reason => { stopped.push(reason); finish({ status: "stopped", summary: "stopped", body: "" }); },
    finish: terminal => finish({ status: "completed", summary: `${taskId} completed`, body: "tail", exitCode: 0, ...terminal }) };
}

function setup(...ids: string[]) {
  const sessions = new Map(ids.map(id => [id, session(id)]));
  const wakes: string[] = [];
  const registry = new BackgroundTaskRegistry({ openSession: async id => sessions.get(id)!, wake: id => wakes.push(id), now: () => Date.parse("2026-10-22T06:00:00.000Z") });
  const facts = (id = ids[0]!) => sessions.get(id)!.journal.events.filter(event => event.type === "background/task").map(event => event.data as Record<string, unknown>);
  const inbox = (id = ids[0]!) => new MainAgentInbox(sessions.get(id)!);
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
    expect(String(pending[0]!.content)).toContain("<kind>bash</kind>");
    expect(String(pending[0]!.content)).toContain("<output_tail>");
    expect(wakes).toEqual(["parent"]);
    expect(registry.hasRunning("parent")).toBe(false);
  });

  it("reports through task_wait instead of a notification", async () => {
    const { registry, facts, inbox, wakes } = setup("parent");
    const task = source("agent_1", "parent", "agent");
    await registry.register(task);
    const waiting = registry.wait("parent", { timeoutMs: 1_000 });
    task.finish();
    await expect(waiting).resolves.toMatchObject({ status: "completed", task: { taskId: "agent_1", status: "completed" }, output: { text: "output of agent_1" } });
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
    expect(String(pending[0]!.content)).toContain("The user stopped background bash task");
    expect(wakes).toEqual([]);
    // Stopping an ended task again neither stops nor notifies twice.
    await registry.stopByUser("parent", "bash_1");
    expect(inbox().pending()).toHaveLength(1);
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

  it("marks tasks from an earlier process as lost without waking", async () => {
    const first = setup("parent");
    await first.registry.register(source("agent_1", "parent", "agent"));
    const second = new BackgroundTaskRegistry({ openSession: async () => first.sessions.get("parent")!, wake: () => { throw new Error("must not wake"); } });
    await second.reconcile(first.sessions.get("parent")!);
    expect(first.facts().at(-1)).toMatchObject({ op: "settle", taskId: "agent_1", status: "lost", delivery: "lost" });
    expect(first.inbox().pending()).toEqual([expect.objectContaining({ notice: expect.objectContaining({ status: "lost" }) })]);
    await second.reconcile(first.sessions.get("parent")!);
    expect(first.inbox().pending()).toHaveLength(1);
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
