import { createContextHost } from "./context-host.js";
import { codecs as contextCodecs } from "@actspace/context-engine/codec";
import { SessionStore } from "@actspace/session-persistence";
import { JsonlSessionStorage } from "@actspace/session-jsonl";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it, vi } from "vitest";
import { fileURLToPath } from "node:url";
vi.mock("./default-harness.js", async importOriginal => {
  const original = await importOriginal<typeof import("./default-harness.js")>();
  return { ...original, prepareDefaultHarnessArtifact: (options: Parameters<typeof original.prepareDefaultHarnessArtifact>[0]) => original.prepareDefaultHarnessArtifact({ ...options, sourceRoot: fileURLToPath(new URL("../../dist/default-harness", import.meta.url)) }) };
});
import { defaultHarnessSharedModules } from "./default-harness.js";
import { createCordisRoot, publishPluginArtifact, pluginId } from "@actspace/cordis-adapter";
import { AgentRuntimeService } from "./agent-runtime-plugin.js";
import { AgentRegistry } from "@actspace/core-agent";
import { AgentService, TaskLedger, taskCodecs } from "@actspace/agent-service";
import { createCoreCodecRegistry } from "@actspace/session-journal";
import { EMPTY_LLM_USAGE } from "@actspace/llm-service";
import { emptyRuntimePromptSource } from "@actspace/prompt";
import { ManagedRuns } from "./managed-runs.js";
import { RuntimeSessionController } from "../session/session-controller.js";
import { createAuxiliaryRequestRecorder } from "../session/auxiliary-request-recorder.js";

