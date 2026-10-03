import { describe, expect, it } from "vitest";
import { activate, apply } from "../plugin.js";
import { CordisContextClass } from "@actspace/cordis-adapter";

describe("agent loop plugin", () => {
  it("publishes the AgentLoop behavior entry", async () => {
    const activation = activate();
    expect(activation.services?.["core.agent-loop"]).toMatchObject({ AgentLoop: expect.any(Function) });
    await activation.dispose();
  });

  it("publishes a Loop implementation without a Session driver", async () => {
    const ctx = new CordisContextClass();
    await ctx.plugin({ apply: inner => apply(inner as never) });
    expect(ctx.get("core.agent-loop")).toMatchObject({ AgentLoop: expect.any(Function) });
    expect(ctx.get("agent.loop")).toBeUndefined();
    await ctx.fiber.dispose();
  });
});
