import { describe, expect, it } from "vitest";
import { CordisContextClass } from "@actspace/cordis-adapter";
import { apply } from "../plugin.js";

describe("context rules plugin lifecycle", () => {
  it("publishes and disposes its source factory", async () => {
    const ctx = new CordisContextClass();
    await ctx.plugin({ apply: inner => apply(inner as never) });
    expect(ctx.get("context.source.rules")).toHaveProperty("create");
    await ctx.fiber.dispose();
    expect(ctx.get("context.source.rules")).toBeUndefined();
  });
});
