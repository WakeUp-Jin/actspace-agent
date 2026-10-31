import { expect, it } from "vitest";
import { createCoreCodecRegistry } from "@actspace/session-journal";
import { SessionStore } from "@actspace/session-persistence";
import { MemorySessionStorage } from "@actspace/session-storage/testing";
import { RuntimeSessionController } from "./session-controller.js";

it("uses current runtime provenance for each mode and both session creation forms", async () => {
  const registry = createCoreCodecRegistry();
  const storage = new MemorySessionStorage(registry);
  const controller = new RuntimeSessionController({ dataRoot: "/unused", runtimeId: "current-runtime", registry, profileId: "current-profile", manifestDigest: "current-manifest", plugins: [] }, new SessionStore({ registry }, storage));
  try {
    for (const mode of ["chat", "plan", "agent"] as const) {
      const provenance = controller.creationProvenance(mode);
      expect(provenance).toMatchObject({ profileId: "current-profile", manifestDigest: "current-manifest", codecSetDigest: registry.digest, initialAgentMode: mode, agentFormId: "actspace.main", agentFormVersion: 1, runtimeContractVersion: "actspace.runtime.v2", plugins: [] });
      expect(provenance.agentCompositionDigest).toEqual(expect.any(String));
      if (mode === "plan") continue; // Plan is a runtime mode, not a standalone MainAgentForm.
      const durable = await controller.create(`durable-${mode}`, "/workspace", mode);
      const ephemeral = await controller.createEphemeral(`ephemeral-${mode}`, "/workspace", mode);
      expect(durable.header.createdWith).toEqual(provenance);
      expect(ephemeral.header.createdWith).toEqual(provenance);
    }
  } finally {
    await controller.closeAll();
    await storage.close();
  }
});

it("cold reads, lists, pages, exports and forks sessions without a filesystem backend", async () => {
  const registry = createCoreCodecRegistry(); const storage = new MemorySessionStorage(registry);
  const store = new SessionStore({ registry }, storage);
  const options = { dataRoot: "/must-not-be-used", runtimeId: "memory", registry, profileId: "test", manifestDigest: "test", plugins: [] };
  const make = () => new RuntimeSessionController(options, store);
  const createdWith = { profileId: "test", runtimeContractVersion: "1", manifestDigest: "test", plugins: [], codecSetDigest: registry.digest };
  try {
    const session = await store.create({ sessionId: "memory", createdAt: "2026-10-04T00:00:00.000Z", lineage: null, createdWith });
    await session.append({ type: "user/message", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { messageId: "m", content: "hello" }, surface: { kind: "append", node: { kind: "user", messageId: "m", content: "hello" } } });
    await session.flush(); await session.close();
    const reader = make();
    expect((await reader.list()).map(item => item.sessionId)).toEqual(["memory"]);
    expect((await reader.readProjection({ sessionId: "memory" })).window.events[0]?.type).toBe("user/message");
    expect(await reader.export("memory")).toContain("hello");
    const child = await store.fork({ parentSessionId: "memory", newSessionId: "child", boundarySeq: 0, createdAt: "2026-10-04T00:00:01.000Z", createdWith }); await child.close();
    expect((await make().list()).map(item => item.sessionId).sort()).toEqual(["child", "memory"]);
    const resumed = await reader.resume("memory"); expect(resumed.journal.events[0]?.type).toBe("user/message");
    await reader.closeAll();
  } finally { await storage.close(); }
});

it("closes healthy and blocked sessions even when the final checkpoint fails", async () => {
  const registry = createCoreCodecRegistry(); const storage = new MemorySessionStorage(registry);
  const store = new SessionStore({ registry }, storage);
  const controller = new RuntimeSessionController({ dataRoot: "/unused", runtimeId: "test", registry, profileId: "test", manifestDigest: "test", plugins: [] }, store);
  const createdWith = { profileId: "test", runtimeContractVersion: "1", manifestDigest: "test", plugins: [], codecSetDigest: registry.digest };
  try {
    for (const sessionId of ["blocked", "healthy"]) {
      const session = await store.create({ sessionId, createdAt: "2026-10-04T00:00:00.000Z", lineage: null, createdWith }); await session.close();
    }
    const blocked = await controller.resume("blocked"); await controller.resume("healthy");
    const append = blocked.append.bind(blocked);
    blocked.append = async candidate => { if (candidate.type === "session/end-seed") throw new Error("checkpoint failed"); return append(candidate); };
    await expect(controller.closeAll()).rejects.toMatchObject({ errors: [expect.objectContaining({ message: "checkpoint failed" })] });
    for (const id of ["blocked", "healthy"]) { const writer = await storage.open(id, "write"); await writer.close(); }
    await controller.closeAll();
  } finally { await storage.close(); }
});

it("flush does not rebuild cold history or consult a query backend", async () => {
  const registry = createCoreCodecRegistry(); const storage = new MemorySessionStorage(registry);
  const controller = new RuntimeSessionController({ dataRoot: "/unused", runtimeId: "test", registry, profileId: "test", manifestDigest: "test", plugins: [] }, new SessionStore({ registry }, storage));
  try {
    const session = await controller.create("flush-only");
    let inspections = 0;
    const inspect = storage.inspect.bind(storage);
    storage.inspect = async id => { inspections++; return inspect(id); };
    for (let i = 0; i < 10; i++) {
      await session.append({ type: "session/title-set", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { title: String(i) }, surface: null });
      await session.flush();
    }
    expect(inspections).toBe(0);
    expect(controller.snapshot(session).metadata.title).toBe("9");
    expect(session.durableSeq).toBe(9);
    await controller.closeAll();
  } finally { await storage.close(); }
});
