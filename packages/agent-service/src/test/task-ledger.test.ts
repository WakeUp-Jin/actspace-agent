import { JsonlSessionStorage } from "@actspace/session-jsonl";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCoreCodecRegistry, createSessionHeader, validateSessionEvents } from "@actspace/session-journal";
import { SessionHandle, SessionStore } from "@actspace/session-persistence";
import { TaskLedger } from "../task-ledger.js";
import { taskCodecs, TASK_EVENT } from "../task-events.js";

const resources: Array<() => Promise<unknown>> = [];
afterEach(async () => { for (const dispose of resources.splice(0).reverse()) await dispose(); });
function registry() { const codecs = createCoreCodecRegistry(); for (const codec of taskCodecs) codecs.register(codec); return codecs; }
function header(sessionId: string) { return { sessionId, createdAt: "2026-10-03T00:00:00.000Z", lineage: null, createdWith: { profileId: "test", runtimeContractVersion: "1", manifestDigest: "test", plugins: [], codecSetDigest: registry().digest } }; }
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "actspace-tasks-"));
  resources.push(() => rm(root, { recursive: true, force: true }));
  const store = new SessionStore({ registry: registry() }, new JsonlSessionStorage({ dataRoot: root, runtimeId: "test", registry: registry() }));
  const session = await store.create(header("tasks"));
  resources.push(() => session.close());
  const ledger = await TaskLedger.open(session);
  return { store, session, ledger };
}
const harness = { harnessId: "main", generationId: "generation-1", revision: 1 };
function gate() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }

describe("durable content queue", () => {
  it("deduplicates concurrent submissions including object key order, after completion", async () => {
    const { ledger, session } = await fixture();
    const [a, b] = await Promise.all([ledger.submit("same", { a: 1, b: 2 }), ledger.submit("same", { b: 2, a: 1 })]);
    expect(a.task.taskId).toBe(b.task.taskId);
    expect(a.durableSeq).toBeGreaterThanOrEqual(a.task.acceptedSeq);
    expect(session.journal.events.filter(event => event.type === TASK_EVENT)).toHaveLength(1);
    await expect(ledger.submit("same", "different")).rejects.toMatchObject({ code: "SUBMISSION_CONFLICT" });
    await ledger.start(a.task.taskId, "run", harness, { model: "latest", mode: "plan" });
    await ledger.finish("run", "completed");
    expect((await ledger.submit("same", { a: 1, b: 2 })).task.state).toBe("completed");
    expect((await ledger.submit("new", { a: 1, b: 2 })).task.taskId).not.toBe(a.task.taskId);
  });

  it("does not expose or execute acceptance until flush succeeds", async () => {
    const blocked = gate(); const entered = gate(); let intercept = false;
    const session = SessionHandle.createEphemeral({ header: createSessionHeader(header("gated")), registry: registry(), onFlush: async () => { if (intercept) { entered.resolve(); await blocked.promise; } } });
    const ledger = await TaskLedger.open(session);
    intercept = true;
    const result = ledger.submit("id", "text");
    await entered.promise;
    expect(ledger.snapshot().tasks).toHaveLength(0);
    blocked.resolve();
    expect((await result).durableSeq).toBeNull();
    expect(ledger.snapshot().tasks).toHaveLength(1);
    await session.close();
  });

  it("blocks after a failed acceptance flush, including same-id retries", async () => {
    let fail = false;
    const session = SessionHandle.createEphemeral({ header: createSessionHeader(header("failure")), registry: registry(), onFlush: () => { if (fail) throw new Error("disk failure"); } });
    const ledger = await TaskLedger.open(session); fail = true;
    await expect(ledger.submit("id", "text")).rejects.toMatchObject({ code: "DURABILITY_BLOCKED" });
    expect(ledger.snapshot().tasks).toHaveLength(0);
    await expect(ledger.submit("id", "text")).rejects.toMatchObject({ code: "DURABILITY_BLOCKED" });
    expect(session.journal.events).toHaveLength(1);
    fail = false; await session.close();
  });

  it("keeps one task identity across designation, withdrawal and unread requeue", async () => {
    const { ledger, session } = await fixture();
    const a = await ledger.submit("a", "initial"); const b = await ledger.submit("b", "supplement");
    await ledger.start(a.task.taskId, "run", harness, {});
    await ledger.designate(b.task.taskId, "run", ledger.snapshot().revision);
    await ledger.designate(b.task.taskId, null, ledger.snapshot().revision);
    await ledger.designate(b.task.taskId, "run", ledger.snapshot().revision);
    await ledger.finish("run", "completed");
    expect(ledger.snapshot().tasks[1]).toMatchObject({ taskId: b.task.taskId, state: "pending", targetRunId: null });
    expect(session.journal.surface.entries).toHaveLength(1);
    await ledger.start(b.task.taskId, "next", { ...harness, generationId: "generation-2", revision: 2 }, { model: "new" });
    expect(session.journal.surface.entries).toHaveLength(2);
    expect(ledger.snapshot().runs[1].harness.revision).toBe(2);
  });

  it("serializes claim against withdrawal and never requeues consumed input", async () => {
    const { ledger } = await fixture();
    const a = await ledger.submit("a", "a"); const b = await ledger.submit("b", "b");
    await ledger.start(a.task.taskId, "run", harness, {});
    await ledger.designate(b.task.taskId, "run", ledger.snapshot().revision);
    const revision = ledger.snapshot().revision;
    const claim = ledger.claimSupplement("run");
    const withdraw = ledger.designate(b.task.taskId, null, revision);
    await expect(withdraw).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    expect(await claim).toHaveLength(1);
    expect(await ledger.claimSupplement("run")).toHaveLength(0);
    await ledger.finish("run", "interrupted");
    expect(ledger.snapshot().queue).toHaveLength(0);
    expect(ledger.snapshot().tasks.every(task => task.state === "interrupted")).toBe(true);
    const continuation = await ledger.submit("continue", "please continue", a.task.taskId);
    expect(continuation.task.taskId).not.toBe(a.task.taskId);
    expect(ledger.snapshot().paused).toBe(true);
  });

  it("persists ordering, rejects stale edits and leaves new submissions paused", async () => {
    const { ledger } = await fixture();
    const a = await ledger.submit("a", "a"); const b = await ledger.submit("b", "b");
    const old = ledger.snapshot().revision;
    await ledger.move(b.task.taskId, a.task.taskId, old);
    await expect(ledger.cancel(a.task.taskId, old)).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    await ledger.setPaused(true, ledger.snapshot().revision);
    await ledger.submit("c", "c");
    await expect(ledger.start(b.task.taskId, "run", harness, {})).rejects.toMatchObject({ code: "QUEUE_PAUSED" });
    await ledger.setPaused(false, ledger.snapshot().revision);
    await ledger.start(b.task.taskId, "run", harness, {});
    await ledger.finish("run", "failed");
    expect(ledger.snapshot().paused).toBe(true);
  });

  it("recovers interrupted runs with pending work paused and forks without parent queue or dedup", async () => {
    const { ledger, session, store } = await fixture();
    const a = await ledger.submit("a", "a"); const b = await ledger.submit("b", "b");
    await ledger.start(a.task.taskId, "run", harness, {});
    await ledger.designate(b.task.taskId, "run", ledger.snapshot().revision);
    await session.close();
    const reopened = await store.open("tasks"); resources.push(() => reopened.close());
    const recovered = await TaskLedger.open(reopened);
    expect(recovered.snapshot()).toMatchObject({ paused: true, runs: [{ state: "interrupted" }] });
    expect(recovered.snapshot().tasks[1]).toMatchObject({ state: "pending", targetRunId: null });
    const fork = await store.fork({ parentSessionId: "tasks", boundarySeq: reopened.lastSeq, newSessionId: "fork", createdAt: "2026-10-03T01:00:00.000Z", createdWith: header("fork").createdWith });
    resources.push(() => fork.close());
    const child = await TaskLedger.open(fork);
    expect(child.snapshot()).toMatchObject({ queue: [], tasks: [], runs: [], paused: false });
    expect(fork.journal.surface.entries).toHaveLength(1);
    expect((await child.submit("a", "new a")).task.state).toBe("pending");
    // Older readers must not silently execute a Session they cannot interpret.
    expect(validateSessionEvents(reopened.journal.events, createCoreCodecRegistry()).accessState).toBe("browse-only");
  });
});

