import { JsonlSessionStorage } from "@actspace/session-jsonl";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCoreCodecRegistry, createSessionHeader, validateSessionEvents } from "@actspace/session-journal";
import { SessionHandle, SessionStore } from "@actspace/session-persistence";
import { TaskLedger } from "../task-ledger.js";
import { taskCodecs, TASK_EVENT, RUN_EVENT, QUEUE_EVENT, QUEUE_RETURN_EVENT, eventCandidate } from "../task-events.js";
import { projectTasks } from "../task-projection.js";

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
  it("does not poison the ledger when only the completed envelope exceeds the record limit", async () => {
    const { ledger, session } = await fixture();
    await expect(ledger.submit("near-limit", "x".repeat(1024 * 1024 - 250))).rejects.toMatchObject({ code: "INVALID_EVENT" });
    expect(session.lastSeq).toBe(-1);
    expect(ledger.blocked).toBe(false);
    expect((await ledger.submit("valid", "ok")).task.state).toBe("pending");
  });
  it("recovers and continues when individually valid tasks exceed 1 MiB in aggregate", async () => {
    const { ledger, session, store } = await fixture();
    const content = { text: "x".repeat(600_000) };
    await ledger.submit("large-a", content);
    const second = await ledger.submit("large-b", content);
    expect(ledger.blocked).toBe(false);
    expect(Buffer.byteLength(JSON.stringify(ledger.snapshot()))).toBeGreaterThan(1024 * 1024);
    expect(Object.isFrozen(ledger.snapshot().tasks[0]!.content)).toBe(true);
    expect((await ledger.submit("large-b", content)).task.taskId).toBe(second.task.taskId);
    const seq = session.lastSeq;
    expect(() => ledger.submit("oversized", "x".repeat(1024 * 1024))).toThrow("1 MiB");
    expect(session.lastSeq).toBe(seq);
    expect(ledger.blocked).toBe(false);
    await session.close();
    const reopened = await store.open("tasks"); resources.push(() => reopened.close());
    const recovered = await TaskLedger.open(reopened);
    expect(recovered.snapshot().tasks).toHaveLength(2);
    expect((await recovered.submit("large-b", content)).task.taskId).toBe(second.task.taskId);
    await recovered.setPaused(false, recovered.snapshot().revision);
    await recovered.start(recovered.snapshot().queue[0]!, "after-reopen", harness, {});
    await recovered.finish("after-reopen", "completed");
    expect((await recovered.submit("next", "ok")).task.state).toBe("pending");
  });
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

  it("returns withdrawn steering to the ordinary queue front without replacing its identity", async () => {
    const { ledger } = await fixture();
    const initial = await ledger.submit("initial", "initial");
    await ledger.start(initial.task.taskId, "run", harness, {});
    const first = await ledger.submit("first", "FIRST");
    const second = await ledger.submit("second", "SECOND");
    const third = await ledger.submit("third", "THIRD");
    await ledger.designate(second.task.taskId, "run", ledger.snapshot().revision);
    await ledger.designate(second.task.taskId, null, ledger.snapshot().revision);
    expect(ledger.snapshot().queue).toEqual([second.task.taskId, first.task.taskId, third.task.taskId]);
    expect((await ledger.submit("second", "SECOND")).task.taskId).toBe(second.task.taskId);
    expect(await ledger.claimSupplement("run")).toEqual([]);
    await ledger.finish("run", "completed");
    const consumed: unknown[] = [];
    for (const task of [second, first, third]) {
      consumed.push((await ledger.start(task.task.taskId, `run-${task.task.submissionId}`, harness, {})).content);
      await ledger.finish(`run-${task.task.submissionId}`, "completed");
    }
    expect(consumed).toEqual(["SECOND", "FIRST", "THIRD"]);
    expect(ledger.snapshot().queue).toEqual([]);
  });

  it.each(["completed", "failed", "cancelled", "interrupted"] as const)("returns unread steering together in queue order on %s", async outcome => {
    const { ledger } = await fixture();
    const initial = await ledger.submit("initial", "initial");
    await ledger.start(initial.task.taskId, "run", harness, {});
    const receipts = [];
    for (const id of ["first", "second", "third", "fourth"]) receipts.push(await ledger.submit(id, id));
    const ids = receipts.map(receipt => receipt.task.taskId);
    // Designation order is deliberately different from the durable queue order.
    await ledger.designate(ids[3]!, "run", ledger.snapshot().revision);
    await ledger.designate(ids[1]!, "run", ledger.snapshot().revision);
    await ledger.finish("run", outcome);
    expect(ledger.snapshot().queue).toEqual([ids[1], ids[3], ids[0], ids[2]]);
    expect(ledger.snapshot().paused).toBe(outcome !== "completed");
    expect(ledger.snapshot().tasks.filter(task => task.state === "pending").every(task => task.targetRunId === null)).toBe(true);
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

  it("durably returns unread steering before recovery, pauses it and preserves the order on reopen", async () => {
    const { ledger, session, store } = await fixture();
    const initial = await ledger.submit("initial", "initial");
    await ledger.start(initial.task.taskId, "run", harness, {});
    const first = await ledger.submit("first", "FIRST");
    const second = await ledger.submit("second", "SECOND");
    const third = await ledger.submit("third", "THIRD");
    await ledger.designate(third.task.taskId, "run", ledger.snapshot().revision);
    await ledger.designate(second.task.taskId, "run", ledger.snapshot().revision);
    await session.close();
    const reopened = await store.open("tasks"); resources.push(() => reopened.close());
    const recovered = await TaskLedger.open(reopened);
    expect(recovered.snapshot().queue).toEqual([second.task.taskId, third.task.taskId, first.task.taskId]);
    expect(recovered.snapshot().paused).toBe(true);
    expect(recovered.snapshot().runs[0].state).toBe("interrupted");
    await expect(recovered.start(second.task.taskId, "too-early", harness, {})).rejects.toMatchObject({ code: "QUEUE_PAUSED" });
    await recovered.setPaused(false, recovered.snapshot().revision);
    await recovered.start(second.task.taskId, "next", harness, {});
    expect(recovered.snapshot().tasks.find(task => task.taskId === second.task.taskId)?.state).toBe("claimed");
    expect(reopened.journal.events.filter(event => event.type === QUEUE_RETURN_EVENT)).toHaveLength(1);
  });

  it.each(["withdraw", "finish", "recover"] as const)("keeps legacy %s ordering and makes new returns browse-only for old readers", async operation => {
    const { ledger, session } = await fixture();
    const initial = await ledger.submit("initial", "initial");
    await ledger.start(initial.task.taskId, "run", harness, {});
    const first = await ledger.submit("first", "FIRST");
    const second = await ledger.submit("second", "SECOND");
    await ledger.designate(second.task.taskId, "run", ledger.snapshot().revision);
    const legacy = operation === "withdraw"
      ? eventCandidate(TASK_EVENT, { op: "designate", sessionId: "tasks", taskId: second.task.taskId, runId: null })
      : operation === "finish"
        ? eventCandidate(RUN_EVENT, { op: "finish", sessionId: "tasks", runId: "run", outcome: "completed", result: null })
        : eventCandidate(QUEUE_EVENT, { op: "recover", sessionId: "tasks" });
    const last = session.journal.events.at(-1)!;
    const events = [...session.journal.events, { ...last, ...legacy, seq: last.seq + 1 }];
    expect(projectTasks("tasks", events).queue).toEqual([first.task.taskId, second.task.taskId]);
    await ledger.designate(second.task.taskId, null, ledger.snapshot().revision);
    const oldReader = createCoreCodecRegistry();
    taskCodecs.filter(codec => codec.type !== QUEUE_RETURN_EVENT).forEach(codec => oldReader.register(codec));
    expect(validateSessionEvents(session.journal.events, oldReader).accessState).toBe("browse-only");
  });

  it("rejects forged return facts for consumed tasks, other runs, duplicate IDs and reversed order", async () => {
    const { ledger, session } = await fixture();
    const initial = await ledger.submit("initial", "initial");
    await ledger.start(initial.task.taskId, "run", harness, {});
    const first = await ledger.submit("first", "FIRST");
    const second = await ledger.submit("second", "SECOND");
    await ledger.designate(first.task.taskId, "run", ledger.snapshot().revision);
    await ledger.designate(second.task.taskId, "run", ledger.snapshot().revision);
    const base = { op: "return-steering" as const, sessionId: "tasks", runId: "run", placement: "front" as const };
    for (const taskIds of [[], [first.task.taskId, first.task.taskId]]) {
      expect(() => eventCandidate(QUEUE_RETURN_EVENT, { ...base, taskIds })).toThrow();
    }
    for (const data of [
      { ...base, taskIds: [initial.task.taskId] },
      { ...base, runId: "other", taskIds: [first.task.taskId] },
      { ...base, taskIds: [second.task.taskId, first.task.taskId] },
    ]) {
      const candidate = eventCandidate(QUEUE_RETURN_EVENT, data);
      const last = session.journal.events.at(-1)!;
      expect(() => projectTasks("tasks", [...session.journal.events, { ...last, ...candidate, seq: last.seq + 1 }])).toThrow();
    }
    expect(ledger.snapshot().queue).toEqual([first.task.taskId, second.task.taskId]);
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
  const first = await ledger.submit("first", "first");
  const steering = await ledger.submit("steering", "steering");
  await ledger.designate(steering.task.taskId, "run", ledger.snapshot().revision);
  const before = ledger.snapshot();
  fail = true;
  await expect(ledger.finish("run", "completed")).rejects.toMatchObject({ code: "DURABILITY_BLOCKED" });
  expect(ledger.snapshot().runs[0].state).toBe("running");
  expect(ledger.snapshot().queue).toEqual([first.task.taskId, steering.task.taskId]);
  expect(ledger.snapshot()).toEqual(before);
  expect(ledger.snapshot().tasks.find(item => item.taskId === steering.task.taskId)?.targetRunId).toBe("run");
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
