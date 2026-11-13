import { createContextHost } from "./context-host.js";
import { codecs as contextCodecs } from "@actspace/context-engine/codec";
import { SessionStore } from "@actspace/session-persistence";
import { JsonlSessionStorage } from "@actspace/session-persistence-jsonl";
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
import { AgentRegistry, allowedAgentModeTools } from "@actspace/agent";
import { AgentService, TaskLedger, taskCodecs } from "@actspace/agent-service";
import { createCoreCodecRegistry } from "@actspace/session-journal";
import { EMPTY_LLM_USAGE } from "@actspace/llm-service";
import { emptyRuntimePromptSource } from "@actspace/prompt";
import { ManagedRuns } from "./managed-runs.js";
import { RuntimeSessionController } from "../session/session-controller.js";
import { createAuxiliaryRequestRecorder } from "../session/auxiliary-request-recorder.js";
import { createNodeSandboxHostPort, type SandboxStatus } from "@actspace/sandbox";
import { DEFAULT_HARNESS_ENTRIES, DEFAULT_HARNESS_KERNEL_ID } from "./default-harness-definition.js";
import { MAIN_AGENT_FORM } from "../main-agent-form.js";
import { harnessToolPluginEntries } from "../plugin-catalog.js";
import { ACTSPACE_SERVICE_DEFINITIONS, ACTSPACE_SERVICE_ROLE_METADATA } from "@actspace/cordis-adapter";
import { checkHarnessCompatibility, resolveHarnessPatch } from "@actspace/composition";

