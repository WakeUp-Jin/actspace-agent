import { CordisContextClass } from "@actspace/cordis-adapter";
import { describe, expect, it } from "vitest";
import { apply } from "../plugin.js";

describe("approval plugin", () => {
  it("publishes the host approval seam and disposes", async () => {
    const ctx = new CordisContextClass();
    await ctx.plugin({ apply: inner => apply(inner as never) });
    expect(ctx.get("tools.approval")).toBeDefined();
    await ctx.fiber.dispose();
  });
});
