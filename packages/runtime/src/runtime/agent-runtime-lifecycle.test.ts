import { describe, expect, it } from "vitest";
import { CordisContextClass } from "@actspace/cordis-adapter";
import { ToolRuntime } from "@actspace/tools-runtime";
import { apply, AgentRuntimeService } from "./agent-runtime-plugin.js";

describe("agent runtime service lifecycle", () => {
  it("owns run, subagent and built-in tool registrations through Cordis", async () => {
    const ctx = new CordisContextClass();
    ctx.provide("actspace.host.agent", {
      host: { hostKind: "cli-run", capabilityCeiling: [], runtimeContract: "actspace.runtime.v2", invocationId: "fixture" },
      toolEnvironment: {},
      workspaceRoot: "/workspace",
      compositionDigest: "composition",
      hostCapabilityDigest: "capabilities",
      plugins: [],
    });
    ctx.provide("agent.registry", {});
    ctx.provide("agent.loop", {});
    ctx.provide("actspace.agent.factory", {
      activeSessions: new Map(),
      create: async () => { throw new Error("fixture factory should not be called"); },
      createSubagentLoop: async () => { throw new Error("fixture child factory should not be called"); },
    });
    ctx.provide("session.runtime", { store: {} });
    ctx.provide("tools.runtime", new ToolRuntime());
    ctx.provide("subagent.one-shot", await import("@actspace/subagent"));

    await ctx.plugin({ inject: ["actspace.host.agent", "agent.registry", "agent.loop", "actspace.agent.factory", "session.runtime", "tools.runtime", "subagent.one-shot"], apply: (inner) => apply(inner as never) });
    expect(ctx.get("agent.runtime")).toBeInstanceOf(AgentRuntimeService);
    await ctx.fiber.dispose();
    expect(ctx.get("agent.runtime")).toBeUndefined();
  });
});
