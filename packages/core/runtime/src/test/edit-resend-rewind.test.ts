import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { AgentScope } from "@actspace/scope";
import { AgentApplication, taskCodecs, type RunFactory } from "@actspace/agent-service";
import type { HarnessLease } from "@actspace/boot";
import { BackgroundTaskRegistry, type BackgroundTaskSource } from "@actspace/background-tasks";
import type { CordisContext } from "@actspace/cordis-adapter";
import { createCoreCodecRegistry, type SessionEventCandidateV1 } from "@actspace/session-journal";
import { SessionStore } from "@actspace/session-persistence";
import { JsonlSessionStorage } from "@actspace/session-persistence-jsonl";
import { RuntimeSessionController } from "../session/session-controller.js";
import { ManagedRuns } from "../harness/managed-runs.js";

const source = { ownerPluginId: "@actspace/core" } as const;
const core = (type: string, data: SessionEventCandidateV1["data"], surface: SessionEventCandidateV1["surface"] = null): SessionEventCandidateV1 => ({ type, eventVersion: 1, source, data, surface });
const at = "2026-11-07T00:00:00.000Z";

/** A background Bash task that runs until stopped. */
function longTask(taskId: string, sessionId: string): BackgroundTaskSource & { stopped: string[] } {
  let finish!: (value: { status: "stopped"; summary: string; body: string }) => void;
  const done = new Promise<{ status: "stopped"; summary: string; body: string }>(resolve => { finish = resolve; });
  const stopped: string[] = [];
  return { taskId, kind: "bash", sessionId, callId: `call-${taskId}`, description: taskId, done, stopped, output: async () => ({ text: "" }),
    stop: async reason => { stopped.push(reason); finish({ status: "stopped", summary: "stopped", body: "" }); } };
}

