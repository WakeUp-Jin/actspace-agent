import { describe, expect, it } from "vitest";
import { createCoreCodecRegistry } from "@actspace/session-journal";
import { SessionStore } from "@actspace/session-persistence";
import { MemorySessionStorage } from "@actspace/session-storage/testing";
import { RuntimeSessionController } from "./session-controller.js";

const registry = createCoreCodecRegistry();
const createdWith = { profileId: "test", runtimeContractVersion: "1", manifestDigest: "test", plugins: [], codecSetDigest: registry.digest };

async function setup(options: { maxIdleSessions?: number } = {}) {
  const storage = new MemorySessionStorage(registry);
  const store = new SessionStore({ registry }, storage);
  const created: string[] = [];
  const disposed: string[] = [];
  const controller = new RuntimeSessionController({
    dataRoot: "/unused", runtimeId: "test", registry, profileId: "test", manifestDigest: "test", plugins: [], ...options,
    onCreated: id => { created.push(id); }, onDisposed: id => { disposed.push(id); },
  }, store);
  const seed = async (id: string) => {
    const session = await store.create({ sessionId: id, createdAt: "2026-11-04T00:00:00.000Z", lineage: null, createdWith });
    await session.append({ type: "user/message", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { messageId: `m-${id}`, content: id }, surface: { kind: "append" } });
    await session.flush(); await session.close();
  };
  const open = (ids: readonly string[]) => ids.map(id => controller.getOpen(id) !== undefined);
  return { storage, store, controller, created, disposed, seed, open };
}

