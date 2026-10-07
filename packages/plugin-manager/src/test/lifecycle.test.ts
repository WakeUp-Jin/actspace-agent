import { afterEach, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { createCordisRoot, publishPluginArtifact, pluginId, entryId, serviceId, artifactHash } from "@actspace/cordis-adapter";
import { HarnessControl, type SelectionRecord } from "@actspace/harness-control";
import { HarnessHmr } from "@actspace/harness-hmr";
import type { ToolRuntime, ToolExecutionContext } from "@actspace/tools-runtime";
import { PluginManager } from "../service.js";
import { apply } from "../plugin.js";
import { buildTool } from "../build.js";
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn(); });
async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "evolution-test-")); cleanup.push(() => rm(dir, { recursive: true, force: true }));
  const root = await createCordisRoot(); cleanup.push(() => root.dispose());
  const sourceRoot = join(dir, "base"); const artifactRoot = join(dir, "artifacts"); await mkdir(sourceRoot);
  const specifier = "@actspace/tools-runtime";
  const modulePath = createRequire(import.meta.url).resolve(specifier);
  const sharedModules = [{ specifier, url: pathToFileURL(modulePath).href, integrity: artifactHash(await readFile(modulePath)) }];
  await writeFile(join(sourceRoot, "plugin.js"), `import { ToolRuntime } from '@actspace/tools-runtime'; export function apply(ctx) { ctx.provide('tools.runtime', new ToolRuntime()); }`);
  const artifact = await publishPluginArtifact({ sourceRoot, artifactRoot, files: ["plugin.js"], sharedModules, plugin: { schemaVersion: 1, pluginId: pluginId("base"), version: "1", name: "base", runtimeContract: "actspace.runtime.v2", source: { kind: "builtin", reference: "test" }, codecs: [], behaviors: [{ entryId: entryId("base"), module: "./plugin.js", required: true, enabled: true, config: {}, host: { required: [], optional: [] }, frontend: null, provides: [serviceId("tools.runtime")], injects: [], contracts: { services: { provides: [{ id: "tools.runtime", version: 1 }], requires: [] }, events: { provides: [], requires: [] } } }], contributions: { services: ["tools.runtime"], events: [], contributions: [] } } });
  const composition = { schemaVersion: 1 as const, profileId: "base", bundles: [], manifests: [artifact.manifest.plugin], entries: [{ entryId: "base", pluginId: "base", pluginVersion: "1", module: "./plugin.js", required: true, enabled: true, config: {}, requiredCapabilities: [], optionalCapabilities: [], provides: ["tools.runtime"], injects: [], frontendRequired: false, provenance: "test", state: "candidate" as const }], patchResults: [], hostCapabilities: ["process"], warnings: [], config: {}, digest: "base" };
  const control = new HarnessControl({ context: root.context, dataRoot: dir, artifactRoot, runtimeId: "test", compatibility: { services: [], events: [], sharedModules, codecArtifacts: [], capabilities: ["process"] }, sharedServices: [], builtin: async () => ({ composition, artifacts: new Map([["base", artifact]]), sharedServices: [] }), authorize: async (r, context) => context === "approved" ? { ...r, actor: "test-user", decisionId: "yes", expiresAt: Date.now() + 30000 } : null });
  await control.initialize(); cleanup.push(() => control.close());
  expect(control.inspect().blocked).toBe("");
  const hmr = new HarnessHmr({ dataRoot: dir, control }); cleanup.push(() => hmr.close());
  let runSource: SelectionRecord = control.inspect().current!;
  let permitted = true; const approvals: string[] = [];
  const manager = new PluginManager({ dataRoot: dir, artifactRoot, control, hmr, source: async () => runSource, authorize: async input => { approvals.push(input.phase); if (!permitted) throw new Error("denied"); return "approved"; } }); cleanup.push(() => manager.close());
  const context = { sessionId: "a", agentRunId: "run-a", workspaceRoot: dir, signal: new AbortController().signal } as ToolExecutionContext;
  const run = (args: Record<string, unknown>, override = context) => manager.execute(args, override) as Promise<any>;
  return { dir, root, manager, control, hmr, run, context, artifactRoot, approvals, nextRun: () => { runSource = control.inspect(hmr.branchId("a")).current!; }, deny: () => { permitted = false; } };
}
it("builds, mounts, invokes and copies a local tool while preserving old leases and main; recovers binding and rolls back", async () => {
  const s = await setup();
  const old = await s.hmr.acquire("a");
  try {
    let w = await s.run({ action: "create", purpose: "Add JSON transform", toolName: "json_transform" });
    await writeFile(join(w.directory, "implementation.ts"), 'export async function execute(args: Record<string, unknown>): Promise<unknown> { return { first: args.value }; }');
    w = await s.run({ action: "build", workspaceId: w.workspaceId }); const firstArtifact = w.artifactId;
    const sourceBefore = await readFile(join(s.artifactRoot, firstArtifact, "implementation.ts"), "utf8");
    w = await s.run({ action: "prepare", workspaceId: w.workspaceId });
    expect((await s.hmr.inspect("a")).harnessId).toBe("main");
    w = await s.run({ action: "apply", workspaceId: w.workspaceId });
    expect(w.state).toBe("bound"); expect(w.currentRunUnchanged).toBe(true);
    expect(old.getService<ToolRuntime>("tools.runtime")!.registry.listDefinitions()).toEqual([]);
    expect((await s.hmr.inspect("b")).harnessId).toBe("main"); expect(s.control.inspect().current?.revision).toBe(1);
    expect(s.approvals).toEqual(["initialize", "activate"]);
    const first = await s.hmr.acquire("a");
    try {
      const tools = first.getService<ToolRuntime>("tools.runtime")!;
      const result = await tools.registry.capture("json_transform").executor.execute({ value: 7 }, s.context);
      expect(result.modelOutput).toEqual([{ type: "json", value: { first: 7 } }]);
      s.nextRun();
      let copy = await s.run({ action: "create", purpose: "Change output key", entryId: "evolved-json_transform" });
      expect(await readFile(join(copy.directory, "implementation.ts"), "utf8")).toBe(sourceBefore);
      await writeFile(join(copy.directory, "implementation.ts"), 'export async function execute(args: Record<string, unknown>): Promise<unknown> { return { second: args.value }; }');
      copy = await s.run({ action: "build", workspaceId: copy.workspaceId }); expect(copy.artifactId).not.toBe(firstArtifact);
      copy = await s.run({ action: "prepare", workspaceId: copy.workspaceId });
      await s.run({ action: "apply", workspaceId: copy.workspaceId });
      const second = await s.hmr.acquire("a");
      try {
        expect((await second.getService<ToolRuntime>("tools.runtime")!.registry.capture("json_transform").executor.execute({ value: 8 }, s.context)).modelOutput).toEqual([{ type: "json", value: { second: 8 } }]);
        expect((await tools.registry.capture("json_transform").executor.execute({ value: 8 }, s.context)).modelOutput).toEqual([{ type: "json", value: { first: 8 } }]);
        const pinned = await s.control.acquireForScope(first.scope.child("child")); expect(pinned.generationId).toBe(first.generationId); await pinned.release();
      } finally { await second.release(); }
      expect(await readFile(join(s.artifactRoot, firstArtifact, "implementation.ts"), "utf8")).toBe(sourceBefore);
      const recovered = new HarnessHmr({ dataRoot: s.dir, control: s.control });
      expect((await recovered.inspect("a")).executionDigest).not.toBe(first.executionDigest); await recovered.close();
      await s.run({ action: "rollback", workspaceId: copy.workspaceId, executionDigest: first.executionDigest });
      expect((await s.hmr.inspect("a")).executionDigest).toBe(first.executionDigest);
      await rm(copy.directory, { recursive: true });
      const after = await s.hmr.acquire("a"); await after.release();
    } finally { await first.release(); }
    await s.run({ action: "rollback", workspaceId: w.workspaceId, executionDigest: old.executionDigest });
    const original = await s.hmr.acquire("a");
    expect(original.getService<ToolRuntime>("tools.runtime")!.registry.listDefinitions()).toEqual([]);
    await original.release();
    expect(s.control.inspect().instances.filter(x => x.state === "retired")).toHaveLength(0);
  } finally { await old.release(); }
}, 30000);
it("rejects foreign workspaces, invalid source, denied initialization and stale candidates", async () => {
  const s = await setup();
  const a = await s.run({ action: "create", purpose: "Make tool A", toolName: "tool_a" });
  const b = await s.run({ action: "create", purpose: "Make tool B", toolName: "tool_b" });
  await expect(s.run({ action: "status", workspaceId: a.workspaceId }, { ...s.context, sessionId: "other" })).rejects.toThrow("session");
  await writeFile(join(a.directory, "implementation.ts"), 'export async function execute(args: Record<string, unknown>): Promise<unknown> { return args.; }');
  await expect(s.run({ action: "build", workspaceId: a.workspaceId })).rejects.toThrow();
  await writeFile(join(a.directory, "implementation.ts"), 'export async function execute(args: Record<string, unknown>): Promise<unknown> { return args; }');
  for (const w of [a, b]) { await s.run({ action: "build", workspaceId: w.workspaceId }); await s.run({ action: "prepare", workspaceId: w.workspaceId }); }
  await s.run({ action: "apply", workspaceId: a.workspaceId });
  await expect(s.run({ action: "apply", workspaceId: b.workspaceId })).rejects.toThrow("baseline");
  s.nextRun(); const c = await s.run({ action: "create", purpose: "Make tool C", toolName: "tool_c" });
  await s.run({ action: "build", workspaceId: c.workspaceId }); s.deny();
  await expect(s.run({ action: "prepare", workspaceId: c.workspaceId })).rejects.toThrow("denied");
  await expect(s.run({ action: "create", purpose: "Change system", entryId: "base" })).rejects.toThrow("editable source");
}, 30000);
it("keeps the old selection when activation is denied and makes discarded candidates unusable", async () => {
  const s = await setup();
  const before = await s.hmr.inspect("a");
  const w = await s.run({ action: "create", purpose: "test activation refusal", toolName: "refused_tool" });
  await s.run({ action: "build", workspaceId: w.workspaceId });
  const prepared = await s.run({ action: "prepare", workspaceId: w.workspaceId });
  s.deny();
  await expect(s.run({ action: "apply", workspaceId: w.workspaceId })).rejects.toThrow("denied");
  expect(await s.hmr.inspect("a")).toEqual(before);
  expect(s.control.inspect().current?.revision).toBe(1);
  const lease = await s.hmr.acquire("a");
  try {
    expect(lease.getService<ToolRuntime>("tools.runtime")!.registry.listDefinitions()).toEqual([]);
  } finally { await lease.release(); }
  expect(s.approvals).toEqual(["initialize", "activate"]);
  expect(await s.run({ action: "discard", workspaceId: w.workspaceId })).toMatchObject({ state: "discarded" });
  expect(s.control.inspect(prepared.candidate.harnessId).candidates).toEqual([]);
  await expect(s.run({ action: "apply", workspaceId: w.workspaceId })).rejects.toThrow("Prepare");
  await expect(s.run({ action: "build", workspaceId: w.workspaceId })).rejects.toThrow("source copy");
  expect(await s.hmr.inspect("a")).toEqual(before);
}, 30000);

