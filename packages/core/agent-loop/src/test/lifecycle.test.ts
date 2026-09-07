import { describe, expect, it } from "vitest";
import { activate, apply } from "../plugin.js";
import { AgentLoopRuntimeService } from "../service.js";
import { CordisContextClass } from "@actspace/cordis-adapter";

describe("agent loop plugin", () => {
  it("publishes the AgentLoop behavior entry", async () => {
    const activation = activate();
    expect(activation.services?.["core.agent-loop"]).toMatchObject({ AgentLoop: expect.any(Function) });
    await activation.dispose();
  });

  it("owns the loop driver through a Cordis Service", async () => {
    const ctx = new CordisContextClass();
    ctx.provide("actspace.agent.factory", { create: async () => { throw new Error("fixture factory should not be called"); } });
    await ctx.plugin({ inject: ["actspace.agent.factory"], apply: (inner) => apply(inner as never) });
    expect(ctx.get("agent.loop")).toBeInstanceOf(AgentLoopRuntimeService);
    await ctx.fiber.dispose();
    expect(ctx.get("agent.loop")).toBeUndefined();
  });
});
