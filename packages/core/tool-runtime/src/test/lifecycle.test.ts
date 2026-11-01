import { describe, expect, it } from "vitest";
import { apply } from "../plugin.js";
import { CordisContextClass } from "@actspace/cordis-adapter";
import { ToolRuntimeService } from "../runtime.js";

describe("tool runtime plugin", () => {

  it("publishes the registry and scheduler from a Cordis-owned Service", async () => {
    const ctx = new CordisContextClass();
    await ctx.plugin({ apply: (inner) => apply(inner as never) });
    expect(ctx.get("tools.runtime")).toBeInstanceOf(ToolRuntimeService);
    expect((ctx.get("tools.runtime") as ToolRuntimeService).scheduler).toBeDefined();
    await ctx.fiber.dispose();
    expect(ctx.get("tools.runtime")).toBeUndefined();
  });
});
