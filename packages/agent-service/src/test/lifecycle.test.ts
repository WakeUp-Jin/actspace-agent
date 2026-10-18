import { TaskLedger } from "../task-ledger.js";
import { describe, expect, it } from "vitest";
import { createCoreCodecRegistry, createSessionHeader, SessionError } from "@actspace/session-journal";
import { SessionHandle } from "@actspace/session-persistence";
import { manifest } from "../manifest.js";
import { codecs } from "../codec.js";
import { activate } from "../plugin.js";

describe("agent service plugin", () => {
  it("declares pure codecs and owns a single session manager across concurrent opens", async () => {
    expect(manifest.codecs[0].eventTypes).toEqual(codecs.map(codec => codec.type));
    const registry = createCoreCodecRegistry(); codecs.forEach(codec => registry.register(codec));
    const session = SessionHandle.createEphemeral({ registry, header: createSessionHeader({ sessionId: "test", createdAt: "2026-10-03T00:00:00Z", lineage: null, createdWith: { profileId: "test", runtimeContractVersion: "1", manifestDigest: "test", plugins: [], codecSetDigest: registry.digest } }) });
    let opens = 0; let acquisitions = 0;
    const plugin = activate({ openSession: async () => { opens++; return session; }, harnessId: () => "main", readConfiguration: () => ({ mode: "plan" }), acquire: () => { acquisitions++; throw new Error("not needed"); } });
    const service = plugin.services["agent.service"];
    await Promise.all([service.snapshot("test"), service.snapshot("test")]);
    expect(opens).toBe(1); expect(acquisitions).toBe(0);
    await plugin.dispose(); await plugin.dispose();
    await expect(service.snapshot("test")).rejects.toThrow("closed");
    expect(session.durabilityState).toBe("healthy");
    await session.close();
  });
});

it("drains without reopening a Session whose ownership acquisition failed", async () => {
  let opens = 0;
  const plugin = activate({ openSession: async () => { opens++; throw new SessionError("SESSION_WRITER_LOCKED", "SESSION_WRITER_LOCKED"); }, harnessId: () => "main", readConfiguration: () => ({ mode: "plan" }), acquire: () => { throw new Error("must not acquire"); } });
  const service = plugin.services["agent.service"];
  await expect(service.snapshot("foreign")).rejects.toThrow("SESSION_WRITER_LOCKED");
  service.beginDrain();
  await expect(service.waitForOwnedRuns()).resolves.toBeUndefined();
  expect(opens).toBe(1);
  await plugin.dispose();
});

it("retries a transient writer acquisition failure without duplicating concurrent managers", async () => {
  const registry = createCoreCodecRegistry(); codecs.forEach(codec => registry.register(codec));
  const session = SessionHandle.createEphemeral({ registry, header: createSessionHeader({ sessionId: "retry", createdAt: "2026-10-06T00:00:00Z", lineage: null, createdWith: { profileId: "test", runtimeContractVersion: "1", manifestDigest: "test", plugins: [], codecSetDigest: registry.digest } }) });
  let opens = 0;
  const locked = new SessionError("SESSION_WRITER_LOCKED", "Previous writer lease has not expired");
  const plugin = activate({ openSession: async () => { if (++opens === 1) throw locked; return session; }, harnessId: () => "main", readConfiguration: () => ({ mode: "plan" }), acquire: () => { throw new Error("must not acquire"); } });
  const service = plugin.services["agent.service"];
  const first = await Promise.allSettled([service.snapshot("retry"), service.snapshot("retry")]);
  expect(first).toEqual([{ status: "rejected", reason: locked }, { status: "rejected", reason: locked }]);
  expect(opens).toBe(1);
  const [a, b] = await Promise.all([service.snapshot("retry"), service.snapshot("retry")]);
  expect(a).toEqual(b); expect(a.tasks).toEqual([]); expect(opens).toBe(2);
  await plugin.dispose(); await session.close();
});

it("keeps durability failures blocked on subsequent requests", async () => {
  let opens = 0;
  const error = new SessionError("SESSION_DURABILITY_FAILED", "Unconfirmed write");
  const plugin = activate({ openSession: async () => { opens++; throw error; }, harnessId: () => "main", readConfiguration: () => ({ mode: "plan" }), acquire: () => { throw new Error("must not acquire"); } });
  const service = plugin.services["agent.service"];
  await expect(service.snapshot("broken")).rejects.toBe(error);
  await expect(service.snapshot("broken")).rejects.toBe(error);
  expect(opens).toBe(1);
  await plugin.dispose();
});


it("observes a provider-owned child without recovering it or admitting a second scheduler", async () => {
  const registry = createCoreCodecRegistry(); codecs.forEach(codec => registry.register(codec));
  const session = SessionHandle.createEphemeral({ registry, header: createSessionHeader({ sessionId: "child", createdAt: "2026-10-18T00:00:00Z", lineage: null, createdWith: { profileId: "test", runtimeContractVersion: "1", manifestDigest: "test", plugins: [], codecSetDigest: registry.digest } }) });
  let opens = 0;
  const plugin = activate({ openSession: async () => { opens++; return session; }, harnessId: () => "main", readConfiguration: () => ({ mode: "plan" }), acquire: () => { throw new Error("must not schedule child"); } });
  const service = plugin.services["agent.service"];
  const ledger = await TaskLedger.open(session);
  const release = service.registerExternalLedger(ledger);
  const receipt = await ledger.submit("child-task", "read");
  await ledger.start(receipt.task.taskId, "child-run", { harnessId: "main", generationId: "one", revision: 1 }, {});
  const seq = session.lastSeq;
  const states = await Promise.all([service.snapshot("child"), service.snapshot("child")]);
  expect(states.every(state => state.runs[0]?.state === "running")).toBe(true);
  expect(session.lastSeq).toBe(seq);
  expect(opens).toBe(0);
  await expect(service.submit("child", "intruder", "new work")).rejects.toMatchObject({ code: "SESSION_BUSY" });
  expect(() => service.registerExternalLedger(ledger)).toThrow("SESSION_BUSY");
  await ledger.finish("child-run", "completed", { text: "read result" });
  expect((await service.snapshot("child")).runs[0]).toMatchObject({ state: "completed", result: { text: "read result" } });
  expect(ledger.blocked).toBe(false);
  release(); release();
  expect((await service.snapshot("child")).runs[0]?.state).toBe("completed");
  expect(opens).toBe(1);
  await plugin.dispose(); await session.close();
});