it("executes the default Loop from its fixed closure with Harness-owned policies", async () => {
  const directory = await mkdtemp(join(tmpdir(), "actspace-default-harness-"));
  const root = await createCordisRoot();
  const registry = createCoreCodecRegistry(); taskCodecs.forEach(codec => { registry.register(codec); }); contextCodecs.forEach(codec => { registry.register(codec); });
  const sessions = new RuntimeSessionController({ dataRoot: directory, runtimeId: "fixed-default", registry, profileId: "test", manifestDigest: "test", plugins: [] }, new SessionStore({ registry }, new JsonlSessionStorage({ dataRoot: directory, runtimeId: "fixed-default", registry })));
  const host = { hostKind: "cli-run" as const, capabilityCeiling: [], runtimeContract: "actspace.runtime.v2" as const, invocationId: "fixed-default" };
  const toolEnvironment = { workspaceRoot: directory, hostCapabilities: new Set<string>(), capabilitySet: { ids: [], has: () => false, get: <T>() => ({}) as T }, createArtifact: async () => { throw new Error("unused"); } };
  const agentRegistry = new AgentRegistry();
  let observeChild: (() => Promise<void>) | undefined;
  let holdRequest = false;
  let requestEntered!: () => void;
  const entered = new Promise<void>(resolve => { requestEntered = resolve; });
  let reportSandbox!: (status: SandboxStatus | undefined) => void;
  const sandboxStatus = new Promise<SandboxStatus | undefined>(resolve => { reportSandbox = resolve; });
  const ports = {
    "actspace.host.sandbox": createNodeSandboxHostPort(),
    "agent.registry": agentRegistry,
    ...Object.fromEntries(["web-tools", "image-generation", "image-inspection"].map(id => [`actspace.host.tools.${id}`, { createPorts: () => ({}) }])),
    "session.runtime": sessions,
    "llm.auxiliary-requests": createAuxiliaryRequestRecorder(sessions),
    "session.journal": { registry },
    "session.projection": {},
    "actspace.host.session": { dataRoot: directory, runtimeId: "test" },
    "actspace.host.agent": { authorizeHarness: async (r: import("@actspace/harness-control").AuthorizationRequest) => ({ ...r, actor: "test-host", decisionId: "approved", expiresAt: Date.now() + 10000 }), disabledHarnessEntries: ["browser-tools"], onSandboxStatus: reportSandbox, contextDisclosure: createContextHost(() => sessions, toolEnvironment), host, agentForm: MAIN_AGENT_FORM, toolEnvironment, workspaceRoot: directory, compositionDigest: "test", hostCapabilityDigest: "test", plugins: [] },
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
    // Without a bundled nono only Seatbelt can serve, so the status is platform-dependent but always reported.
    expect(await sandboxStatus).toMatchObject(process.platform === "darwin" ? { available: true, isolation: "sandboxed", backend: { id: "seatbelt" } } : { available: false, isolation: "sandboxed" });
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
    // Mode policy is assembled from the tool definitions the Harness registered (agent-forms-and-modes.md §5).
    const definitions = parentLease.getService<import("@actspace/tool-runtime").ToolRuntime>("tools.runtime")!.registry.listDefinitions();
    const visible = (mode: import("@actspace/shared/runtime-v2").RuntimeV2AgentMode) => [...allowedAgentModeTools(mode, definitions)].sort();
    expect(visible("chat")).toEqual(["generate_image", "web"]);
    expect(visible("plan")).toEqual(["agent", "agent_fork", "glob", "grep", "inspect_image", "list_directory", "list_subagent_models", "read_file", "send_message", "task_list", "task_output", "task_stop", "todo_read", "todo_write", "web_fetch", "web_search"]);
    expect(visible("agent")).toEqual(expect.arrayContaining(["bash", "edit_file", "present", "generate_image", "plugin_manager", "harness_inspect"]));
    expect(visible("agent")).not.toContain("web");
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
      expect(parent.header.sessionId).toBe("conversation");
      const childResult = await runtime.subagents.spawn({ sessionId: "conversation", callId: "child-call", scope: parentScope, description: "short result", prompt: "Report a short result", preset: "explore", background: false, parentToolNames: [], registeredToolNames: [], signal: new AbortController().signal });
      observeChild = undefined;
      expect(childResult).toMatchObject({ ok: true, text: expect.stringContaining("fixed loop result") });
      const childSessionId = /Subagent (\S+) \(short result\) finished\./.exec(childResult.text)![1];
      // A client reading the finished child's task queue gets it without taking the child over (acceptance BUG-02).
      expect((await runtime.runs.service.snapshot(childSessionId)).runs).toEqual([expect.objectContaining({ state: "completed" })]);
      expect(sessions.getOpen(childSessionId)).toBeUndefined();
      // A finished subagent is closed: a message is refused and starts nothing.
      expect(await runtime.subagents.sendMessage({ sessionId: "conversation", callId: "follow-up", scope: parentScope, agentId: childSessionId, message: "One more" })).toMatchObject({ ok: false, code: "SUBAGENT_CLOSED" });
      expect(runtime.subagents.activeCount).toBe(0);
      const child = await sessions.resume(childSessionId);
      const childLedger = await TaskLedger.open(child);
      expect(childLedger.snapshot().runs).toEqual([
        expect.objectContaining({ state: "completed", harness: expect.objectContaining({ revision: 1 }), result: { status: "completed", text: "fixed loop result" } }),
      ]);
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
      ctx.provide('actspace.host-readable-files', { add() {}, has: () => false, remove() {} });
    }`);
    const alternative = await publishPluginArtifact({ sourceRoot, artifactRoot: join(directory, "harness-artifacts"), files: ["loop.js"], plugin: { ...manifest, pluginId: pluginId("alternative-loop"), behaviors: [{ ...behavior, module: "./loop.js" }], contributions: { services: [...behavior.provides ?? []], events: [], contributions: [] }, codecs: [] } });
    const oldParent = await harnesses.acquire("main");
    try {
      const candidate = await harnesses.prepare({ harnessId: "main", expectedRevision: current.revision, baseExecutionDigest: current.executionDigest, artifactIds: [alternative.artifactId], patch: { id: "alternative", provenance: "test", operations: [{ id: "replace-loop", kind: "replace", target: "agent-factory", artifactId: alternative.artifactId, manifestEntryId: "agent-factory" }] } });
      await harnesses.activate("alternative-loop", candidate.candidateId);
      await app.submit("conversation", "alternative", "Continue existing history"); await app.waitForIdle("conversation");
      expect(failures).toEqual([]);
      expect((await app.snapshot("conversation")).runs.at(-1)).toMatchObject({ harness: { revision: 3 }, result: { implementation: "alternative", priorEvents: expect.any(Number) } });
      const child = await runtime.subagents.spawn({ sessionId: "conversation", callId: "alternative-child", scope: oldParent.scope, description: "parent loop", prompt: "Run parent Loop", preset: "explore", background: false, parentToolNames: [], registeredToolNames: [], signal: new AbortController().signal });
      expect(child).toMatchObject({ ok: true, text: expect.stringContaining("fixed loop result") });
      expect(oldParent.revision).toBe(2);
    } finally { await oldParent.release(); }

  } finally {
    await app.dispose(); await runtime.dispose(); await sessions.closeAll(); await root.dispose(); await rm(directory, { recursive: true, force: true });
  }
}, 20_000);

it("derives the main Agent form from the catalog entries that declare tools", () => {
  const members = new Map(MAIN_AGENT_FORM.members.map(member => [member.id, member]));
  expect([...members.keys()]).toEqual([
    "actspace.filesystem-read", "actspace.filesystem-search", "actspace.filesystem-write", "actspace.web-tools", "actspace.image-generation",
    "actspace.shell-tools", "actspace.image-inspection", "actspace.todo", "actspace.browser-tools", "actspace.background-tasks",
    "actspace.subagent-tools", "actspace.subagent-codex", "actspace.subagent-claude-code", "actspace.plugin-manager",
  ]);
  expect(members.get("actspace.filesystem-read")).toMatchObject({ version: 2, required: true, toolNames: ["read_file", "list_directory", "present"] });
  expect(members.get("actspace.browser-tools")?.required).toBe(false);
  expect(members.get("actspace.subagent-codex")).toMatchObject({ version: 1, required: false, toolNames: ["agent_codex"] });
  expect(members.get("actspace.plugin-manager")).toMatchObject({ required: true, toolNames: ["plugin_manager", "harness_inspect"] });
  expect(MAIN_AGENT_FORM.members.every(member => !member.id.startsWith("actspace.context"))).toBe(true);
});

it("keeps Host compatibility modules in the persisted artifact canonical order", async () => {
  const modules = await defaultHarnessSharedModules();
  expect(modules.map(module => module.specifier)).toEqual(modules.map(module => module.specifier).sort((a, b) => a.localeCompare(b)));
});

it("registers the sandbox manager and both backends as replaceable Harness entries", () => {
  const rows = new Map(DEFAULT_HARNESS_ENTRIES.map(row => [row[0], row]));
  expect(rows.get("sandbox")).toEqual(["sandbox", ["sandbox"], ["actspace.host.sandbox"]]);
  expect(rows.get("sandbox-nono")).toEqual(["sandbox-nono", [], ["sandbox", "actspace.host.sandbox"]]);
  expect(rows.get("sandbox-seatbelt")).toEqual(["sandbox-seatbelt", [], ["sandbox", "actspace.host.sandbox"]]);
});

it("publishes every tool plugin as its own artifact so a patch replaces one plugin without touching the kernel", async () => {
  const { prepareDefaultHarnessArtifact, DEFAULT_HARNESS_SHARED_SERVICES } = await import("./default-harness.js");
  const artifactRoot = await mkdtemp(join(tmpdir(), "actspace-tool-artifacts-"));
  try {
    const request = await prepareDefaultHarnessArtifact({ artifactRoot, hostCapabilities: ["process"] });
    const toolPlugins = harnessToolPluginEntries();
    expect(toolPlugins.map(entry => entry.id)).toEqual(["filesystem-read", "filesystem-search", "filesystem-write", "web-tools", "image-generation", "shell-tools", "image-inspection", "todo-tools", "browser-tools", "background-tasks", "subagent-tools", "subagent-codex", "subagent-claude-code", "plugin-manager"]);
    expect(request.artifacts.size).toBe(toolPlugins.length + 1);
    expect(request.composition.manifests.map(manifest => manifest.pluginId)).toEqual([DEFAULT_HARNESS_KERNEL_ID, ...toolPlugins.map(entry => entry.manifest.pluginId)]);
    // The kernel keeps the loop, context and tools runtime; it no longer carries any tool plugin.
    const kernel = request.composition.manifests.find(manifest => manifest.pluginId === DEFAULT_HARNESS_KERNEL_ID)!;
    expect(kernel.behaviors.map(behavior => behavior.entryId)).toEqual(expect.arrayContaining(["agent-factory", "tools-runtime", "context-engine", "llm-service"]));
    expect(kernel.behaviors.some(behavior => toolPlugins.some(entry => entry.id === behavior.entryId))).toBe(false);
    // A tool plugin keeps its catalog identity and its single behavior points at the bundled `plugin.js`.
    const fsRead = request.composition.manifests.find(manifest => manifest.pluginId === "actspace.filesystem-read")!;
    expect(fsRead).toMatchObject({ version: "2.0.0", source: { kind: "builtin", reference: "builtin:actspace.filesystem-read" }, contributions: { tools: ["read_file", "list_directory", "present"] } });
    expect(fsRead.behaviors).toHaveLength(1);
    expect(fsRead.behaviors[0]).toMatchObject({ entryId: "filesystem-read", module: "./plugin.js", provides: ["tools.filesystem-read"] });
    // Entries keep the catalog order and each one names the artifact it loads from.
    expect(request.composition.entries.map(entry => entry.entryId)).toEqual(DEFAULT_HARNESS_ENTRIES.map(([id]) => id));
    expect(request.composition.entries.every(entry => typeof entry.artifactId === "string" && entry.provenance.startsWith("builtin:"))).toBe(true);
    const entry = (id: string) => request.composition.entries.find(row => row.entryId === id)!;
    expect(entry("agent-factory")).toMatchObject({ pluginId: DEFAULT_HARNESS_KERNEL_ID, artifactId: request.artifacts.get(pluginId(DEFAULT_HARNESS_KERNEL_ID))!.artifactId });
    expect(entry("filesystem-read")).toMatchObject({ pluginId: "actspace.filesystem-read", pluginVersion: "2.0.0", artifactId: request.artifacts.get(pluginId("actspace.filesystem-read"))!.artifactId });

    // Replace the file-reading plugin with an independently published build of the same plugin id.
    const sourceRoot = join(artifactRoot, "alternative-fs-read"); await mkdir(sourceRoot);
    await writeFile(join(sourceRoot, "plugin.js"), "export function apply(ctx) { ctx.provide('tools.filesystem-read', Object.freeze({ definitions: [], registrations: [] })); }\n");
    const alternative = await publishPluginArtifact({ sourceRoot, artifactRoot, files: ["plugin.js"], plugin: { ...fsRead, version: "2.0.1", source: { kind: "builtin", reference: "builtin:actspace.filesystem-read" } } });
    const patch = { id: "alternative-fs-read", provenance: "test", operations: [{ id: "replace", kind: "replace" as const, target: "filesystem-read", artifactId: alternative.artifactId, manifestEntryId: "filesystem-read" }] };
    const patched = resolveHarnessPatch(request.composition, patch, [...request.artifacts.values(), alternative]);
    const replaced = patched.entries.find(row => row.entryId === "filesystem-read")!;
    expect(replaced).toMatchObject({ pluginId: "actspace.filesystem-read", pluginVersion: "2.0.1", artifactId: alternative.artifactId, module: "./plugin.js" });
    expect(patched.entries.filter(row => row.entryId !== "filesystem-read").map(row => row.artifactId)).toEqual(request.composition.entries.filter(row => row.entryId !== "filesystem-read").map(row => row.artifactId));
    expect(patched.entries.some(row => row.artifactId === request.artifacts.get(pluginId("actspace.filesystem-read"))!.artifactId)).toBe(false);
    const host = { capabilities: ["process"], services: DEFAULT_HARNESS_SHARED_SERVICES.map(id => ({ id, version: 1 })), events: [], sharedModules: await defaultHarnessSharedModules(), codecArtifacts: [] };
    expect(checkHarnessCompatibility(patched, [...request.artifacts.values(), alternative], host)).toEqual([]);
    expect(patched.digest).not.toBe(request.composition.digest);
  } finally { await rm(artifactRoot, { recursive: true, force: true }); }
});

it("keeps the service contract's owner table in step with the tool plugin manifests", () => {
  // `service-contract.ts` is audit metadata for the contract matrix; the catalog is the source of truth.
  const definitions = Object.values(ACTSPACE_SERVICE_DEFINITIONS);
  const roles = Object.values(ACTSPACE_SERVICE_ROLE_METADATA);
  for (const entry of harnessToolPluginEntries()) {
    const packageName = entry.module.split("/").slice(0, 2).join("/");
    for (const serviceId of entry.manifest.behaviors[0]!.provides ?? []) {
      const definition = definitions.find(item => item.id === serviceId);
      if (!definition) continue;
      expect(definition.owner, `${serviceId} owner`).toBe(packageName);
      expect(roles.find(role => role.definitionId === serviceId), `${serviceId} role`).toMatchObject({ providerOwner: packageName, providerId: `${entry.manifest.behaviors[0]!.entryId}:default` });
    }
  }
});

it("puts the Host's plugin settings over each manifest's config defaults", async () => {
  const { prepareDefaultHarnessArtifact } = await import("./default-harness.js");
  const artifactRoot = await mkdtemp(join(tmpdir(), "actspace-entry-config-"));
  try {
    const request = await prepareDefaultHarnessArtifact({ artifactRoot, hostCapabilities: ["process"], entryConfig: { "subagent-codex": { sandbox: "read-only" } } });
    const config = (id: string) => request.composition.entries.find(entry => entry.entryId === id)?.config;
    expect(config("subagent-codex")).toEqual({ approvalPolicy: "never", sandbox: "read-only" });
    expect(config("subagent-claude-code")).toEqual({ permissionMode: "dontAsk" });
    expect(config("shell-tools")).toEqual({});
  } finally { await rm(artifactRoot, { recursive: true, force: true }); }
});
