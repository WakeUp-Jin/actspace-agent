import { CordisContextClass } from "@actspace/cordis-adapter";
import { describe, expect, it } from "vitest";
import { apply } from "../plugin.js";

describe("core scope plugin lifecycle", () => {
  it("publishes the scope behavior entry and disposes", async () => {
    const ctx = new CordisContextClass();
    await ctx.plugin({ apply: inner => apply(inner as never) });
    expect(ctx.get("core.scope")).toMatchObject({ AgentScope: expect.any(Function) });
    await ctx.fiber.dispose();
  });
});