it("executes the default Loop from its fixed closure with Harness-owned policies", async () => {
  const directory = await mkdtemp(join(tmpdir(), "actspace-default-harness-"));
  const root = await createCordisRoot();
  const registry = createCoreCodecRegistry(); taskCodecs.forEach(codec => registry.register(codec)); contextCodecs.forEach(codec => registry.register(codec));
  const sessions = new RuntimeSessionController({ dataRoot: directory, runtimeId: "fixed-default", registry, profileId: "test", manifestDigest: "test", plugins: [] }, new SessionStore({ registry }, new JsonlSessionStorage({ dataRoot: directory, runtimeId: "fixed-default", registry })));
  const host = { hostKind: "cli-run" as const, capabilityCeiling: [], runtimeContract: "actspace.runtime.v2" as const, invocationId: "fixed-default" };
  const toolEnvironment = { workspaceRoot: directory, hostCapabilities: new Set<string>(), capabilitySet: { ids: [], has: () => false, get: <T>() => ({}) as T }, createArtifact: async () => { throw new Error("unused"); } };
  const agentRegistry = new AgentRegistry();
  let observeChild: (() => Promise<void>) | undefined;
  let holdRequest = false;
  let requestEntered!: () => void;
  const entered = new Promise<void>(resolve => { requestEntered = resolve; });
  const ports = {
    "agent.registry": agentRegistry,
    ...Object.fromEntries(["filesystem-read", "filesystem-search", "filesystem-write", "shell-tools", "web-tools", "image-generation", "image-inspection"].map(id => [`actspace.host.tools.${id}`, { createPorts: () => ({}) }])),
    "session.runtime": sessions,
    "llm.auxiliary-requests": createAuxiliaryRequestRecorder(sessions),
    "session.journal": { registry },
    "session.projection": {},
    "actspace.host.session": { dataRoot: directory, runtimeId: "test" },
    "actspace.host.agent": { authorizeHarness: async (r: import("@actspace/harness-control").AuthorizationRequest) => ({ ...r, actor: "test-host", decisionId: "approved", expiresAt: Date.now() + 10000 }), disabledHarnessEntries: ["browser-tools"], contextDisclosure: createContextHost(() => sessions, toolEnvironment), host, toolEnvironment, workspaceRoot: directory, compositionDigest: "test", hostCapabilityDigest: "test", plugins: [] },
    "actspace.host.prompt": { workspaceRoot: directory, resolveSource: async () => emptyRuntimePromptSource() },
    "actspace.host.llm": { credentials: { resolve: async () => ({}) }, routes: [{ routeId: "default", providerId: "test", modelPattern: "*", credentialRef: "test", defaults: {}, adapter: { adapterVersion: "test", dispatch: async (input: { signal?: AbortSignal }) => (async function* () {
      if (holdRequest) {
        requestEntered();
        if (!input.signal?.aborted) await new Promise<void>(resolve => input.signal?.addEventListener("abort", () => resolve(), { once: true }));
        yield { type: "aborted", reason: "host-stop", usage: EMPTY_LLM_USAGE }; return;
      }
      await observeChild?.();
      yield { type: "done", stopReason: "stop", usage: EMPTY_LLM_USAGE, content: [{ type: "text", text: "fixed loop result" }] }; })() } }] },
  };
  await root.mount("host", ctx => { for (const [name, value] of Object.entries(ports)) ctx.provide(name, value); }, { provides: Object.keys(ports) });
  root.context.provide?.("session.checkpoint", { flush: async (value: { sessionId: string; throughSeq: number }) => { await sessions.getOpen(value.sessionId)!.flush(value.throughSeq); } });
  const runtime = new AgentRuntimeService(root.context);
  await root.mount("subagent-host", ctx => { ctx.provide("actspace.host.subagents", runtime.subagents); ctx.provide("actspace.host.background-tasks", runtime.backgroundTasks); }, { provides: ["actspace.host.subagents", "actspace.host.background-tasks"] });
  await runtime.initialize(root.context);
  const harnesses = runtime.harnesses;
  // Existing core checkpoint policy stays a Host durability service.
  const failures: unknown[] = [];
  const app = new AgentService({ onFailure: (_id, error) => failures.push(error), openSession: id => sessions.resume(id), harnessId: () => "main", acquire: id => harnesses.acquire(id), readConfiguration: () => ({ mode: "chat", model: "test" }) });
  try {
    await sessions.create("conversation", undefined, "chat");
    expect(agentRegistry.list()).toHaveLength(0);
    await app.submit("conversation", "one", "Hello"); await app.waitForIdle("conversation");
    const state = await app.snapshot("conversation");
    expect(failures).toEqual([]);
    expect((await sessions.inspectEvents("conversation")).some(event => event.type === "plugin/actspace.context/state")).toBe(true);
    expect(state.runs).toHaveLength(1);
    expect(state.runs[0].state).toBe("completed");
    expect((await sessions.inspectEvents("conversation")).some(event => event.type === "assistant/message" && JSON.stringify(event.data).includes("fixed loop result"))).toBe(true);
    expect(agentRegistry.list()).toHaveLength(0);
    expect(harnesses.inspect().instances[0].users).toBe(0);
    // Keep a parent generation pinned while its child inherits the same generation.
    const parentLease = await harnesses.acquire("main");
    const reviewer = parentLease.getService<import("@actspace/auto-review").AutoReviewer>("approval.auto-review");
    expect(reviewer).toBeDefined();
    const reviewRoute = parentLease.getService<import("@actspace/llm-service").LlmService>("llm.service")!.routes.register({ routeId: "auto-review", providerId: "test", modelPattern: "*", credentialRef: "test", defaults: {}, adapter: { adapterVersion: "test", dispatch: async input => {
      expect(input.request.tools).toEqual([]);
      expect(input.request.model).toBe("test");
      return (async function* () { yield { type: "done" as const, stopReason: "stop", usage: EMPTY_LLM_USAGE, content: [{ type: "text" as const, text: '{"approved":true,"reason":"User requested inspection"}' }] }; })();
    } } });
    try {
      const session = sessions.getOpen("conversation")!;
      const priorTurn = (await sessions.inspectEvents("conversation")).find(event => event.type === "turn/start")!;
      const reviewOwner = { agentRunId: (priorTurn.data as Record<string, unknown>).agentRunId as string, turnId: "review-turn", stepId: "review-step", callId: "review-fixture" };
      expect(reviewOwner.agentRunId).toBeTruthy();
      const appendReview = (type: string, data: import("@actspace/session-journal").SessionEventCandidateV1["data"]) => session.append({ type, eventVersion: 1, source: { ownerPluginId: "@actspace/core" }, data, surface: null });
      await appendReview("turn/start", reviewOwner);
      await appendReview("step/start", reviewOwner);
      await appendReview("tool/call", { ...reviewOwner, name: "shell" });
      expect(await reviewer!.review({ ...reviewOwner, sessionId: "conversation", logicalRequestId: "review-logical", model: "test", snapshot: { user: "inspect", action: "ls" }, signal: new AbortController().signal })).toMatchObject({ approved: true });
      expect(session.journal.events.filter(event => event.type === "llm/auxiliary-end").map(event => event.data)).toContainEqual(expect.objectContaining({ ...reviewOwner, purpose: "auto-review", status: "completed" }));
      await appendReview("tool/result", { ...reviewOwner, name: "shell", status: "completed" });
      await appendReview("step/end", reviewOwner);
      await appendReview("turn/end", reviewOwner);
      await sessions.create("route-regression", undefined, "chat");
      await app.submit("route-regression", "chat-route", "Use the main model, not the reviewer");
      await app.waitForIdle("route-regression");
      expect(failures).toEqual([]);
      expect((await sessions.inspectEvents("route-regression")).find(event => event.type === "request/header")?.data).toMatchObject({ routeId: "default" });
    } finally { await reviewRoute.dispose(); }
    const parentScope = parentLease.scope.child("parent-generation-one");
    // A second candidate must not duplicate the Host's history projection.
    const candidate = await harnesses.prepareRollback("main", 1, harnesses.inspect().current!.executionDigest);
    await harnesses.activate("second-selection", candidate.candidateId);
    await app.submit("conversation", "two", "Again"); await app.waitForIdle("conversation");
    expect((await app.snapshot("conversation")).runs.map(run => run.harness.revision)).toEqual([1, 2]);
    expect(failures).toEqual([]);
    expect(agentRegistry.list()).toHaveLength(0);
    try {
      const parent = sessions.getOpen("conversation")!;
      observeChild = async () => {
        const childId = (await sessions.store.listSessionIds()).find(id => id !== "conversation")!;
        const before = (await sessions.inspectEvents(childId)).length;
        expect((await runtime.runs.service.snapshot(childId)).runs[0]?.state).toBe("running");
        expect((await sessions.inspectEvents(childId)).length).toBe(before);
      };
      const childResult = await runtime.subagents.invoke({ parentSession: parent, parentScope, parentCallId: "child-call", presetId: "actspace.explore", task: "Report a short result", parentVisibleToolIds: [], delegationDepth: 0 });
      observeChild = undefined;
      expect(childResult).toMatchObject({ status: "completed", text: "fixed loop result" });
      const child = await sessions.resume(childResult.childSessionId);
      const childLedger = await TaskLedger.open(child);
      expect(childLedger.snapshot().runs).toEqual([expect.objectContaining({ state: "completed", harness: expect.objectContaining({ revision: 1 }), result: { status: "completed", text: "fixed loop result" } })]);
      expect(childLedger.snapshot().tasks).toEqual([expect.objectContaining({ state: "completed" })]);
      expect(parentLease.revision).toBe(1);
      expect(harnesses.inspect().instances.find(item => item.generationId === parentLease.generationId)?.users).toBe(1);
      expect(harnesses.inspect().instances.find(item => item.state === "current")?.users).toBe(0);
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
      expect(await running).toMatchObject({ outcome: "cancelled", agentRunId: "cancelled-run" });
      expect((await runs.service.snapshot("cancelled-conversation")).runs[0]).toMatchObject({ state: "cancelled", result: { reason: "aborted" } });
      expect(harnesses.inspect().instances.every(item => item.users === 0)).toBe(true);
    } finally { await runs.dispose(); }
    holdRequest = false;
    // Replace the actual execution factory with an independently published Loop implementation.
    const current = harnesses.inspect().current!;
    const manifest = current.description.composition.manifests.find(m => m.behaviors.some(b => b.entryId === "agent-factory"))!;
    const behavior = manifest.behaviors.find(b => b.entryId === "agent-factory")!;
    const sourceRoot = join(directory, "alternative-loop"); await mkdir(sourceRoot);
    await writeFile(join(sourceRoot, "loop.js"), `export function apply(ctx) {
      ctx.provide('agent.run-factory', { create: async input => ({
        execute: async () => ({ outcome: 'completed', value: { implementation: 'alternative', priorEvents: input.session.journal.events.length } }), dispose: async () => {}
      }) });
      ctx.provide('actspace.agent.factory', { createSubagentLoop: async () => ({
        runTurn: async () => ({ reason: 'completed', finalText: 'alternative child' }), abort() {}, quiesce() {}, waitForIdle: async () => {}
      }) });
    }`);
    const alternative = await publishPluginArtifact({ sourceRoot, artifactRoot: join(directory, "harness-artifacts"), files: ["loop.js"], plugin: { ...manifest, pluginId: pluginId("alternative-loop"), behaviors: [{ ...behavior, module: "./loop.js" }], contributions: { services: [...behavior.provides ?? []], events: [], contributions: [] }, codecs: [] } });
    const oldParent = await harnesses.acquire("main");
    try {
      const candidate = await harnesses.prepare({ harnessId: "main", expectedRevision: current.revision, baseExecutionDigest: current.executionDigest, artifactIds: [alternative.artifactId], patch: { id: "alternative", provenance: "test", operations: [{ id: "replace-loop", kind: "replace", target: "agent-factory", artifactId: alternative.artifactId, manifestEntryId: "agent-factory" }] } });
      await harnesses.activate("alternative-loop", candidate.candidateId);
      await app.submit("conversation", "alternative", "Continue existing history"); await app.waitForIdle("conversation");
      expect(failures).toEqual([]);
      expect((await app.snapshot("conversation")).runs.at(-1)).toMatchObject({ harness: { revision: 3 }, result: { implementation: "alternative", priorEvents: expect.any(Number) } });
      const child = await runtime.subagents.invoke({ parentSession: sessions.getOpen("conversation")!, parentScope: oldParent.scope, parentCallId: "alternative-child", presetId: "actspace.explore", task: "Run parent Loop", parentVisibleToolIds: [], delegationDepth: 0 });
      expect(child).toMatchObject({ status: "completed", text: "fixed loop result" });
      expect(oldParent.revision).toBe(2);
    } finally { await oldParent.release(); }

  } finally {
    await app.dispose(); await runtime.dispose(); await sessions.closeAll(); await root.dispose(); await rm(directory, { recursive: true, force: true });
  }
}, 20_000);

it("keeps Host compatibility modules in the persisted artifact canonical order", async () => {
  const modules = await defaultHarnessSharedModules();
  expect(modules.map(module => module.specifier)).toEqual(modules.map(module => module.specifier).sort((a, b) => a.localeCompare(b)));
});
