import { CordisContextClass } from "@actspace/cordis-adapter";
import { describe, expect, it } from "vitest";
import { apply } from "../plugin.js";

describe("session journal plugin", () => {
  it("publishes codec-aware journal service and disposes", async () => {
    const ctx = new CordisContextClass();
    await ctx.plugin({ apply: inner => apply(inner as never) });
    expect(ctx.get("session.journal")).toBeDefined();
    await ctx.fiber.dispose();
  });
});