it("rewinds a five-Turn Session to its second prompt: the Journal, Context cache, background work and dropped subagents all follow", async () => {
  const root = await mkdtemp(join(tmpdir(), "edit-resend-"));
  const registry = createCoreCodecRegistry(); taskCodecs.forEach(codec => registry.register(codec));
  const storage = new JsonlSessionStorage({ dataRoot: root, runtimeId: "rewind-test", registry });
  const store = new SessionStore({ registry }, storage);
  const sessions = new RuntimeSessionController({ dataRoot: root, runtimeId: "rewind-test", registry, profileId: "test", manifestDigest: "test", plugins: [] }, store);
  // The claim already wrote the prompt; each Run writes the Turn the Loop would and records the prompts it saw: its "context".
  const contexts: string[][] = [];
  let during: ((sessionId: string, turn: number) => Promise<void>) | undefined;
  let turnCount = 0;
  const factory: RunFactory = { create: async ({ session, runId }) => ({
    execute: async () => {
      const turnId = `turn-${++turnCount}`;
      await session.append(core("turn/start", { turnId, agentRunId: runId }));
      contexts.push(session.journal.readEvents().filter(event => event.type === "user/message").map(event => String((event.data as { content: unknown }).content)));
      await during?.(session.header.sessionId, turnCount);
      await session.append(core("turn/end", { turnId, status: "completed" }));
      return { outcome: "completed", value: null };
    },
    dispose: async () => {},
  }) };
  const runs = new ManagedRuns(sessions, { acquire: async () => ({ harnessId: "main", generationId: "g1", revision: 1, scope: new AgentScope("run"), context: {}, getService: () => factory, release: async () => {} }) as unknown as HarnessLease });
  const removeGate = sessions.addReleaseGate({ canRelease: id => runs.canRelease(id), release: id => runs.release(id) });
  const background = new BackgroundTaskRegistry({ openSession: async id => sessions.getOpen(id) ?? sessions.resume(id), wake: id => runs.service.wake(id) });
  const subagentStops: string[] = [];
  const subagents = { activeCount: 0, running: () => [], interrupt: async () => ({ ok: true, text: "" }), stopAll: async (rootId: string) => { subagentStops.push(rootId); } };
  const evicted: [string, string | undefined][] = [];
  const engine = { instances: { evict: (sessionId: string, scope?: string) => { evicted.push([sessionId, scope]); return true; } } };
  const inspectCapability = async <T, R>(name: string, inspect: (service: T | undefined) => R) => inspect((name === "context.engine" ? engine : undefined) as T | undefined);
  const services = new Map<string, unknown>([["session.runtime", sessions], ["session.journal", { registry }],
    ["agent.runtime", { runs: Object.assign(runs, { inspectCapability }), subagents, backgroundTasks: background }]]);
  const notices: unknown[] = [];
  const app = new AgentApplication({ get: (id: string) => services.get(id), emit: (type: string, payload: unknown) => { if (type === "application/session-rewound") notices.push(payload); } } as unknown as CordisContext);
  const submit = async (n: number) => {
    const receipt = await app.submitTask("main", `sub-${n}`, `prompt ${n}`);
    await runs.service.waitForTask("main", receipt.task.taskId);
  };
  try {
    await sessions.create("main", root, "agent");
    await runs.initialize("main");
    await submit(1);
    // Turn 2 starts a background Bash that is still running at the rewind, and spawns a subagent whose Session the rewind retires.
    const bash = longTask("bash-live", "main");
    during = async (sessionId, turn) => {
      if (turn !== 2) return;
      await background.register(bash);
      const child = await store.create({ sessionId: "child-2", createdAt: at, lineage: null, createdWith: sessions.creationProvenance() }); await child.close();
      await sessions.getOpen(sessionId)!.append(core("subagent/spawned", { agentId: "child-2", callId: "call-c", description: "explore", transcriptPath: "sessions/child-2", kind: "local", preset: "explore", createdAt: at }));
    };
    await submit(2);
    during = undefined;
    for (const n of [3, 4, 5]) await submit(n);
    await app.updateSessionMetadata("main", { title: "kept title" });
    await app.updateSessionPermissionMode("main", "full-access");
    const before = sessions.getOpen("main")!;
    await before.flush();
    const seen = before.journal.lastSeq;
    const runOf = (n: number) => (before.journal.readEvents().find(event => event.type === "user/message" && (event.data as { content: string }).content === `prompt ${n}`)!.data as { agentRunId: string }).agentRunId;
    const run2 = runOf(2);

    // A client that saw an older position conflicts once a newer Turn exists after it.
    const stale = before.journal.readEvents().find(event => event.type === "turn/start" && (event.data as { turnId: string }).turnId === "turn-4")!.seq - 1;
    await expect(app.rewindAndSubmit("main", { runId: run2, expectedThroughSeq: stale }, "edit-stale", "edited")).rejects.toMatchObject({ code: "REWIND_CONFLICT" });
    expect(runs.service.isHeld("main")).toBe(false);

    const receipt = await app.rewindAndSubmit("main", { runId: run2, expectedThroughSeq: seen }, "edit-2", "prompt 2 edited", "client-run");
    await runs.service.waitForTask("main", receipt.task.taskId);
    const after = sessions.getOpen("main")!;
    expect(after).not.toBe(before);
    const messages = after.journal.readEvents().filter(event => event.type === "user/message").map(event => event.data as { content: string; agentRunId: string });
    expect(messages.map(item => item.content)).toEqual(["prompt 1", "prompt 2 edited"]);
    // The new Run used the id the client rendered, and its context held only Turn 1 and the edit.
    expect(messages.at(-1)!.agentRunId).toBe("client-run");
    expect(contexts.at(-1)).toEqual(["prompt 1", "prompt 2 edited"]);
    expect(evicted).toEqual([["main", "main:main"], ["main", undefined]]);
    // Running work was stopped without a notification; the dropped part's subagent Session moved to recovery.
    expect(bash.stopped).toEqual(["rewind"]);
    expect(subagentStops).toEqual(["main"]);
    expect(after.journal.readEvents().filter(event => event.type === "agent/inbox/spliced")).toEqual([]);
    expect(background.list("main")).toEqual([]);
    const recovery = await readdir(join(root, "sessions-v2", "main", "recovery"));
    expect(recovery.some(name => name.endsWith(".journal.jsonl"))).toBe(true);
    const retired = recovery.find(name => !name.endsWith(".journal.jsonl"))!;
    expect((await stat(join(root, "sessions-v2", "main", "recovery", retired, "sessions", "child-2"))).isDirectory()).toBe(true);
    expect((await sessions.globalSessionSummaries()).map(item => item.sessionId)).toEqual(["main"]);
    // Settings changed in the dropped part keep their latest value.
    expect(sessions.snapshot(after)).toMatchObject({ metadata: { title: "kept title" }, permissionMode: "full-access" });
    const rewound = after.journal.readEvents().find(event => event.type === "session/rewound")!;
    // Stopping the live Bash wrote its settle after the client's position; that is not a conflict.
    expect(rewound.data).toMatchObject({ runId: run2, droppedThroughSeq: seen + 1 });
    expect(notices).toEqual([{ sessionId: "main", cutSeq: (rewound.data as { cutSeq: number }).cutSeq, retireFailures: [] }]);

    // A retry with the same submission returns the accepted task instead of rewinding again.
    const retry = await app.rewindAndSubmit("main", { runId: run2, expectedThroughSeq: seen }, "edit-2", "prompt 2 edited");
    expect(retry.task.taskId).toBe(receipt.task.taskId);
    expect(sessions.getOpen("main")).toBe(after);

    // A Session with queued work refuses to rewind.
    let release!: () => void;
    const blocker = new Promise<void>(resolve => { release = resolve; });
    during = async () => { await blocker; };
    await app.submitTask("main", "sub-6", "prompt 6");
    const run1 = (after.journal.readEvents().find(event => event.type === "user/message")!.data as { agentRunId: string }).agentRunId;
    await expect(app.rewindAndSubmit("main", { runId: run1, expectedThroughSeq: after.journal.lastSeq }, "edit-1", "x")).rejects.toMatchObject({ code: "SESSION_BUSY" });
    release();
    await runs.service.waitForIdle("main");
    during = undefined;
  } finally {
    removeGate();
    await background.dispose();
    await runs.dispose();
    await sessions.closeAll();
    await storage.close();
    await rm(root, { recursive: true, force: true });
  }
});
