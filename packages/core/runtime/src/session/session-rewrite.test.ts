import { describe, expect, it } from "vitest";
import { createCoreCodecRegistry } from "@actspace/session-journal";
import { SessionStore } from "@actspace/session-persistence";
import { MemorySessionStorage } from "@actspace/session-storage/testing";
import { RuntimeSessionController } from "./session-controller.js";

const registry = createCoreCodecRegistry();
const createdWith = { profileId: "test", runtimeContractVersion: "1", manifestDigest: "test", plugins: [], codecSetDigest: registry.digest };
const message = (id: string) => ({ type: "user/message", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { messageId: id, content: id }, surface: { kind: "append" as const } });

async function setup() {
  const storage = new MemorySessionStorage(registry);
  const store = new SessionStore({ registry }, storage);
  const created: string[] = [], disposed: string[] = [];
  const controller = new RuntimeSessionController({ dataRoot: "/unused", runtimeId: "test", registry, profileId: "test", manifestDigest: "test", plugins: [],
    onCreated: id => { created.push(id); }, onDisposed: id => { disposed.push(id); } }, store);
  const session = await controller.create("root");
  await session.appendMany([message("one"), message("two"), message("three")]);
  await session.flush();
  return { storage, store, controller, session, created, disposed };
}

describe("RuntimeSessionController.rewrite", () => {
  it("closes the Session, keeps the prefix plus closing events, retires dropped children and reopens it", async () => {
    const { storage, store, controller, created, disposed } = await setup();
    try {
      const child = await store.create({ sessionId: "child", createdAt: "2026-11-07T00:00:00.000Z", lineage: null, createdWith }); await child.close();
      await controller.globalSessionSummaries();
      expect((await controller.globalSessionSummaries()).map(item => item.sessionId).sort()).toEqual(["child", "root"]);
      const closing = [{ type: "session/title-set", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { title: "kept" }, surface: null }];
      const result = await controller.rewrite("root", { expectedLastSeq: 2, cutSeq: 1, closing, label: "rewind-1", retire: ["child", "missing"] });
      expect(result.archive).toBe("recovery/rewind-1.journal.jsonl");
      expect(result.retireFailures.map(item => item.sessionId)).toEqual(["missing"]);
      expect(result.session.journal.readEvents().map(event => event.type)).toEqual(["user/message", "session/title-set"]);
      expect(controller.getOpen("root")).toBe(result.session);
      expect(controller.snapshot(result.session).metadata.title).toBe("kept");
      expect(disposed).toContain("root");
      expect(created.filter(id => id === "root")).toHaveLength(2);
      expect((await controller.globalSessionSummaries()).map(item => [item.sessionId, item.throughJournalSeq])).toEqual([["root", 1]]);
      await result.session.append(message("four")); await result.session.flush();
      expect((await storage.inspect("root")).events).toHaveLength(3);
    } finally { await controller.closeAll(); await storage.close(); }
  });

  it("refuses while a release gate holds work, and reopens the unchanged Session when storage refuses", async () => {
    const { storage, controller, session } = await setup();
    try {
      let busy = true;
      const remove = controller.addReleaseGate({ canRelease: () => !busy, release: async () => true });
      await expect(controller.rewrite("root", { expectedLastSeq: 2, cutSeq: 1, closing: [], label: "rewind-1", retire: [] })).rejects.toMatchObject({ code: "SESSION_BUSY" });
      expect(controller.getOpen("root")).toBe(session);
      busy = false;
      await expect(controller.rewrite("root", { expectedLastSeq: 1, cutSeq: 1, closing: [], label: "rewind-1", retire: [] })).rejects.toThrow();
      const reopened = controller.getOpen("root")!;
      expect(reopened.journal.readEvents()).toHaveLength(3);
      remove();
    } finally { await controller.closeAll(); await storage.close(); }
  });
});
