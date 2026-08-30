import { describe, expect, it } from "vitest";
import { activate, apply, inject } from "../plugin.js";
import { CordisContextClass } from "@actspace/cordis-adapter";
import { createCoreCodecRegistry } from "@actspace/session-journal";
import { JsonlSessionPersistenceService } from "../session-persistence.js";
import { SessionStoreService } from "../session-store.js";

describe("session persistence plugin", () => {
  it("publishes lease and recovery service and disposes", async () => {
    const activation = activate();
    expect(activation.services?.["session.persistence"]).toBeDefined();
    await activation.dispose();
  });

  it("publishes JSONL persistence as a real Cordis Service with injected host/journal", async () => {
    const ctx = new CordisContextClass();
    ctx.provide("actspace.host.session", { dataRoot: "/tmp/actspace-session-test", runtimeId: "test" });
    ctx.provide("session.journal", { registry: createCoreCodecRegistry() });
    await ctx.plugin({ inject, apply: (inner, config) => apply(inner as never, config as Record<string, unknown>) });
    expect(ctx.get("session.persistence")).toBeInstanceOf(JsonlSessionPersistenceService);
    await ctx.fiber.dispose();
    expect(ctx.get("session.persistence")).toBeUndefined();
  });

  it("creates SessionStore as a Cordis-owned live-log service over the injected provider", async () => {
    const ctx = new CordisContextClass();
    ctx.provide("actspace.host.session", { dataRoot: "/tmp/actspace-session-test", runtimeId: "test" });
    ctx.provide("session.journal", { registry: createCoreCodecRegistry() });
    await ctx.plugin({ inject, apply: (inner, config) => apply(inner as never, config as Record<string, unknown>) });
    await ctx.plugin(SessionStoreService);
    expect(ctx.get("session.store")).toBeInstanceOf(SessionStoreService);
    await ctx.fiber.dispose();
  });
});
