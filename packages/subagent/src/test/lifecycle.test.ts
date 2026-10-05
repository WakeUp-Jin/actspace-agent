import { CordisContextClass } from "@actspace/cordis-adapter";
import { describe, expect, it } from "vitest";
import { apply } from "../plugin.js";

describe("subagent plugin lifecycle", () => {
  it("publishes the one-shot subagent behavior entry and disposes", async () => {
    const ctx = new CordisContextClass();
    await ctx.plugin({ apply: inner => apply(inner as never) });
    expect(ctx.get("subagent.one-shot")).toMatchObject({ OneShotSubagentProvider: expect.any(Function) });
    await ctx.fiber.dispose();
  });
});