it("keeps a failed terminal flush uncommitted and blocks the following Run", async () => {
  let fail = false;
  const session = SessionHandle.createEphemeral({ header: createSessionHeader(header("terminal-failure")), registry: registry(), onFlush: () => { if (fail) throw new Error("terminal fsync failed"); } });
  const ledger = await TaskLedger.open(session);
  const task = await ledger.submit("one", "one");
  await ledger.start(task.task.taskId, "run", harness, {});
  fail = true;
  await expect(ledger.finish("run", "completed")).rejects.toMatchObject({ code: "DURABILITY_BLOCKED" });
  expect(ledger.snapshot().runs[0].state).toBe("running");
  await expect(ledger.submit("two", "two")).rejects.toMatchObject({ code: "DURABILITY_BLOCKED" });
  fail = false; await session.close();
});

it("lets withdrawal win before claim without creating a replacement task", async () => {
  const { ledger } = await fixture();
  const a = await ledger.submit("a", "a"); const b = await ledger.submit("b", "b");
  await ledger.start(a.task.taskId, "run", harness, {});
  await ledger.designate(b.task.taskId, "run", ledger.snapshot().revision);
  const withdrawn = ledger.designate(b.task.taskId, null, ledger.snapshot().revision);
  const claimed = ledger.claimSupplement("run");
  await withdrawn; expect(await claimed).toEqual([]);
  expect(ledger.snapshot().tasks[1]).toMatchObject({ taskId: b.task.taskId, state: "pending" });
});

it("recovers a compact operation without creating a Run or replaying it", async () => {
  const { ledger, session } = await fixture();
  const receipt = await ledger.submit("compact", "/compact");
  await ledger.startOperation(receipt.task.taskId);
  expect(ledger.snapshot().runs).toEqual([]);
  expect(ledger.snapshot().tasks[0].state).toBe("claimed");
  const recovered = await TaskLedger.open(session);
  expect(recovered.snapshot()).toMatchObject({ paused: true, tasks: [{ state: "interrupted", runId: null }], runs: [] });
});
