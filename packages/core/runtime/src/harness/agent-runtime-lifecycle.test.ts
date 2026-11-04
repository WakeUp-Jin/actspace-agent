import { describe, expect, it, vi } from "vitest";
import { CordisContextClass } from "@actspace/cordis-adapter";
import { SessionHandle } from "@actspace/session-persistence";
import { createCoreCodecRegistry, createSessionHeader } from "@actspace/session-journal";
import { taskCodecs } from "@actspace/agent-service";
import { ManagedRuns } from "./managed-runs.js";
import { AgentRuntimeService } from "./agent-runtime-plugin.js";

/** Release hooks the runtime plugin registers on the Session controller. */
const releaseHooks = { addPin: () => () => undefined, addReleaseGate: () => () => undefined, requestSweep: () => undefined };

describe("agent runtime service lifecycle", () => {
  it("publishes committed queue changes to Host Cordis observers", async () => {
    const ctx = new CordisContextClass();
    const codecs = createCoreCodecRegistry(); taskCodecs.forEach(codec => codecs.register(codec));
    const session = SessionHandle.createEphemeral({ registry: codecs, header: createSessionHeader({ sessionId: "notifications", createdAt: "2026-10-03T00:00:00Z", lineage: null, createdWith: { profileId: "test", runtimeContractVersion: "2", manifestDigest: "test", plugins: [], codecSetDigest: codecs.digest } }) });
    ctx.provide("actspace.host.agent", { host: {}, plugins: [] });
    ctx.provide("agent.registry", { list: () => [] });
    ctx.provide("session.runtime", { store: {}, getOpen: () => session, ...releaseHooks });
    const runtime = new AgentRuntimeService(ctx as never);
    const states: { paused: boolean; queue: readonly string[] }[] = [];
    ctx.on("agent/tasks-updated", snapshot => { states.push(snapshot); });
    try {
      const snapshot = await runtime.runs.service.snapshot("notifications");
      // Keep the task pending so this test has no execution factory.
      await runtime.runs.service.exclusive("notifications", async () => {
        await runtime.runs.service.submit("notifications", "one", "queued");
        await runtime.runs.service.stop("notifications", "stale");
        expect(states.at(-1)?.queue).toHaveLength(1);
        const current = await runtime.runs.service.snapshot("notifications");
        await runtime.runs.service.cancel("notifications", current.queue[0]!, current.revision);
      });
      expect(snapshot.queue).toEqual([]);
      expect(states.at(-1)?.queue).toEqual([]);
      expect(states).toHaveLength(2);
    } finally { await runtime.dispose(); await session.close(); await ctx.fiber.dispose(); }
  });

  it("registers the idle-release pin and gate, answers for its own work, and unregisters both on dispose", async () => {
    const ctx = new CordisContextClass();
    ctx.provide("actspace.host.agent", { host: {}, toolEnvironment: {}, workspaceRoot: "/workspace", compositionDigest: "composition", plugins: [] });
    ctx.provide("agent.registry", { list: () => [] });
    const pins = new Set<(id: string) => boolean>();
    const gates = new Set<{ canRelease(id: string): boolean; release(id: string): Promise<unknown> }>();
    ctx.provide("session.runtime", { store: {}, requestSweep: () => undefined,
      addPin: (pin: (id: string) => boolean) => { pins.add(pin); return () => { pins.delete(pin); }; },
      addReleaseGate: (gate: { canRelease(id: string): boolean; release(id: string): Promise<unknown> }) => { gates.add(gate); return () => { gates.delete(gate); }; } });
    const runtime = new AgentRuntimeService(ctx as never);
    expect([pins.size, gates.size]).toEqual([1, 1]);
    const [pin] = [...pins]; const [gate] = [...gates];
    // Nothing running, queued, spawned or backgrounded: the Session may go.
    expect(pin!("idle")).toBe(false);
    expect(gate!.canRelease("idle")).toBe(true);
    vi.spyOn(runtime.backgroundTasks, "hasRunning").mockImplementation(id => id === "busy-bg");
    vi.spyOn(runtime.subagents, "runningCount").mockImplementation(id => id === "busy-agent" ? 1 : 0);
    expect(pin!("busy-bg")).toBe(true);
    expect(pin!("busy-agent")).toBe(true);
    expect(await gate!.release("idle")).toBe(true);
    await runtime.dispose();
    expect([pins.size, gates.size]).toEqual([0, 0]);
    await ctx.fiber.dispose();
  });

  it("owns Host scheduling without creating a session-long Loop", async () => {
    const ctx = new CordisContextClass();
    ctx.provide("actspace.host.agent", { host: {}, toolEnvironment: {}, workspaceRoot: "/workspace", compositionDigest: "composition", plugins: [] });
    const registry = { list: () => [] };
    ctx.provide("agent.registry", registry);
    ctx.provide("session.runtime", { store: {}, ...releaseHooks });
    const runtime = new AgentRuntimeService(ctx as never);
    expect(runtime.registry).toBe(registry);
    expect(runtime.harnesses).toBeUndefined();
    expect(runtime.runs.isIdle()).toBe(true);
    await runtime.dispose();
    await runtime.dispose();
    await ctx.fiber.dispose();
  });
});

it("does not let a delayed caller cancellation stop the next Run", async () => {
  const session = { header: { sessionId: "session" } };
  const runs = new ManagedRuns({ getOpen: () => session, snapshot: () => ({}) } as never, {} as never);
  const task = { taskId: "first-task", state: "completed", runId: "first-run" };
  vi.spyOn(runs.service, "snapshot").mockResolvedValue({ tasks: [task], runs: [{ runId: "second-run", state: "running" }] } as never);
  vi.spyOn(runs.service, "submit").mockResolvedValue({ task } as never);
  let finish!: (value: never) => void;
  let waiting!: () => void;
  const entered = new Promise<void>(resolve => { waiting = resolve; });
  vi.spyOn(runs.service, "waitForTask").mockImplementation(async () => { waiting(); return new Promise(resolve => { finish = resolve; }); });
  const stop = vi.spyOn(runs.service, "stop").mockResolvedValue(true);
  const signal = new AbortController();
  const pending = runs.run("session", { content: "first", agentRunId: "first-run" }, signal.signal);
  await entered; signal.abort();
  await Promise.resolve(); await Promise.resolve();
  expect(stop).not.toHaveBeenCalled();
  finish({ result: { reason: "completed", agentRunId: "first-run", turnId: "turn", steps: 1, finalText: "done" } } as never);
  expect(await pending).toMatchObject({ outcome: "completed" });
  await runs.dispose();
});
