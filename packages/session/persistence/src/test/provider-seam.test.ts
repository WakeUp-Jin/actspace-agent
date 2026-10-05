import { describe, expect, it } from "vitest";
import { createCoreCodecRegistry } from "@actspace/session-journal";
import { MemorySessionStorage } from "@actspace/session-storage/testing";
import { SessionStore } from "../session-store.js";
import { applySessionRecovery } from "../recovery.js";

describe("SessionStore backend independence", () => {
  it("creates, cold reads, recovers and forks with an independent memory backend", async () => {
    const registry = createCoreCodecRegistry();
    const storage = new MemorySessionStorage(registry);
    const store = new SessionStore({ registry }, storage);
    const createdWith = { profileId: "test", runtimeContractVersion: "1", manifestDigest: "test", plugins: [], codecSetDigest: registry.digest };
    try {
      const session = await store.create({ sessionId: "parent", createdAt: "2026-10-04T00:00:00.000Z", lineage: null, createdWith });
      await session.append({ type: "user/message", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { messageId: "m", content: "hello" }, surface: { kind: "append", node: { kind: "user", messageId: "m", content: "hello" } } });
      await session.append({ type: "turn/start", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { turnId: "t" }, surface: null });
      await session.flush(); await session.close();
      expect((await store.inspect("parent")).events).toHaveLength(2);
      expect(await store.listSessionIds()).toEqual(["parent"]);
      const reopened = await store.open("parent");
      expect(await applySessionRecovery(reopened)).not.toBeNull(); await reopened.close();
      expect((await store.inspect("parent")).events.at(-1)?.type).toBe("recovery/committed");
      const child = await store.fork({ parentSessionId: "parent", newSessionId: "child", boundarySeq: 0, createdAt: "2026-10-04T00:00:01.000Z", createdWith });
      expect(child.journal.events[0]?.type).toBe("user/message"); await child.close();
      expect(await store.listSessionIds()).toEqual(["child", "parent"]);
    } finally { await storage.close(); }
  });
});
