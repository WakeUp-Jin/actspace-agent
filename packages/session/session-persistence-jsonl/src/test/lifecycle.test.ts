import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CordisContextClass } from "@actspace/cordis-adapter";
import { createCoreCodecRegistry } from "@actspace/session-journal";
import { apply, inject, JsonlSessionStorageService } from "../plugin.js";

describe("JSONL storage plugin", () => {
  it("publishes a real Host-owned provider and closes it on unload", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "jsonl-lifecycle-"));
    const ctx = new CordisContextClass();
    try {
      ctx.provide("actspace.host.session", { dataRoot, runtimeId: "test" });
      ctx.provide("session.journal", { registry: createCoreCodecRegistry() });
      await ctx.plugin({ inject, apply: inner => apply(inner as never) });
      const storage = ctx.get("session.storage") as JsonlSessionStorageService;
      expect(storage).toBeInstanceOf(JsonlSessionStorageService);
      await ctx.fiber.dispose(); expect(ctx.get("session.storage")).toBeUndefined();
      await expect(storage.listSessionIds()).rejects.toThrow("closed");
    } finally { await ctx.fiber.dispose(); await rm(dataRoot, { recursive: true, force: true }); }
  });
});
