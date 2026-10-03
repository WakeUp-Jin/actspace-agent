import { AgentScope } from "@actspace/core-scope";
import { describe, expect, it, vi } from "vitest";
import { createCoreCodecRegistry, createSessionHeader } from "@actspace/session-journal";
import { SessionHandle } from "@actspace/session-persistence";
import { taskCodecs } from "../task-events.js";
import { TaskLedger } from "../task-ledger.js";
import { SessionRunManager, type RunFactory } from "../run-manager.js";
import { ExecutionBudget, RunBudget } from "../execution-budget.js";

function gate() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
async function fixture(factory: RunFactory, release: () => Promise<void> = async () => {}, beforeAcquire: () => Promise<void> = async () => {}) {
  const registry = createCoreCodecRegistry(); taskCodecs.forEach(codec => registry.register(codec));
  const session = SessionHandle.createEphemeral({ registry, header: createSessionHeader({ sessionId: "runs", createdAt: "2026-10-03T00:00:00Z", lineage: null, createdWith: { profileId: "test", runtimeContractVersion: "1", manifestDigest: "test", plugins: [], codecSetDigest: registry.digest } }) });
  const ledger = await TaskLedger.open(session);
  let model = "first"; let mode: "plan" | "agent" = "plan"; let acquired = 0;
  const manager = new SessionRunManager({ ledger, harnessId: "main", readConfiguration: () => ({ model, mode }), acquire: async () => {
    await beforeAcquire();
    acquired++;
    return { scope: new AgentScope("test-run"), context: {}, executionDigest: "stable-content", harnessId: "main", generationId: `g${acquired}`, revision: acquired, getService: <T>() => factory as T, release };
  } });
  return { manager, ledger, session, setConfig: (next: string) => { model = next; mode = "agent"; }, acquired: () => acquired };
}

describe("SessionRunManager", () => {
  it("creates nothing on session open, reads latest config at consumption and keeps mode fixed", async () => {
    const ready = gate(); const proceed = gate(); const seen: unknown[] = []; let count = 0; let released = 0; let disposed = 0;
    const fixtureState = await fixture({ create: async input => ({ execute: async () => {
      count++; seen.push(input.configuration);
      if (count === 1) { ready.resolve(); await proceed.promise; const supplement = await input.claimSupplements(); seen.push(supplement.configuration); expect(supplement.tasks).toHaveLength(1); }
      return { outcome: "completed", value: "ok" };
    }, dispose: async () => { disposed++; } }) }, async () => { released++; });
    const { manager, ledger } = fixtureState;
    expect(fixtureState.acquired()).toBe(0);
    await manager.submit("first", "first"); await ready.promise;
    const second = await manager.submit("second", "second");
    await ledger.designate(second.task.taskId, manager.activeRunId, ledger.snapshot().revision);
    await manager.submit("third", "third");
    fixtureState.setConfig("latest"); proceed.resolve();
    await manager.waitForIdle();
    expect(seen).toEqual([{ model: "first", mode: "plan" }, { model: "latest", mode: "plan" }, { model: "latest", mode: "agent" }]);
    expect(fixtureState.acquired()).toBe(2); expect(released).toBe(2); expect(disposed).toBe(2);
    expect(ledger.snapshot().tasks.map(task => task.state)).toEqual(["completed", "completed", "completed"]);
    await manager.dispose(); await fixtureState.session.close();
  });

  it("pins cancellation to a Run and waits for cleanup before releasing the lease", async () => {
    const entered = gate(); const stopped = gate(); const order: string[] = [];
    const { manager, ledger, session } = await fixture({ create: async input => ({
      execute: async () => { entered.resolve(); await new Promise<void>(resolve => { input.signal.addEventListener("abort", () => resolve(), { once: true }); }); stopped.resolve(); return { outcome: "cancelled", value: null }; },
      dispose: async () => { order.push("dispose"); },
    }) }, async () => { order.push("release"); });
    await manager.submit("one", "one"); await entered.promise;
    await manager.submit("two", "two");
    expect(await manager.stop("old-run")).toBe(false);
    expect(await manager.stop(manager.activeRunId!)).toBe(true);
    await stopped.promise; await manager.waitForIdle();
    expect(order).toEqual(["dispose", "release"]);
    expect(ledger.snapshot()).toMatchObject({ paused: true, tasks: [{ state: "cancelled" }, { state: "pending" }] });
    await manager.dispose(); await session.close();
  });

  it("releases a lease and persists failed outcome when factory creation throws", async () => {
    let released = 0;
    const { manager, ledger, session } = await fixture({ create: async () => { throw new Error("factory failure"); } }, async () => { released++; });
    await manager.submit("one", "one"); await manager.waitForIdle();
    expect(released).toBe(1);
    expect(ledger.snapshot()).toMatchObject({ paused: true, runs: [{ state: "failed" }], tasks: [{ state: "failed" }] });
    expect(manager.failure).toBeInstanceOf(AggregateError);
    await manager.dispose(); await manager.dispose(); await session.close();
  });

  it("does not create the next instance until previous disposal settles", async () => {
    const entered = gate(); const cleanup = gate(); let created = 0;
    const { manager, session } = await fixture({ create: async () => { created++; return {
      execute: async () => ({ outcome: "completed", value: null }),
      dispose: async () => { if (created === 1) { entered.resolve(); await cleanup.promise; } },
    }; } });
    await manager.submit("a", "a"); await entered.promise;
    await manager.submit("b", "b"); expect(created).toBe(1);
    cleanup.resolve(); await manager.waitForIdle(); expect(created).toBe(2);
    await manager.dispose(); await session.close();
  });
});

