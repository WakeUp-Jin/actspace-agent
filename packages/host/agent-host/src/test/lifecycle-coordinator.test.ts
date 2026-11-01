import { afterEach, expect, it, vi } from "vitest";
import { HostLifecycle, startUploadMaintenance, type HostRuntime } from "../lifecycle.js";
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
function runtime(overrides: Partial<HostRuntime> = {}): HostRuntime {
  return { application: { listSessions: async () => [] } as unknown as HostRuntime["application"], beginDrain: vi.fn(), waitForOwnedRuns: async () => {}, backgroundTask: async () => false, activeSubagents: () => 0, recovery: () => ({ blocked: "", instances: [{}] }), subscribeTasks: () => () => {}, shutdown: vi.fn(async () => {}), ...overrides };
}
afterEach(() => vi.useRealTimers());
it("drains owned Runs, child Runs and shells, and closes exactly once", async () => {
  vi.useFakeTimers();
  const runs = deferred(), trace: string[] = [];
  let children = 1, shell = true;
  const r = runtime({ waitForOwnedRuns: () => runs.promise, activeSubagents: () => children,
    application: { listSessions: async () => [{ sessionId: "s" }] } as unknown as HostRuntime["application"],
    backgroundTask: async () => shell, shutdown: async () => { trace.push("shutdown"); } });
  const host = new HostLifecycle(r, { shutdown: r.shutdown, beforeShutdown: async () => { trace.push("maintenance"); }, close: async () => { trace.push("close"); }, onState: () => {} });
  const stopping = host.stop();
  expect(host.stop()).toBe(stopping);
  expect(host.state()).toBe("draining");
  expect(trace).toEqual([]);
  runs.resolve(); await vi.advanceTimersByTimeAsync(100);
  expect(trace).toEqual([]);
  children = 0; await vi.advanceTimersByTimeAsync(100);
  expect(trace).toEqual([]);
  shell = false; await vi.advanceTimersByTimeAsync(100);
  await stopping;
  await host.stop(true);
  expect(trace).toEqual(["maintenance", "shutdown", "close"]);
  expect(r.beginDrain).toHaveBeenCalledTimes(1);
});
it("force stop escalates a waiting drain and retains a deadline for stuck shutdown", async () => {
  vi.useFakeTimers();
  const runs = deferred(), shutdown = deferred();
  const forceExit = vi.fn(), close = vi.fn(async () => {});
  const r = runtime({ waitForOwnedRuns: () => runs.promise, shutdown: () => shutdown.promise });
  const host = new HostLifecycle(r, { shutdown: r.shutdown, beforeShutdown: async () => {}, close, onState: () => {}, forceExit, forceDeadlineMs: 20 });
  const waiting = host.stop(), forcing = host.stop(true);
  expect(host.stop(true)).toBe(forcing);
  await vi.advanceTimersByTimeAsync(20);
  expect(forceExit).toHaveBeenCalledTimes(1);
  shutdown.resolve(); await Promise.all([waiting, forcing]);
  expect(close).toHaveBeenCalledTimes(1);
  runs.resolve();
});
it("blocked recovery stays diagnosable and can stop without executable capabilities", async () => {
  const r = runtime({ recovery: () => ({ blocked: "bad artifact", instances: [] }), application: { listSessions: async () => { throw new Error("locked"); } } as unknown as HostRuntime["application"] });
  const host = new HostLifecycle(r, { shutdown: r.shutdown, beforeShutdown: async () => {}, close: async () => {}, onState: () => {} });
  expect(host.state()).toBe("blocked");
  expect(await host.diagnostics()).toMatchObject({ diagnostics: [{ component: "harness-recovery", reason: "bad artifact" }, { component: "session-list" }] });
  await host.stop(); expect(r.shutdown).toHaveBeenCalledTimes(1);
});
it("releases transport after shutdown failure and retains both errors", async () => {
  const one = new Error("runtime"), two = new Error("transport");
  const r = runtime({ shutdown: async () => { throw one; } });
  const close = vi.fn(async () => { throw two; });
  const host = new HostLifecycle(r, { shutdown: r.shutdown, beforeShutdown: async () => {}, close, onState: () => {} });
  await expect(host.stop(true)).rejects.toMatchObject({ errors: [one, two] });
  expect(close).toHaveBeenCalledTimes(1);
});
it("stops upload scheduling and waits for the already running cleanup", async () => {
  vi.useFakeTimers();
  const work = deferred(), cleanup = vi.fn(() => work.promise), failure = vi.fn();
  const stop = startUploadMaintenance(cleanup, failure, 10);
  await vi.advanceTimersByTimeAsync(30);
  expect(cleanup).toHaveBeenCalledTimes(1);
  let stopped = false;
  const stopping = stop().then(() => { stopped = true; });
  await Promise.resolve(); expect(stopped).toBe(false);
  work.resolve(); await stopping;
  await vi.advanceTimersByTimeAsync(30);
  expect(cleanup).toHaveBeenCalledTimes(1);
  expect(failure).not.toHaveBeenCalled();
});
it("reports maintenance rejection without overlapping passes", async () => {
  vi.useFakeTimers();
  const error = new Error("storage"), failure = vi.fn();
  const stop = startUploadMaintenance(async () => { throw error; }, failure, 10);
  await vi.advanceTimersByTimeAsync(10); await stop();
  expect(failure).toHaveBeenCalledWith(error);
});
