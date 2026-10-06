import { describe, expect, it } from "vitest";
import { apply, PROMPT_HOST_PORT_ID } from "../plugin.js";
import { CordisContextClass } from "@actspace/cordis-adapter";
import { SystemPromptService } from "../plugin.js";

describe("prompt plugin lifecycle", () => {

  it("owns prompt source cache through a Cordis Service", async () => {
    const ctx = new CordisContextClass();
    ctx.provide(PROMPT_HOST_PORT_ID, { workspaceRoot: "/workspace" });
    await ctx.plugin({ inject: [PROMPT_HOST_PORT_ID], apply: (inner) => apply(inner as never) });
    expect(ctx.get("prompt.runtime")).toBeInstanceOf(SystemPromptService);
    await ctx.fiber.dispose();
    expect(ctx.get("prompt.runtime")).toBeUndefined();
  });
});
