import { describe, expect, it } from "vitest";
import { apply } from "../plugin.js";
import { CordisContextClass } from "@actspace/cordis-adapter";

describe("agent loop plugin", () => {

  it("publishes a Loop implementation without a Session driver", async () => {
    const ctx = new CordisContextClass();
    await ctx.plugin({ apply: inner => apply(inner as never) });
    expect(ctx.get("core.agent-loop")).toMatchObject({ AgentLoop: expect.any(Function) });
    expect(ctx.get("agent.loop")).toBeUndefined();
    await ctx.fiber.dispose();
  });
});
