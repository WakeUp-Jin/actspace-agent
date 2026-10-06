import { describe, expect, it } from "vitest";
import { apply } from "../plugin.js";
import { CordisContextClass } from "@actspace/cordis-adapter";

describe("context plugin lifecycle", () => {

  it("owns its engine factory through the Cordis lifecycle", async () => {
    const ctx = new CordisContextClass();
    await ctx.plugin({ apply: (inner) => apply(inner as never) });
    expect(ctx.get("context.engine")).toHaveProperty("create");
    await ctx.fiber.dispose();
    expect(ctx.get("context.engine")).toBeUndefined();
  });
});
