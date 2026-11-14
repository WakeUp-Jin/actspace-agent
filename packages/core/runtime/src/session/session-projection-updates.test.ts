import { describe, expect, it } from "vitest";
import { createCoreCodecRegistry } from "@actspace/session-journal";
import { SessionStore } from "@actspace/session-persistence";
import { MemorySessionStorage } from "@actspace/session-storage/testing";
import type { RuntimeSessionUpdate } from "@actspace/shared/runtime-v2";
import { RuntimeSessionController } from "./session-controller.js";

const registry = createCoreCodecRegistry();
const createdWith = {
  profileId: "test",
  runtimeContractVersion: "1",
  manifestDigest: "test",
  plugins: [],
  codecSetDigest: registry.digest,
};
const core = { ownerPluginId: "@actspace/core" } as const;

describe("projection updates sent to observers (journal-update values)", () => {
  it("carry contextEstimate only on events that change the context, frozen and shared", async () => {
    const storage = new MemorySessionStorage(registry);
    const store = new SessionStore({ registry }, storage);
    const controller = new RuntimeSessionController(
      { dataRoot: "/unused", runtimeId: "test", registry, profileId: "test", manifestDigest: "test", plugins: [] },
      store,
    );
    try {
      const created = await store.create({
        sessionId: "s",
        createdAt: "2026-11-05T00:00:00.000Z",
        lineage: null,
        createdWith,
      });
      await created.flush();
      await created.close();
      const updates: RuntimeSessionUpdate[] = [];
      const unsubscribe = controller.subscribeProjection((update) => {
        updates.push(update);
      });
      const session = await controller.resume("s");
      await session.append({
        type: "user/message",
        eventVersion: 1,
        source: core,
        data: { messageId: "u1", content: "hi" },
        surface: { kind: "append" },
      });
      await session.append({
        type: "session/title-set",
        eventVersion: 1,
        source: core,
        data: { title: "hello" },
        surface: null,
      });
      const byType = (type: string) => updates.find((update) => update.event.type === type)!;
      const changed = byType("user/message").values.contextEstimate;
      expect(changed).toBeDefined();
      expect(Object.isFrozen(changed)).toBe(true);
      expect(byType("session/title-set").values).not.toHaveProperty("contextEstimate");
      unsubscribe();
    } finally {
      await controller.closeAll();
      await storage.close();
    }
  });
});
