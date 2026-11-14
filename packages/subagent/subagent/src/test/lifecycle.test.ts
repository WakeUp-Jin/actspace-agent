import { CordisContextClass } from "@actspace/cordis-adapter";
import { describe, expect, it } from "vitest";
import { manifest } from "../manifest.js";
import { apply } from "../plugin.js";

describe("subagent plugin lifecycle", () => {
  it("publishes the subagent manager behavior entry and disposes", async () => {
    expect(manifest.behaviors[0].entryId).toBe("subagent.manager");
    const ctx = new CordisContextClass();
    await ctx.plugin({ apply: (inner) => apply(inner as never) });
    expect(ctx.get("subagent.manager")).toMatchObject({
      SubagentManager: expect.any(Function),
      subagentToolNames: expect.any(Function),
    });
    await ctx.fiber.dispose();
  });
});
