import { describe, expect, it } from "vitest";
import { apply, inject } from "../plugin.js";
import { CordisContextClass } from "@actspace/cordis-adapter";
import { createCoreCodecRegistry } from "@actspace/session-journal";
import { MemorySessionStorage } from "@actspace/session-storage/testing";
import { SessionStoreService } from "../session-store.js";

describe("Session business plugin", () => {
  it("uses the injected storage and withdraws its store on disposal", async () => {
    const ctx = new CordisContextClass(); const registry = createCoreCodecRegistry();
    const storage = new MemorySessionStorage(registry);
    ctx.provide("session.journal", { registry }); ctx.provide("session.storage", storage);
    await ctx.plugin({ inject, apply: inner => apply(inner as never) });
    expect(ctx.get("session.store")).toBeInstanceOf(SessionStoreService);
    expect((ctx.get("session.store") as SessionStoreService).store.storage).toBe(storage);
    await ctx.fiber.dispose(); expect(ctx.get("session.store")).toBeUndefined();
    await storage.close();
  });
});
