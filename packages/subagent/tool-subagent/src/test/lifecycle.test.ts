import { ToolRuntime, type ToolPreparedEnvironment } from "@actspace/tool-runtime";
import { describe, expect, it } from "vitest";
import { manifest } from "../manifest.js";
import { apply, inject } from "../plugin.js";

function setup() {
  const tools = new ToolRuntime();
  const provided = new Map<string, unknown>();
  let cleanup: (() => Promise<void>) | undefined;
  const provider = { invoke: async () => { throw new Error("unused"); }, launch: async () => { throw new Error("unused"); } };
  const services: Record<string, unknown> = { "tools.runtime": tools, "agent.registry": { list: () => [] }, "actspace.host.subagents": provider };
  apply({ get: (id: string) => services[id], provide: (id: string, value: unknown) => { provided.set(id, value); }, effect: (factory: () => () => Promise<void>) => { cleanup = factory(); } } as never);
  const env: ToolPreparedEnvironment = {
    workspaceRoot: "/workspace", hostCapabilities: new Set(), capabilitySet: { ids: [], has: () => false, get: () => { throw Error("unused"); } },
    journal: { recordDispatch: async () => {}, checkpointBeforeBody: async () => {}, commitResult: async () => {} }, createArtifact: async () => { throw Error("unused"); },
  };
  const run = async (name: string, args: unknown) => (await tools.executeBatch([{ name, callId: `${name}-1`, arguments: args, sessionId: "s", agentRunId: "r", turnId: "t", stepId: "step" }], env))[0]!;
  return { provided, run, cleanup: () => cleanup!() };
}

describe("subagent tools plugin lifecycle", () => {
  it("declares the Entry and the injects it consumes", () => {
    const behavior = manifest.behaviors[0]!;
    expect(behavior.entryId).toBe("subagent-tools");
    expect([...(behavior.injects ?? [])]).toEqual(inject);
  });

  it("registers agent and explore, then removes them on dispose", async () => {
    const { provided, run, cleanup } = setup();
    expect(provided.get("tools.subagents")).toMatchObject({ registrations: [{ name: "agent" }, { name: "explore" }] });
    expect((await run("agent", {})).status).toBe("failed");
    await cleanup();
    await expect(run("agent", { task: "x" })).rejects.toMatchObject({ failure: { code: "TOOL_NOT_FOUND" } });
  });
});
