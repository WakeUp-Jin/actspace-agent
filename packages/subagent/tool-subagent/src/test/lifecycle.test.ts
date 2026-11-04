import { ToolRuntime, type ToolPreparedEnvironment } from "@actspace/tool-runtime";
import { describe, expect, it } from "vitest";
import { manifest } from "../manifest.js";
import { apply, inject } from "../plugin.js";

function setup() {
  const tools = new ToolRuntime();
  const provided = new Map<string, unknown>();
  let cleanup: (() => Promise<void>) | undefined;
  const calls: unknown[] = [];
  const reply = (name: string) => async (input: unknown) => { calls.push({ name, input }); return name === "interrupt" ? { ok: false, code: "UNKNOWN_AGENT", text: "Unknown agent x." } : { ok: true, text: `${name} ok`, ...(name === "spawn" ? { detail: [{ label: "actspace.context.trace", value: { kind: "trace", path: "/t.md", description: "Subagent transcript: x" } }] } : {}) }; };
  const port = { spawn: reply("spawn"), spawnFork: reply("spawnFork"), sendMessage: reply("sendMessage"), waitForInput: reply("waitForInput"), listAgents: reply("listAgents"), interrupt: reply("interrupt"), listModels: reply("listModels"), running: () => [] };
  const services: Record<string, unknown> = { "tools.runtime": tools, "agent.registry": { list: () => [] }, "actspace.host.subagents": port };
  apply({ get: (id: string) => services[id], provide: (id: string, value: unknown) => { provided.set(id, value); }, effect: (factory: () => () => Promise<void>) => { cleanup = factory(); } } as never);
  const env: ToolPreparedEnvironment = {
    workspaceRoot: "/workspace", hostCapabilities: new Set(), capabilitySet: { ids: [], has: () => false, get: () => { throw Error("unused"); } },
    journal: { recordDispatch: async () => {}, checkpointBeforeBody: async () => {}, commitResult: async () => {} }, createArtifact: async () => { throw Error("unused"); },
  };
  const run = async (name: string, args: unknown) => (await tools.executeBatch([{ name, callId: `${name}-1`, arguments: args, sessionId: "s", agentRunId: "r", turnId: "t", stepId: "step" }], env))[0]!;
  return { provided, run, calls, tools, cleanup: () => cleanup!() };
}

describe("subagent tools plugin lifecycle", () => {
  it("declares the Entry and the injects it consumes", () => {
    const behavior = manifest.behaviors[0]!;
    expect(behavior.entryId).toBe("subagent-tools");
    expect([...(behavior.injects ?? [])]).toEqual(inject);
  });

  it("registers the seven subagent tools, forwards calls to the Host and removes them on dispose", async () => {
    const { provided, run, calls, tools, cleanup } = setup();
    expect((provided.get("tools.subagents") as { registrations: { name: string }[] }).registrations.map(item => item.name)).toEqual(["agent", "agent_fork", "send_message", "wait_agent", "list_agents", "interrupt_agent", "list_subagent_models"]);
    expect((await run("agent", {})).status).toBe("failed");
    const spawned = await run("agent", { description: "review auth", prompt: "Review it." });
    expect(spawned).toMatchObject({ status: "completed", modelOutput: [{ type: "text", text: "spawn ok" }], detail: [{ label: "actspace.context.trace" }] });
    expect(calls[0]).toMatchObject({ name: "spawn", input: { sessionId: "s", callId: "agent-1", description: "review auth", prompt: "Review it.", preset: "general", background: true } });
    expect((await run("agent", { description: "x".repeat(61), prompt: "p" })).status).toBe("failed");
    // agent_fork takes no agent_preset and forwards the caller's visible tools.
    expect((await run("agent_fork", { description: "try B", prompt: "Try the other approach.", agent_preset: "general" })).status).toBe("failed");
    expect((await run("agent_fork", { description: "try B", prompt: "Try the other approach.", background: false })).status).toBe("completed");
    expect(calls.at(-1)).toMatchObject({ name: "spawnFork", input: { sessionId: "s", callId: "agent_fork-1", description: "try B", prompt: "Try the other approach.", background: false } });
    expect((calls.at(-1) as { input: { parentToolNames: string[] } }).input.parentToolNames).toContain("agent_fork");
    // Without a model the fork keeps the parent's, so its text differs from agent's.
    const schema = (name: string) => tools.registry.listDefinitions().find(item => item.name === name)!.inputSchema as { properties: { model: { description: string } } };
    expect(schema("agent_fork").properties.model.description).toBe("Model key from list_subagent_models. Omit to use the parent's model (keeps the prompt cache).");
    expect(schema("agent").properties.model.description).toBe("Model key from list_subagent_models. Omit to use the default subagent model.");
    expect((await run("wait_agent", {})).status).toBe("completed");
    expect(calls.at(-1)).toMatchObject({ name: "waitForInput", input: { timeoutMs: 30000 } });
    expect((await run("wait_agent", { timeout_ms: 5000 })).status).toBe("failed");
    expect((await run("send_message", { agent_id: "a", message: "m".repeat(20_001) })).status).toBe("failed");
    expect(await run("interrupt_agent", { agent_id: "x" })).toMatchObject({ status: "failed", modelOutput: [{ type: "text", text: "Unknown agent x." }], failure: { code: "UNKNOWN_AGENT" } });
    await cleanup();
    await expect(run("agent", { description: "x", prompt: "x" })).rejects.toMatchObject({ failure: { code: "TOOL_NOT_FOUND" } });
  });
});
