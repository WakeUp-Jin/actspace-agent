import { CordisContextClass } from "@actspace/cordis-adapter";
import { describe, expect, it } from "vitest";
import { apply } from "../plugin.js";

describe("pi-ai plugin", () => {
  it("publishes provider adapter constructors and disposes", async () => {
    const ctx = new CordisContextClass();
    await ctx.plugin({ apply: inner => apply(inner as never) });
    expect(ctx.get("llm.route.pi-ai")).toMatchObject({ PiAiAdapter: expect.any(Function) });
    await ctx.fiber.dispose();
  });
});
