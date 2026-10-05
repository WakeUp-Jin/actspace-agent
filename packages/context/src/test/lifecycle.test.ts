import { describe, expect, it } from "vitest";
import { apply } from "../plugin.js";
import { CordisContextClass } from "@actspace/cordis-adapter";
import { ContextAssemblerService } from "../assembly.js";

describe("context plugin lifecycle", () => {

  it("owns contributor assembly through a Cordis Service", async () => {
    const ctx = new CordisContextClass();
    await ctx.plugin({ apply: (inner) => apply(inner as never) });
    expect(ctx.get("context.assembly")).toBeInstanceOf(ContextAssemblerService);
    await ctx.fiber.dispose();
    expect(ctx.get("context.assembly")).toBeUndefined();
  });
});