it("registers proxy tools and disposes their handles", async () => {
  const s = await setup(); const lease = await s.hmr.acquire("a");
  try {
    const tools = lease.getService<ToolRuntime>("tools.runtime")!;
    let cleanup!: () => Promise<void>;
    apply({ get: (name: string) => name === "tools.runtime" ? tools : { evolution: s.manager }, provide: () => {}, effect: (fn: () => () => Promise<void>) => { cleanup = fn(); } } as never);
    expect(tools.registry.listDefinitions().map(d => d.name)).toEqual(["harness_inspect", "plugin_manager"]);
    await cleanup(); expect(tools.registry.listDefinitions()).toEqual([]);
  } finally { await lease.release(); }
});
it("rejects external imports before emitting or executing candidate code", async () => {
  const s = await setup();
  await expect(buildTool({ metadata: { name: "bad", description: "bad", inputSchema: { type: "object" } }, implementation: 'import fs from "node:fs"; export async function execute() { return fs; }' }, s.artifactRoot)).rejects.toThrow("without external imports");
});

it("invalidates the last build when a rebuild fails, and rejects unsupported schemas", async () => {
  const s = await setup();
  const w = await s.run({ action: "create", purpose: "test rebuild", toolName: "rebuild" });
  await s.run({ action: "build", workspaceId: w.workspaceId });
  const prepared = await s.run({ action: "prepare", workspaceId: w.workspaceId });
  await s.control.discard(prepared.candidate.candidateId);
  expect(await s.run({ action: "status", workspaceId: w.workspaceId })).toMatchObject({ state: "built", artifactId: prepared.artifactId });
  await s.run({ action: "prepare", workspaceId: w.workspaceId });
  await writeFile(join(w.directory, "implementation.ts"), "broken source !!!");
  await expect(s.run({ action: "build", workspaceId: w.workspaceId })).rejects.toThrow();
  const status = await s.run({ action: "status", workspaceId: w.workspaceId });
  expect(status).toMatchObject({ state: "editable" }); expect(status.artifactId).toBeUndefined(); expect(status.candidate).toBeUndefined();
  await expect(s.run({ action: "prepare", workspaceId: w.workspaceId })).rejects.toThrow("Build");
  await expect(buildTool({ metadata: { name: "bad", description: "bad", inputSchema: { type: "object", oneOf: [] } }, implementation: "" }, s.artifactRoot)).rejects.toThrow("Unsupported inputSchema");
});