describe("execution budget", () => {
  it("pauses overlapping approvals once but keeps the absolute deadline", () => {
    let now = 0; const budget = new ExecutionBudget(100, 500, { monotonic: () => now, wall: () => now });
    now = 10; budget.waitForApproval("a"); budget.waitForApproval("a");
    now = 40; budget.waitForApproval("b");
    now = 100; budget.settleApproval("a");
    now = 200; budget.settleApproval("b");
    expect(budget.remainingMs()).toBe(90);
    now = 220; budget.waitForApproval("c");
    now = 500; expect(budget.expired).toBe(true); expect(budget.remainingMs()).toBe(0);
    budget.settleApproval("c"); expect(budget.expired).toBe(true);
  });
});

it("retains the generation when stop-and-join cannot prove disposal", async () => {
  let releases = 0;
  const { manager, ledger, session } = await fixture({ create: async () => ({ execute: async () => ({ outcome: "completed", value: "answer" }), dispose: async () => { throw new Error("still using generation"); } }) }, async () => { releases++; });
  await manager.submit("one", "one"); await manager.waitForIdle();
  expect(releases).toBe(0);
  expect(ledger.snapshot().runs[0]).toMatchObject({ state: "failed", result: null });
  await expect(manager.resume(ledger.snapshot().revision)).rejects.toThrow("failed");
  await expect(manager.dispose()).rejects.toThrow("failed"); await session.close();
});

it("reserves manual operations against new Runs while allowing content acceptance", async () => {
  const entered = gate(); const leave = gate(); let created = 0;
  const { manager, ledger, session } = await fixture({ create: async () => { created++; return { execute: async () => ({ outcome: "completed", value: "saved result" }), dispose: async () => {} }; } });
  const maintenance = manager.exclusive(async () => { entered.resolve(); await leave.promise; });
  await entered.promise;
  await manager.submit("one", "one");
  expect(created).toBe(0); expect(ledger.snapshot().queue).toHaveLength(1);
  await expect(manager.exclusive(async () => {})).rejects.toMatchObject({ code: "SESSION_BUSY" });
  leave.resolve(); await maintenance; await manager.waitForIdle();
  expect(ledger.snapshot().runs[0]).toMatchObject({ state: "completed", result: "saved result" });
  await manager.dispose(); await session.close();
});

it("runs a queued maintenance task without constructing a Loop", async () => {
  const registry = createCoreCodecRegistry(); taskCodecs.forEach(codec => registry.register(codec));
  const session = SessionHandle.createEphemeral({ registry, header: createSessionHeader({ sessionId: "operations", createdAt: "2026-10-03T00:00:00Z", lineage: null, createdWith: { profileId: "test", runtimeContractVersion: "1", manifestDigest: "test", plugins: [], codecSetDigest: registry.digest } }) });
  const ledger = await TaskLedger.open(session); let compacted = 0;
  const manager = new SessionRunManager({ ledger, harnessId: "main", acquire: () => { throw new Error("No Run lease for scheduling operation"); }, readConfiguration: () => ({ mode: "agent" }), operationForTask: () => async () => { compacted++; } });
  await manager.submit("compact", "/compact"); await manager.waitForIdle();
  expect(compacted).toBe(1); expect(ledger.snapshot().runs).toEqual([]); expect(ledger.snapshot().tasks[0].state).toBe("completed");
  await manager.dispose(); await session.close();
});

