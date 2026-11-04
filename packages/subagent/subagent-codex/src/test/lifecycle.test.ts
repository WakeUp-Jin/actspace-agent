import { ToolRuntime, type ToolPreparedEnvironment } from "@actspace/tool-runtime";
import { describe, expect, it, vi } from "vitest";
import { manifest } from "../manifest.js";
import { apply, inject } from "../plugin.js";

// Lifecycle contract: the plugin registers `agent_codex` only when `codex` resolves, and removes it on dispose.
const lookup = vi.hoisted(() => ({ path: undefined as string | undefined, cleared: [] as (string | undefined)[] }));
vi.mock("@actspace/subagent", async original => ({
  ...await original<typeof import("@actspace/subagent")>(),
  resolveCommand: async () => lookup.path,
  clearCommandCache: (name?: string) => { lookup.cleared.push(name); },
}));

async function setup(path: string | undefined, config?: Record<string, unknown>) {
  lookup.path = path;
  const tools = new ToolRuntime();
  const provided = new Map<string, unknown>();
  let cleanup: (() => Promise<void>) | undefined;
  const calls: { backend: { kind: string; toolName: string }; input: unknown }[] = [];
  const port = { spawnExternal: async (backend: { kind: string; toolName: string }, input: unknown) => { calls.push({ backend, input }); return { ok: true, text: "started" }; } };
  const services: Record<string, unknown> = { "tools.runtime": tools, "agent.registry": { list: () => [] }, "actspace.host.subagents": port };
  await apply({ get: (id: string) => services[id], provide: (id: string, value: unknown) => { provided.set(id, value); }, effect: (factory: () => () => Promise<void>) => { cleanup = factory(); } } as never, config);
  const env: ToolPreparedEnvironment = {
    workspaceRoot: "/workspace", hostCapabilities: new Set(), capabilitySet: { ids: [], has: () => false, get: () => { throw Error("unused"); } },
    journal: { recordDispatch: async () => {}, checkpointBeforeBody: async () => {}, commitResult: async () => {} }, createArtifact: async () => { throw Error("unused"); },
  };
  const run = async (args: unknown) => (await tools.executeBatch([{ name: "agent_codex", callId: "c-1", arguments: args, sessionId: "s", agentRunId: "r", turnId: "t", stepId: "step" }], env))[0]!;
  return { provided, run, calls, cleanup: () => cleanup!() };
}

describe("Codex subagent plugin lifecycle", () => {
  it("declares the Entry and the injects it consumes", () => {
    const behavior = manifest.behaviors[0]!;
    expect(behavior.entryId).toBe("subagent.codex");
    expect([...(behavior.injects ?? [])]).toEqual(inject);
  });

  it("registers agent_codex when codex is installed, forwards calls to the Host and removes it on dispose", async () => {
    const { provided, run, calls, cleanup } = await setup("/opt/bin/codex");
    expect(provided.get("tools.subagent-codex")).toEqual({ availability: { ok: true, command: "/opt/bin/codex" } });
    expect((await run({})).status).toBe("failed");
    expect(await run({ description: "list packages", prompt: "List them.", model: " gpt-5.5 " })).toMatchObject({ status: "completed", modelOutput: [{ type: "text", text: "started" }] });
    expect(calls[0]).toMatchObject({ backend: { kind: "codex", toolName: "agent_codex" }, input: { sessionId: "s", callId: "c-1", description: "list packages", prompt: "List them.", background: true, model: "gpt-5.5" } });
    await cleanup();
    expect(lookup.cleared).toContain("codex");
    await expect(run({ description: "x", prompt: "x" })).rejects.toMatchObject({ failure: { code: "TOOL_NOT_FOUND" } });
  });

  it("registers nothing and reports why when codex is missing", async () => {
    const { provided, run, cleanup } = await setup(undefined);
    expect(provided.get("tools.subagent-codex")).toEqual({ availability: { ok: false, reason: "本机没有找到 codex 命令" } });
    await expect(run({ description: "x", prompt: "x" })).rejects.toMatchObject({ failure: { code: "TOOL_NOT_FOUND" } });
    await cleanup();
  });
});
