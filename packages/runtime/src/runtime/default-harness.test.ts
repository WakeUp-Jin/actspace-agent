import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { createCordisRoot } from "@actspace/cordis-adapter";
import { AgentRuntimeService } from "./agent-runtime-plugin.js";
import { AgentRegistry } from "@actspace/core-agent";
import { AgentService, TaskLedger, taskCodecs } from "@actspace/agent-service";
import { createCoreCodecRegistry } from "@actspace/session-journal";
import { EMPTY_LLM_USAGE } from "@actspace/llm-service";
import { emptyRuntimePromptSource } from "@actspace/prompt";
import { prepareDefaultHarnessArtifact } from "./default-harness.js";
import { ManagedRuns } from "./managed-runs.js";
import { RuntimeSessionController } from "./session-controller.js";

it("executes the default Loop from its fixed closure with Harness-owned policies", async () => {
  const directory = await mkdtemp(join(tmpdir(), "actspace-default-harness-"));
  const root = await createCordisRoot();
  const registry = createCoreCodecRegistry(); taskCodecs.forEach(codec => registry.register(codec));
  const sessions = new RuntimeSessionController({ dataRoot: directory, runtimeId: "fixed-default", registry, profileId: "test", manifestDigest: "test", plugins: [] });
  const host = { hostKind: "cli-run" as const, capabilityCeiling: [], runtimeContract: "actspace.runtime.v2" as const, invocationId: "fixed-default" };
  const toolEnvironment = { workspaceRoot: directory, hostCapabilities: new Set<string>(), capabilitySet: { ids: [], has: () => false, get: <T>() => ({}) as T }, createArtifact: async () => { throw new Error("unused"); } };
  const agentRegistry = new AgentRegistry();
  let holdRequest = false;
  let requestEntered!: () => void;
  const entered = new Promise<void>(resolve => { requestEntered = resolve; });
  const ports = {
    "agent.registry": agentRegistry,
    ...Object.fromEntries(["filesystem-read", "filesystem-search", "filesystem-write", "shell-tools", "web-tools", "image-generation", "image-inspection"].map(id => [`actspace.host.tools.${id}`, { createPorts: () => ({}) }])),
    "session.runtime": sessions,
    "session.journal": { registry },
    "session.projection": {},
    "actspace.host.agent": { host, toolEnvironment, workspaceRoot: directory, compositionDigest: "test", hostCapabilityDigest: "test", plugins: [] },
    "actspace.host.prompt": { workspaceRoot: directory, resolveSource: async () => emptyRuntimePromptSource() },
    "actspace.host.llm": { credentials: { resolve: async () => ({}) }, routes: [{ routeId: "default", providerId: "test", modelPattern: "*", credentialRef: "test", defaults: {}, adapter: { adapterVersion: "test", dispatch: async (input: { signal?: AbortSignal }) => (async function* () {
      if (holdRequest) {
        requestEntered();
        if (!input.signal?.aborted) await new Promise<void>(resolve => input.signal?.addEventListener("abort", () => resolve(), { once: true }));
        yield { type: "aborted", reason: "host-stop", usage: EMPTY_LLM_USAGE }; return;
      }
      yield { type: "done", stopReason: "stop", usage: EMPTY_LLM_USAGE, content: [{ type: "text", text: "fixed loop result" }] }; })() } }] },
  };
  await root.mount("host", ctx => { for (const [name, value] of Object.entries(ports)) ctx.provide(name, value); }, { provides: Object.keys(ports) });
  const runtime = new AgentRuntimeService(root.context);
  const harnesses = runtime.harnesses;
  await root.mount("subagent-host", ctx => { ctx.provide("actspace.host.subagents", runtime.subagents); }, { provides: ["actspace.host.subagents"] });
  // Existing core checkpoint policy stays a Host durability service.
  root.context.on?.("session/checkpoint", async (payload: unknown) => { const value = payload as { sessionId: string; throughSeq: number }; await sessions.getOpen(value.sessionId)!.flush(value.throughSeq); });
  const failures: unknown[] = [];
  const app = new AgentService({ onFailure: (_id, error) => failures.push(error), openSession: id => sessions.resume(id), harnessId: () => "main", acquire: id => harnesses.acquire(id), readConfiguration: () => ({ mode: "chat", model: "test" }) });
  try {
    const request = await prepareDefaultHarnessArtifact({ artifactRoot: join(directory, "artifacts"), sourceRoot: fileURLToPath(new URL("../../dist/default-harness/", import.meta.url)), hostCapabilities: [], disabledEntries: ["browser-tools"] });
    harnesses.activate(await harnesses.prepare("main", 0, request));
    await sessions.create("conversation", undefined, "chat");
    expect(agentRegistry.list()).toHaveLength(0);
    await app.submit("conversation", "one", "Hello"); await app.waitForIdle("conversation");
    const state = await app.snapshot("conversation");
    expect(failures).toEqual([]);
    expect(state.runs).toHaveLength(1);
    expect(state.runs[0].state).toBe("completed");
    expect((await sessions.inspectEvents("conversation")).some(event => event.type === "assistant/message" && JSON.stringify(event.data).includes("fixed loop result"))).toBe(true);
    expect(agentRegistry.list()).toHaveLength(0);
    expect(harnesses.inspect()[0].users).toBe(0);
    // Keep a parent generation pinned while a child independently selects the latest.
    const parentLease = harnesses.acquire("main");
    const parentScope = parentLease.scope.child("parent-generation-one");
    // A second candidate must not duplicate the Host's history projection.
    harnesses.activate(await harnesses.prepare("main", 1, request));
    await app.submit("conversation", "two", "Again"); await app.waitForIdle("conversation");
    expect((await app.snapshot("conversation")).runs.map(run => run.harness.revision)).toEqual([1, 2]);
    expect(failures).toEqual([]);
    expect(agentRegistry.list()).toHaveLength(0);
    try {
      const parent = sessions.getOpen("conversation")!;
      const childResult = await runtime.subagents.invoke({ parentSession: parent, parentScope, parentCallId: "child-call", presetId: "actspace.explore", task: "Report a short result", parentVisibleToolIds: [], delegationDepth: 0 });
      expect(childResult).toMatchObject({ status: "completed", text: "fixed loop result" });
      const child = await sessions.resume(childResult.childSessionId);
      const childLedger = await TaskLedger.open(child);
      expect(childLedger.snapshot().runs).toEqual([expect.objectContaining({ state: "completed", harness: expect.objectContaining({ revision: 2 }), result: { status: "completed", text: "fixed loop result" } })]);
      expect(childLedger.snapshot().tasks).toEqual([expect.objectContaining({ state: "completed" })]);
      expect(parentLease.revision).toBe(1);
      expect(harnesses.inspect().find(item => item.generationId === parentLease.generationId)?.users).toBe(1);
      expect(harnesses.inspect().find(item => item.state === "current")?.users).toBe(0);
      expect(runtime.subagents.activeCount).toBe(0);
    } finally { await parentScope.dispose(); await parentLease.release(); }
    // Exercise the production adapter too: a normal stop must not reject its IPC-facing promise.
    const runs = new ManagedRuns(sessions, harnesses);
    try {
      await sessions.create("cancelled-conversation", undefined, "chat");
      holdRequest = true;
      const running = runs.run("cancelled-conversation", { agentRunId: "cancelled-run", content: "wait", model: "test" });
      await entered;
      await runs.service.stop("cancelled-conversation", "cancelled-run");
      expect(await running).toMatchObject({ reason: "aborted", agentRunId: "cancelled-run" });
      expect((await runs.service.snapshot("cancelled-conversation")).runs[0]).toMatchObject({ state: "cancelled", result: { reason: "aborted" } });
      expect(harnesses.inspect().every(item => item.users === 0)).toBe(true);
    } finally { await runs.dispose(); }
  } finally {
    await app.dispose(); await runtime.dispose(); await sessions.closeAll(); await root.dispose(); await rm(directory, { recursive: true, force: true });
  }
}, 20_000);
