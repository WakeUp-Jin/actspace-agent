import { AgentScope } from "@actspace/scope";
import { describe, expect, it } from "vitest";
import { createCoreCodecRegistry, createSessionHeader } from "@actspace/session-journal";
import { SessionHandle } from "@actspace/session-persistence";
import { taskCodecs } from "../task-events.js";
import { AgentService } from "../service.js";

function gate() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }

function fixture(execute: () => Promise<void> = async () => {}) {
  const registry = createCoreCodecRegistry(); taskCodecs.forEach(codec => registry.register(codec));
  const sessions = new Map<string, SessionHandle>();
  let opened = 0;
  const openSession = async (id: string) => {
    opened += 1;
    const existing = sessions.get(id);
    if (existing) return existing;
    const created = SessionHandle.createEphemeral({ registry, header: createSessionHeader({ sessionId: id, createdAt: "2026-11-04T00:00:00Z", lineage: null, createdWith: { profileId: "test", runtimeContractVersion: "1", manifestDigest: "test", plugins: [], codecSetDigest: registry.digest } }) });
    sessions.set(id, created);
    return created;
  };
  const factory = { create: async () => ({ execute: async () => { await execute(); return { outcome: "completed" as const, value: null }; }, dispose: async () => {} }) };
  const service = new AgentService({
    openSession, harnessId: () => "main", readConfiguration: () => ({ mode: "agent" }),
    acquire: async () => ({ scope: new AgentScope("run"), context: {}, executionDigest: "d", harnessId: "main", generationId: "g", revision: 1, getService: <T>() => factory as T, release: async () => {} }),
  });
  return { service, opened: () => opened };
}

describe("AgentService release", () => {
  it("has nothing to release for a Session it never opened, and releases an idle one", async () => {
    const { service, opened } = fixture();
    expect(service.canRelease("never")).toBe(true);
    expect(await service.release("never")).toBe(true);
    await service.submit("s", "one", "hello"); await service.waitForIdle("s");
    expect(opened()).toBe(1);
    expect(service.canRelease("s")).toBe(true);
    expect(await service.release("s")).toBe(true);
    // A later request builds a fresh manager and reopens the Session.
    await service.submit("s", "two", "again"); await service.waitForIdle("s");
    expect(opened()).toBe(2);
    expect((await service.snapshot("s")).runs.map(run => run.state)).toEqual(["completed", "completed"]);
    await service.dispose();
  });

  it("refuses to release while a Run is active or a message is queued, then releases once idle", async () => {
    const proceed = gate();
    const { service } = fixture(() => proceed.promise);
    await service.submit("s", "one", "first");
    expect(service.canRelease("s")).toBe(false);
    expect(await service.release("s")).toBe(false);
    await service.submit("s", "two", "second");
    expect(service.canRelease("s")).toBe(false);
    proceed.resolve(); await service.waitForIdle("s");
    expect(service.canRelease("s")).toBe(true);
    expect(await service.release("s")).toBe(true);
    await service.dispose();
  });

  it("keeps a Session whose manager is still opening, and rejects work after the service closes", async () => {
    const { service } = fixture();
    const pending = service.submit("opening", "one", "hi");
    expect(service.canRelease("opening")).toBe(false);
    await pending;
    await service.dispose();
    expect(service.canRelease("opening")).toBe(false);
  });
});

describe("AgentService hold", () => {
  it("accepts tasks but starts no Run while held, refuses a second hold, and starts the queue on release", async () => {
    const { service } = fixture();
    await service.submit("s", "one", "first"); await service.waitForIdle("s");
    const release = service.hold("s");
    expect(() => service.hold("s")).toThrow(expect.objectContaining({ code: "SESSION_BUSY" }));
    expect(service.isHeld("s")).toBe(true);
    await service.submit("s", "two", "second");
    await new Promise(resolve => setTimeout(resolve, 10));
    let snapshot = await service.snapshot("s");
    expect(snapshot.queue).toHaveLength(1);
    expect(snapshot.runs).toHaveLength(1);
    release(); release();
    await new Promise(resolve => setTimeout(resolve, 0));
    await service.waitForIdle("s");
    snapshot = await service.snapshot("s");
    expect(snapshot.queue).toEqual([]);
    expect(snapshot.runs.map(run => run.state)).toEqual(["completed", "completed"]);
    expect(service.isHeld("s")).toBe(false);
    await service.dispose();
  });
});
