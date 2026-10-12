import { describe, expect, it } from "vitest";
import { CordisContextClass } from "@actspace/cordis-adapter";
import { apply } from "../plugin.js";

describe("context disclosure plugin lifecycle", () => {
  it("disables cleanly when the optional host capability is absent", async () => {
    const ctx = new CordisContextClass();
    await ctx.plugin({ apply: inner => apply(inner as never) });
    expect(ctx.get("context.disclosure")).toBeUndefined();
    await ctx.fiber.dispose();
    expect(ctx.get("context.disclosure")).toBeUndefined();
  });
});