it("keeps an absolute deadline active while approvals pause execution time", async () => {
  vi.useFakeTimers();
  try {
    const expire = vi.fn();
    const budget = new RunBudget(100, Date.now() + 500, expire);
    budget.start(); budget.waitForApproval("a"); budget.waitForApproval("b");
    await vi.advanceTimersByTimeAsync(200); expect(expire).not.toHaveBeenCalled();
    budget.settleApproval("a");
    await vi.advanceTimersByTimeAsync(300); expect(expire).toHaveBeenCalledTimes(1);
    budget.dispose();
    await vi.advanceTimersByTimeAsync(1000); expect(expire).toHaveBeenCalledTimes(1);
  } finally { vi.useRealTimers(); }
});

it("does not acquire a Harness for input whose absolute deadline has already expired", async () => {
  const registry = createCoreCodecRegistry(); taskCodecs.forEach(codec => registry.register(codec));
  const session = SessionHandle.createEphemeral({ registry, header: createSessionHeader({ sessionId: "expired", createdAt: "2026-10-03T00:00:00Z", lineage: null, createdWith: { profileId: "test", runtimeContractVersion: "1", manifestDigest: "test", plugins: [], codecSetDigest: registry.digest } }) });
  const ledger = await TaskLedger.open(session);
  const acquire = vi.fn(() => { throw new Error("expired input must not start"); });
  const manager = new SessionRunManager({ ledger, harnessId: "main", acquire, readConfiguration: () => ({ mode: "agent", deadline: Date.now() - 1 }) });
  await manager.submit("expired", "expired"); await manager.waitForIdle();
  expect(acquire).not.toHaveBeenCalled();
  expect(ledger.snapshot()).toMatchObject({ paused: true, runs: [], tasks: [{ state: "cancelled" }] });
  await manager.dispose(); await session.close();
});

it("does not turn an execution settlement error into a successful cancellation", async () => {
  const entered = gate();
  const { manager, ledger, session } = await fixture({ create: async input => ({
    execute: async () => {
      entered.resolve();
      await new Promise<void>(resolve => input.signal.addEventListener("abort", () => resolve(), { once: true }));
      throw new AggregateError([new Error("checkpoint failed")], "settlement failed");
    },
    dispose: async () => {},
  }) });
  await manager.submit("one", "one"); await entered.promise;
  await manager.stop(manager.activeRunId!); await manager.waitForIdle();
  expect(ledger.snapshot().runs[0]?.state).toBe("failed");
  expect(manager.failure).toBeInstanceOf(AggregateError);
  await manager.dispose(); await session.close();
});

it("reads updated model configuration only after the asynchronous Harness lease arrives", async () => {
  const entered = gate(); const permit = gate(); const seen: unknown[] = [];
  const { manager, ledger, session, setConfig } = await fixture({ create: async input => {
    seen.push(input.configuration); return { execute: async () => ({ outcome: "completed", value: null }), dispose: async () => {} };
  } }, async () => {}, async () => { entered.resolve(); await permit.promise; });
  await manager.submit("waiting-lease", "content"); await entered.promise;
  setConfig("changed-while-waiting"); permit.resolve(); await manager.waitForIdle();
  expect(seen).toEqual([{ model: "changed-while-waiting", mode: "agent" }]);
  expect(ledger.snapshot().runs[0]?.configuration).toMatchObject({ harnessExecutionDigest: "stable-content" });
  expect(Object.keys(ledger.snapshot().runs[0]!.harness).sort()).toEqual(["generationId", "harnessId", "revision"]);
  await manager.dispose(); await session.close();
});

it("retains unclaimed content on Harness recovery blocking and resumes after Host repair", async () => {
  let blocked = true;
  const { manager, ledger, session } = await fixture({ create: async () => ({ execute: async () => ({ outcome: "completed", value: "after repair" }), dispose: async () => {} }) }, async () => {}, async () => {
    if (blocked) throw Object.assign(new Error("repair required"), { code: "RECOVERY_BLOCKED" });
  });
  await manager.submit("recoverable", "keep my input"); await manager.waitForIdle();
  expect(ledger.snapshot()).toMatchObject({ paused: true, tasks: [{ state: "pending" }], runs: [] });
  expect(manager.blocked).toBe(false);
  blocked = false; await manager.resume(ledger.snapshot().revision); await manager.waitForIdle();
  expect(ledger.snapshot()).toMatchObject({ tasks: [{ state: "completed" }], runs: [{ result: "after repair" }] });
  await manager.dispose(); await session.close();
});