describe("idle Session release", () => {
  it("keeps the newest three idle Sessions and releases the oldest first", async () => {
    const { controller, storage, seed, disposed } = await setup();
    try {
      const ids = Array.from({ length: 10 }, (_, index) => `s${index}`);
      for (const id of ids) await seed(id);
      for (const id of ids) { await controller.resume(id); await controller.sweep(); }
      expect(controller.openSessions().map(session => session.header.sessionId).sort()).toEqual(["s7", "s8", "s9"]);
      expect(disposed).toEqual(["s0", "s1", "s2", "s3", "s4", "s5", "s6"]);
    } finally { await controller.closeAll(); await storage.close(); }
  });

  it("measures retained open Sessions after opening 10: before (no release) vs after", async () => {
    const retained = async (maxIdleSessions: number) => {
      const { controller, storage, seed } = await setup({ maxIdleSessions });
      try {
        const ids = Array.from({ length: 10 }, (_, index) => `s${index}`);
        for (const id of ids) await seed(id);
        for (const id of ids) await controller.resume(id);
        await controller.sweep();
        return controller.openSessions().length;
      } finally { await controller.closeAll(); await storage.close(); }
    };
    // A limit above the count behaves like the old controller, which never released a Session.
    const before = await retained(1_000);
    const after = await retained(3);
    console.info(`PERF-B retained open Sessions after opening 10: before=${before} after=${after}`);
    expect([before, after]).toEqual([10, 3]);
  });

  it("touching a Session by use makes it newer than its peers", async () => {
    const { controller, storage, seed, open } = await setup({ maxIdleSessions: 2 });
    try {
      for (const id of ["a", "b", "c"]) await seed(id);
      await controller.resume("a"); await controller.resume("b");
      controller.getOpen("a");
      await controller.resume("c"); await controller.sweep();
      expect(open(["a", "b", "c"])).toEqual([true, false, true]);
    } finally { await controller.closeAll(); await storage.close(); }
  });

  it("never releases pinned, observed, ephemeral or gated Sessions, and does not count them", async () => {
    const { controller, storage, seed, open } = await setup({ maxIdleSessions: 1 });
    try {
      for (const id of ["observed", "pinned", "gated", "idle1", "idle2"]) await seed(id);
      let pinned = true;
      controller.addPin(id => id === "pinned" && pinned);
      controller.addReleaseGate({ canRelease: id => id !== "gated", release: async () => true });
      controller.setObserved(["observed"]);
      for (const id of ["observed", "pinned", "gated", "idle1", "idle2"]) await controller.resume(id);
      await controller.createEphemeral("ephemeral");
      await controller.sweep();
      // Only idle1 and idle2 count against the limit of one; the older one goes.
      expect(open(["observed", "pinned", "gated", "ephemeral", "idle1", "idle2"])).toEqual([true, true, true, true, false, true]);
      pinned = false;
      await controller.sweep();
      // pinned is now idle and older than idle2, so it is released; the gate and observation still protect the rest.
      expect(open(["observed", "pinned", "gated", "ephemeral", "idle2"])).toEqual([true, false, true, true, true]);
      expect(controller.isEphemeral("ephemeral")).toBe(true);
    } finally { await controller.closeAll(); await storage.close(); }
  });

  it("releases a parent only after its child Session is gone", async () => {
    const { controller, storage, store, seed, open } = await setup({ maxIdleSessions: 0 });
    try {
      let hold = true;
      controller.addPin(() => hold);
      await seed("parent");
      await controller.resume("parent");
      const child = await store.fork({ parentSessionId: "parent", newSessionId: "child", boundarySeq: 0, createdAt: "2026-11-04T00:00:01.000Z", createdWith });
      await child.close();
      await controller.resume("child");
      hold = false;
      await controller.sweep();
      expect(open(["parent", "child"])).toEqual([true, false]);
      await controller.sweep();
      expect(open(["parent", "child"])).toEqual([false, false]);
    } finally { await controller.closeAll(); await storage.close(); }
  });

  it("reopens an evicted Session with its journal intact and pairs created/disposed notifications", async () => {
    const { controller, storage, seed, created, disposed } = await setup({ maxIdleSessions: 100 });
    try {
      await seed("a");
      const first = await controller.resume("a");
      expect(controller.snapshot(first).messages.length).toBeGreaterThan(0);
      expect(await controller.release("a")).toBe(true);
      expect(controller.getOpen("a")).toBeUndefined();
      const second = await controller.resume("a");
      expect(second).not.toBe(first);
      expect(controller.snapshot(second).messages.map(message => message.messageId)).toContain("m-a");
      expect(created).toEqual(["a", "a"]);
      expect(disposed).toEqual(["a"]);
      // Cold reads of a released Session still work through the projection cache.
      await controller.release("a");
      const cold = await controller.inspect("a");
      expect(cold.sessionId).toBe("a");
      // An unchanged cold Session keeps its restored model instead of rebuilding it on every read.
      expect(await controller.inspect("a")).toBe(cold);
    } finally { await controller.closeAll(); await storage.close(); }
  });

  it("a resume that races a release waits for the writer lease instead of failing", async () => {
    const { controller, storage, seed } = await setup({ maxIdleSessions: 100 });
    try {
      await seed("a");
      await controller.resume("a");
      const release = controller.release("a");
      const reopened = controller.resume("a");
      await release;
      expect((await reopened).header.sessionId).toBe("a");
      expect(controller.getOpen("a")).toBeDefined();
    } finally { await controller.closeAll(); await storage.close(); }
  });

  it("release drops read-model state, pin hooks and listeners it owns", async () => {
    const { controller, storage, seed } = await setup({ maxIdleSessions: 100 });
    try {
      await seed("a");
      let updates = 0;
      const unsubscribe = controller.subscribeProjection(() => { updates += 1; });
      const session = await controller.resume("a");
      await controller.release("a");
      // A closed Session no longer feeds projection listeners (the model was dropped with it).
      await expect(session.append({ type: "user/message", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { messageId: "x", content: "x" }, surface: { kind: "append" } })).rejects.toBeTruthy();
      expect(updates).toBe(0);
      unsubscribe();
      const unpin = controller.addPin(() => true);
      await controller.resume("a");
      expect(await controller.release("a")).toBe(false);
      unpin();
      expect(await controller.release("a")).toBe(true);
    } finally { await controller.closeAll(); await storage.close(); }
  });

  it("a Session released by a gate is released in the same tick the check passes", async () => {
    const { controller, storage, seed } = await setup({ maxIdleSessions: 100 });
    try {
      await seed("a");
      await controller.resume("a");
      const calls: string[] = [];
      controller.addReleaseGate({ canRelease: () => { calls.push("can"); return true; }, release: async () => { calls.push(`release:${controller.getOpen("a") === undefined}`); } });
      await controller.release("a");
      expect(calls).toEqual(["can", "release:true"]);
    } finally { await controller.closeAll(); await storage.close(); }
  });

  it("requestSweep coalesces triggers and closeAll waits for in-flight releases", async () => {
    const { controller, storage, seed, disposed } = await setup({ maxIdleSessions: 100 });
    try {
      for (const id of ["a", "b"]) await seed(id);
      await controller.resume("a"); await controller.resume("b");
      controller.requestSweep(); controller.requestSweep();
      await controller.closeAll();
      expect(disposed.sort()).toEqual(["a", "b"]);
      expect(controller.openSessions()).toEqual([]);
    } finally { await storage.close(); }
  });
});
