import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it, vi } from "vitest";
vi.mock("./default-harness.js", async original => {
  const module = await original<typeof import("./default-harness.js")>();
  return { ...module, prepareDefaultHarnessArtifact: (options: Parameters<typeof module.prepareDefaultHarnessArtifact>[0]) => module.prepareDefaultHarnessArtifact({ ...options, sourceRoot: fileURLToPath(new URL("../../dist/default-harness", import.meta.url)) }) };
});
import { createCordisRoot } from "@actspace/cordis-adapter";
import { createCoreCodecRegistry } from "@actspace/session-journal";
import { taskCodecs } from "@actspace/agent-service";
import { codecs as contextCodecs } from "@actspace/context-engine/codec";
import { SessionStore } from "@actspace/session-persistence";
import { JsonlSessionStorage } from "@actspace/session-jsonl";
import { AgentRegistry } from "@actspace/core-agent";
import { EMPTY_LLM_USAGE, type LlmAdapterDispatchInput } from "@actspace/llm-service";
import { emptyRuntimePromptSource } from "@actspace/prompt";
import { AgentRuntimeService } from "./agent-runtime-plugin.js";
import { RuntimeSessionController } from "../session/session-controller.js";
import { createContextHost } from "./context-host.js";

it("runs the model/tool pipeline: explicit development, next-message activation, session isolation and restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "runtime-evolution-"));
  let root = await createCordisRoot();
  const registry = createCoreCodecRegistry(); [...taskCodecs, ...contextCodecs].forEach(c => registry.register(c));
  const sessions = new RuntimeSessionController({ dataRoot: directory, runtimeId: "evolution", registry, profileId: "test", manifestDigest: "test", plugins: [] }, new SessionStore({ registry }, new JsonlSessionStorage({ dataRoot: directory, runtimeId: "evolution", registry })));
  let runtime!: AgentRuntimeService;
  const approvals: string[] = [];
  const toolEnvironment = { workspaceRoot: directory, hostCapabilities: new Set(["process"]), capabilitySet: { ids: ["process"], has: (id: string) => id === "process", get: <T>() => ({}) as T }, createArtifact: async () => { throw new Error("unused"); }, approvalBroker: { requestApproval: async (request: any) => { approvals.push(request.toolName); return { requestId: request.requestId, kind: "once" as const, decidedAt: new Date().toISOString() }; } } };
  const host = { hostKind: "cli-run" as const, capabilityCeiling: ["process"], runtimeContract: "actspace.runtime.v2" as const, invocationId: "test" };
  let phase = "develop"; let step = 0; let workspaceId = "";
  const seen: Array<{ phase: string; tools: string[] }> = [];
  const ports = {
    "agent.registry": new AgentRegistry(),
    ...Object.fromEntries(["filesystem-read", "filesystem-search", "filesystem-write", "shell-tools", "web-tools", "image-generation", "image-inspection"].map(id => [`actspace.host.tools.${id}`, { createPorts: () => ({}) }])),
    "session.runtime": sessions, "session.journal": { registry }, "session.projection": {},
    "actspace.host.session": { dataRoot: directory, runtimeId: "evolution" },
    "actspace.host.agent": { disabledHarnessEntries: ["browser-tools"], evolution: { inspect: (context: any) => runtime.evolution.inspect(context), execute: (args: any, context: any) => runtime.evolution.execute(args, context) }, contextDisclosure: createContextHost(() => sessions, toolEnvironment), host, toolEnvironment, workspaceRoot: directory, compositionDigest: "test", hostCapabilityDigest: "test", plugins: [] },
    "actspace.host.prompt": { workspaceRoot: directory, resolveSource: async () => emptyRuntimePromptSource() },
    "actspace.host.llm": { credentials: { resolve: async () => ({}) }, routes: [{ routeId: "default", providerId: "test", modelPattern: "*", credentialRef: "test", defaults: {}, adapter: { adapterVersion: "test", dispatch: async (input: LlmAdapterDispatchInput) => (async function* () {
      seen.push({ phase, tools: input.request.tools.map(t => t.name) });
      let call: { name: string; args: unknown } | undefined;
      if (phase === "develop") {
        if (step === 0) call = { name: "plugin_manager", args: { action: "create", toolName: "custom_echo", purpose: "Create an echo tool at my request" } };
        else if (step === 1) {
          const events = await sessions.inspectEvents("local");
          const result = events.find(e => e.type === "tool/result" && JSON.stringify(e.data).includes('"workspaceId"')) as any;
          const serialized = JSON.stringify(result?.data);
          workspaceId = serialized?.match(/"workspaceId":"([a-f0-9-]+)"/)?.[1] ?? "";
          expect(workspaceId).not.toBe("");
          await writeFile(join(directory, ".actspace", "evolution", workspaceId, "implementation.ts"), 'export async function execute(args: Record<string, unknown>): Promise<unknown> { return { echoed: args.value }; }');
          call = { name: "plugin_manager", args: { action: "build", workspaceId } };
        } else if (step === 2) call = { name: "plugin_manager", args: { action: "prepare", workspaceId } };
        else if (step === 3) call = { name: "plugin_manager", args: { action: "apply", workspaceId } };
        else if (step === 4) expect(await runtime.runs.inspectCapability<import("@actspace/tools-runtime").ToolRuntime, boolean>("tools.runtime", tools => !!tools?.registry.listDefinitions().some(d => d.name === "custom_echo"), "local")).toBe(false);
      } else if (phase === "use" && step === 0) call = { name: "custom_echo", args: { value: "hello" } };
      step++;
      yield call ? { type: "done" as const, stopReason: "tool-use", usage: EMPTY_LLM_USAGE, content: [{ type: "tool-call" as const, callId: `${phase}-${step}`, name: call.name, arguments: JSON.stringify(call.args) }] } : { type: "done" as const, stopReason: "stop", usage: EMPTY_LLM_USAGE, content: [{ type: "text" as const, text: "done" }] };
    })() } }] },
  };
  await root.mount("host", ctx => { for (const [name, value] of Object.entries(ports)) ctx.provide(name, value); }, { provides: Object.keys(ports) });
  root.context.provide?.("session.checkpoint", { flush: async (value: { sessionId: string; throughSeq: number }) => sessions.getOpen(value.sessionId)!.flush(value.throughSeq) });
  runtime = new AgentRuntimeService(root.context);
  await root.mount("subagent-host", ctx => { ctx.provide("actspace.host.subagents", runtime.subagents); ctx.provide("actspace.host.background-tasks", runtime.backgroundTasks); }, { provides: ["actspace.host.subagents", "actspace.host.background-tasks"] });
  await runtime.initialize(root.context);
  try {
    await sessions.create("local", undefined, "agent");
    await sessions.create("other", undefined, "agent");
    expect(await runtime.runs.run("local", { agentRunId: "develop-run", content: "Create a custom echo tool", model: "test" })).toMatchObject({ outcome: "completed" });
    const results = (await sessions.inspectEvents("local")).filter(e => e.type === "tool/result");
    expect(results).toHaveLength(4);
    expect(JSON.stringify(results.at(-1))).toContain('"bound"');
    expect(seen.filter(s => s.phase === "develop").every(s => !s.tools.includes("custom_echo"))).toBe(true);
    expect((await runtime.runs.service.snapshot("local")).runs).toHaveLength(1);
    expect(await runtime.runs.inspectCapability<import("@actspace/tools-runtime").ToolRuntime, boolean>("tools.runtime", tools => !!tools?.registry.listDefinitions().some(d => d.name === "custom_echo"), "local")).toBe(true);
    phase = "use"; step = 0;
    expect(await runtime.runs.run("local", { agentRunId: "use-run", content: "Use it", model: "test" })).toMatchObject({ outcome: "completed" });
    expect(seen.filter(s => s.phase === "use").every(s => s.tools.includes("custom_echo"))).toBe(true);
    expect(JSON.stringify((await sessions.inspectEvents("local")).filter(e => e.type === "tool/result"))).toContain('"echoed":"hello"');
    expect(approvals).toEqual(["plugin_manager", "plugin_manager", "custom_echo"]);
    phase = "other"; step = 0;
    await runtime.runs.run("other", { content: "Hello", model: "test" });
    expect(seen.at(-1)?.tools).not.toContain("custom_echo");
    const binding = await runtime.hmr.inspect("local");
    expect(binding.harnessId).not.toBe("main");
    await runtime.dispose();
    await root.dispose();
    root = await createCordisRoot();
    await root.mount("host", ctx => { for (const [name, value] of Object.entries(ports)) ctx.provide(name, value); }, { provides: Object.keys(ports) });
    root.context.provide?.("session.checkpoint", { flush: async (value: { sessionId: string; throughSeq: number }) => sessions.getOpen(value.sessionId)!.flush(value.throughSeq) });
    runtime = new AgentRuntimeService(root.context);
    await root.mount("subagent-host", ctx => { ctx.provide("actspace.host.subagents", runtime.subagents); ctx.provide("actspace.host.background-tasks", runtime.backgroundTasks); }, { provides: ["actspace.host.subagents", "actspace.host.background-tasks"] });
    await runtime.initialize(root.context);
    expect(await runtime.hmr.inspect("local")).toEqual(binding);
    phase = "recovered"; step = 0;
    await runtime.runs.run("local", { content: "After restart", model: "test" });
    expect(seen.at(-1)?.tools).toContain("custom_echo");
  } finally { await runtime.dispose(); await sessions.closeAll(); await root.dispose(); await rm(directory, { recursive: true, force: true }); }
}, 30000);
