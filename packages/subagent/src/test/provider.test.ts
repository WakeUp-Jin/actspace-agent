import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCoreCodecRegistry } from "@actspace/session-journal";
import { applySessionRecovery, SessionStore } from "@actspace/session-persistence";
import { EMPTY_LLM_USAGE } from "@actspace/llm-service";
import { AgentScope } from "@actspace/core-scope";
import { createBuiltInPresets, StaticPresetRegistry } from "../preset.js";
import { OneShotSubagentProvider } from "../provider.js";
import { publishSubagentTerminal, repairSubagentPublications } from "../publication.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "actspace-subagent-")); roots.push(root);
  const registry = createCoreCodecRegistry(); const store = new SessionStore({ dataRoot: root, runtimeId: "runtime", registry });
  const parent = await store.create({ sessionId: "parent", createdAt: "2026-08-22T12:00:00.000Z", lineage: null, createdWith: { profileId: "base", runtimeContractVersion: "2", manifestDigest: "manifest", plugins: [{ id: "@actspace/core", version: "2" }], codecSetDigest: registry.digest } });
  const parentScope = new AgentScope("main", undefined, "root");
  return { root, registry, store, parent, parentScope };
}

describe("one-shot Subagent provider", () => {
  it("uses one provider for Agent and Explore with child lineage and one parent link", async () => {
    const { store, parent, parentScope } = await fixture(); const links: string[] = [];
    const presets = createBuiltInPresets(["read_file", "write_file", "grep"]);
    const childAgentIds: string[] = [];
    const provider = new OneShotSubagentProvider({ store, presets, manifestDigest: "manifest", plugins: [{ id: "@actspace/core", version: "2" }], parentPort: {
      recordRequested: async ({ invocationId, parentCallId, presetId }) => { await parent.append({ type: "delegation/requested", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { invocationId, parentCallId, presetId }, surface: null }); },
      recordTerminal: async (result) => { links.push(result.childSessionId); await parent.append({ type: "delegation/completed", eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data: { invocationId: result.invocationId, childSessionId: result.childSessionId, status: result.status }, surface: null }); },
    }, createLoop: ({ preset, allowedToolNames, agentId }) => { childAgentIds.push(agentId); return { runTurn: async () => ({ agentRunId: "run", turnId: "turn", reason: "completed", steps: 1, finalText: `${preset.id}:${allowedToolNames.join(",")}` }) } as never; } });
    const agent = await provider.invoke({ parentSession: parent, parentScope, parentCallId: "call-agent", presetId: "actspace.agent", task: "write", parentVisibleToolIds: ["read_file", "write_file"], delegationDepth: 0 });
    const explore = await provider.invoke({ parentSession: parent, parentScope, parentCallId: "call-explore", presetId: "actspace.explore", task: "read", parentVisibleToolIds: ["read_file", "write_file", "grep"], delegationDepth: 0 });
    expect(agent.text).toBe("actspace.agent:read_file");
    expect(explore.text).toBe("actspace.explore:grep,read_file");
    expect(links).toEqual([agent.childSessionId, explore.childSessionId]);
    expect(new Set(childAgentIds).size).toBe(2);
    const child = await store.inspect(explore.childSessionId);
    expect(child.header?.lineage).toMatchObject({ parentSessionId: "parent", parentCallId: "call-explore", origin: "delegation", delegationDepth: 1 });
    await parent.close(); await parentScope.dispose();
  });

  it("restricts both built-in presets and provides a 300-step budget", () => {
    const presets = createBuiltInPresets(["read_file", "list_directory", "grep", "glob", "bash", "write_file", "edit_file", "agent", "web_fetch"]);
    for (const preset of presets.list()) {
      expect(preset.allowedToolNames).toEqual(["glob", "grep", "list_directory", "read_file"]);
      expect(preset.readOnly).toBe(true);
      expect(preset.maxSteps).toBe(300);
      expect(preset.maxDurationMs).toBe(1_800_000);
    }
  });

  it("persists the step-limit reason and partial findings", async () => {
    const { store, parent, parentScope } = await fixture();
    const provider = new OneShotSubagentProvider({ store, presets: createBuiltInPresets([]), manifestDigest: "manifest", plugins: [],
      createLoop: () => ({ runTurn: async () => ({ reason: "step-limit", steps: 300, finalText: "Target files were not found." }) }) as never });
    const result = await provider.invoke({ parentSession: parent, parentScope, parentCallId: "limit", presetId: "actspace.agent", task: "inspect", parentVisibleToolIds: [], delegationDepth: 0 });
    expect(result).toMatchObject({ status: "failed", text: "Target files were not found.", failure: { code: "SUBAGENT_STEP_LIMIT", retryable: false } });
    expect(result.failure?.message).toContain("300");
    const child = await store.inspect(result.childSessionId);
    expect(child.events.at(-1)).toMatchObject({ type: "delegation/child-terminal", data: { failure: { code: "SUBAGENT_STEP_LIMIT" }, text: result.text } });
    await parent.close(); await parentScope.dispose();
  });

  it("reports timeout separately from cancellation", async () => {
    const { store, parent, parentScope } = await fixture();
    const presets = new StaticPresetRegistry();
    presets.register({ ...createBuiltInPresets([]).get("actspace.agent"), maxDurationMs: 5 });
    const provider = new OneShotSubagentProvider({ store, presets, manifestDigest: "manifest", plugins: [],
      createLoop: ({ signal }) => ({ abort: () => undefined, runTurn: async () => {
        if (!signal.aborted) await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
        return { reason: "aborted", steps: 1, finalText: "Partial result" };
      } }) as never });
    const result = await provider.invoke({ parentSession: parent, parentScope, parentCallId: "timeout", presetId: "actspace.agent", task: "inspect", parentVisibleToolIds: [], delegationDepth: 0 });
    expect(result).toMatchObject({ status: "aborted", text: "Partial result", failure: { code: "SUBAGENT_TIMEOUT" } });
    expect(provider.activeCount).toBe(0);
    await parent.close(); await parentScope.dispose();
  });

  it("rejects a malformed read-only preset before starting a child", async () => {
    const { store, parent, parentScope } = await fixture();
    const presets = new StaticPresetRegistry();
    presets.register({ ...createBuiltInPresets([]).get("actspace.agent"), allowedToolNames: ["bash"] });
    const provider = new OneShotSubagentProvider({ store, presets, manifestDigest: "manifest", plugins: [], createLoop: () => { throw new Error("must not start"); } });
    await expect(provider.invoke({ parentSession: parent, parentScope, parentCallId: "unsafe", presetId: "actspace.agent", task: "inspect", parentVisibleToolIds: ["bash"], delegationDepth: 0 })).rejects.toThrow("Read-only subagent preset cannot receive side-effect tools");
    expect(await store.listSessionIds()).toEqual(["parent"]);
    await parent.close(); await parentScope.dispose();
  });

  it("rejects nested delegation beyond the static preset depth", async () => {
    const { store, parent, parentScope } = await fixture();
    const provider = new OneShotSubagentProvider({ store, presets: createBuiltInPresets([]), manifestDigest: "manifest", plugins: [], parentPort: { recordRequested: async () => undefined, recordTerminal: async () => undefined }, createLoop: () => ({}) as never });
    await expect(provider.invoke({ parentSession: parent, parentScope, parentCallId: "call", presetId: "actspace.agent", task: "nested", parentVisibleToolIds: [], delegationDepth: 1 })).rejects.toThrow("depth exceeded");
    await parent.close(); await parentScope.dispose();
  });

  it("supports explicit isolated child scope without changing default inheritance", async () => {
    const { store, parent, parentScope } = await fixture();
    let inheritedParent: AgentScope | undefined;
    const provider = new OneShotSubagentProvider({
      store,
      presets: createBuiltInPresets(["read_file"]),
      manifestDigest: "manifest",
      plugins: [],
      createLoop: ({ scope }) => {
        inheritedParent = scope.parent;
        return { runTurn: async () => ({ agentRunId: "run", turnId: "turn", reason: "completed" as const, steps: 1, finalText: "ok" }) } as never;
      },
    });
    await provider.invoke({ parentSession: parent, parentScope, parentCallId: "default", presetId: "actspace.agent", task: "default", parentVisibleToolIds: ["read_file"], delegationDepth: 0 });
    expect(inheritedParent).toBe(parentScope);
    await provider.invoke({ parentSession: parent, parentScope, parentCallId: "isolated", presetId: "actspace.agent", task: "isolated", parentVisibleToolIds: ["read_file"], delegationDepth: 0, isolatedScope: true });
    expect(inheritedParent).toBeUndefined();
    await parent.close(); await parentScope.dispose();
  });

  it("repairs the child-terminal to parent-link crash window exactly once without rerunning the child", async () => {
    const { store, parent, parentScope } = await fixture();
    await prepareDispatchedSubagentCall(parent, "call-crash");
    let terminalAttempts = 0;
    let childRuns = 0;
    const provider = new OneShotSubagentProvider({
      store,
      presets: createBuiltInPresets(["actspace.core-tools/read_file"]),
      manifestDigest: "manifest",
      plugins: [{ id: "@actspace/core", version: "2" }],
      parentPort: {
        recordRequested: async ({ invocationId, parentCallId, presetId }) => {
          await parent.append(core("delegation/requested", { invocationId, parentCallId, presetId }));
          await parent.flush();
        },
        recordTerminal: async () => {
          terminalAttempts += 1;
          throw new Error("simulated crash before parent link");
        },
      },
      createLoop: () => ({
        runTurn: async () => {
          childRuns += 1;
          return { agentRunId: "run", turnId: "turn", reason: "completed", steps: 1, finalText: "durable child answer" };
        },
      }) as never,
    });

    await expect(provider.invoke({ parentSession: parent, parentScope, parentCallId: "call-crash", presetId: "actspace.agent", task: "inspect", parentVisibleToolIds: ["actspace.core-tools/read_file"], delegationDepth: 0 })).rejects.toThrow("simulated crash");
    expect(provider.activeCount).toBe(0);
    expect(childRuns).toBe(1);
    expect(terminalAttempts).toBe(1);
    const childSessionId = (await store.listSessionIds()).find((sessionId) => sessionId !== "parent");
    expect(childSessionId).toBeDefined();
    const child = await store.inspect(childSessionId!);
    expect(child.events.filter((event) => event.type === "delegation/child-terminal")).toHaveLength(1);
    const orphan = await store.create({
      sessionId: "orphan-child",
      createdAt: "2026-08-23T00:00:00.000Z",
      lineage: { parentSessionId: "parent", parentBoundarySeq: parent.lastSeq, parentCallId: "orphan-call", seedDigest: "orphan-seed", origin: "delegation", delegationDepth: 1 },
      createdWith: { ...child.header!.createdWith, presetId: "actspace.agent" },
    });
    await publishSubagentTerminal(orphan, { invocationId: "orphan-invocation", childAgentId: "orphan-agent", childSessionId: "orphan-child", presetId: "actspace.agent", status: "completed", text: "must not be linked", usage: EMPTY_LLM_USAGE, toolUseCount: 0, durationMs: 1, artifacts: [], failure: null });
    await orphan.close();
    await parent.close();

    const resumed = await store.open("parent");
    await expect(repairSubagentPublications({ store, parent: resumed })).resolves.toEqual({ repairedLinks: 1, repairedToolResults: 1 });
    await expect(repairSubagentPublications({ store, parent: resumed })).resolves.toEqual({ repairedLinks: 0, repairedToolResults: 0 });
    await applySessionRecovery(resumed);
    expect(resumed.journal.events.filter((event) => event.type === "delegation/completed")).toHaveLength(1);
    expect(resumed.journal.events.some((event) => event.type === "delegation/completed" && (event.data as { childSessionId?: string }).childSessionId === "orphan-child")).toBe(false);
    expect(resumed.journal.events.filter((event) => event.type === "tool/result" && (event.data as { callId?: string }).callId === "call-crash")).toHaveLength(1);
    expect(resumed.journal.events.some((event) => event.type === "tool/recovery-outcome")).toBe(false);
    expect(resumed.journal.validation.relations.openTurnId).toBeNull();
    expect(childRuns).toBe(1);
    await resumed.close();
    await parentScope.dispose();
  });

  it("cascades provider disposal into an active child and waits for terminal publication", async () => {
    const { store, parent, parentScope } = await fixture();
    const provider = new OneShotSubagentProvider({
      store,
      presets: createBuiltInPresets(["actspace.core-tools/read_file"]),
      manifestDigest: "manifest",
      plugins: [{ id: "@actspace/core", version: "2" }],
      createLoop: ({ signal }) => ({
        abort: () => undefined,
        runTurn: () => new Promise((resolve) => {
          const finish = () => resolve({ agentRunId: "run", turnId: "turn", reason: "aborted", steps: 0, finalText: "" });
          if (signal.aborted) finish(); else signal.addEventListener("abort", finish, { once: true });
        }),
      }) as never,
    });
    const invocation = provider.invoke({ parentSession: parent, parentScope, parentCallId: "call-abort", presetId: "actspace.agent", task: "wait", parentVisibleToolIds: ["actspace.core-tools/read_file"], delegationDepth: 0 });
    await waitFor(() => provider.activeCount === 1);
    await provider.dispose("runtime-shutdown");
    await expect(invocation).resolves.toMatchObject({ status: "aborted", failure: null });
    expect(provider.activeCount).toBe(0);
    const childSessionId = (await store.listSessionIds()).find((sessionId) => sessionId !== "parent");
    const child = await store.inspect(childSessionId!);
    expect(child.events.at(-1)).toMatchObject({ type: "delegation/child-terminal", data: { status: "aborted" } });
    expect(parent.journal.events.filter((event) => event.type === "delegation/completed")).toHaveLength(1);
    await parent.close();
    await parentScope.dispose();
  });
});

async function prepareDispatchedSubagentCall(parent: Awaited<ReturnType<typeof fixture>>["parent"], callId: string): Promise<void> {
  await parent.appendMany([
    core("turn/start", { turnId: "turn-crash" }),
    core("step/start", { turnId: "turn-crash", stepId: "step-crash" }),
    core("tool/call", { callId, name: "agent" }),
    core("tool-workflow/run-start", { callId }),
  ]);
  await parent.flush();
}

function core(type: string, data: Record<string, unknown>) {
  return { type, eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data, surface: null } as never;
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error("condition did not become true");
}
