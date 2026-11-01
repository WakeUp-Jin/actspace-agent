import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { createCordisRoot, defineBuiltinPluginManifest, publishPluginArtifact } from "@actspace/cordis-adapter";
import { HarnessGenerations } from "@actspace/boot";
import type { ResolvedComposition } from "@actspace/composition";
import { createCoreCodecRegistry, createSessionHeader } from "@actspace/session-journal";
import { SessionHandle } from "@actspace/session-persistence";
import { AgentService } from "../service.js";
import { taskCodecs } from "../task-events.js";

function gate() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
it("runs replaceable implementations from real fixed artifacts and retains the old lease until execution stops", async () => {
  const directory = await mkdtemp(join(tmpdir(), "actspace-run-artifact-"));
  const root = await createCordisRoot();
  const harnesses = new HarnessGenerations(root.context);
  const started = gate(); const proceed = gate();
  const calls: string[] = []; const disposed: string[] = [];
  await root.mount("fixture-host", ctx => ctx.provide("fixture.host", { calls, disposed, started: started.resolve, proceed: proceed.promise }), { provides: ["fixture.host"] });
  const manifest = defineBuiltinPluginManifest({ pluginId: "fixture.execution", name: "Execution fixture", version: "1", entry: { entryId: "execution", behavior: "./plugin.mjs" }, host: { required: [], optional: [] }, frontend: null, injects: ["fixture.host"], contributions: { services: ["agent.run-factory"], events: [], tools: [], prompts: [] } });
  const composition: ResolvedComposition = { schemaVersion: 1, profileId: "fixture", bundles: [], manifests: [manifest], entries: manifest.behaviors.map(row => ({ entryId: row.entryId, pluginId: manifest.pluginId, pluginVersion: manifest.version, module: row.module, required: true, enabled: true, config: {}, requiredCapabilities: [], optionalCapabilities: [], provides: [...row.provides ?? []], injects: [...row.injects ?? []], frontendRequired: false, provenance: "fixture", state: "candidate" })), patchResults: [], hostCapabilities: [], warnings: [], config: {}, digest: "fixture" };
  async function prepare(label: string, revision: number) {
    const sourceRoot = join(directory, label); await mkdir(sourceRoot);
    await writeFile(join(sourceRoot, "plugin.mjs"), `export function apply(ctx) {
      const host = ctx.get("fixture.host");
      ctx.provide("agent.run-factory", { create: async input => ({
        execute: async () => { host.calls.push(${JSON.stringify(label)}); if (${JSON.stringify(label)} === "old") { host.started(); await host.proceed; } input.scope.assertActive(); return { outcome: "completed", value: ${JSON.stringify(label)} }; },
        dispose: async () => { input.scope.assertActive(); }
      }) });
      ctx.effect(() => () => { host.disposed.push(${JSON.stringify(label)}); });
    }`);
    const artifact = await publishPluginArtifact({ sourceRoot, artifactRoot: join(directory, "artifacts"), plugin: manifest, files: ["plugin.mjs"] });
    return harnesses.prepare("main", revision, { composition, artifacts: new Map([[manifest.pluginId, artifact]]), sharedServices: ["fixture.host"] });
  }
  const registry = createCoreCodecRegistry(); taskCodecs.forEach(codec => registry.register(codec));
  const session = SessionHandle.createEphemeral({ registry, header: createSessionHeader({ sessionId: "same-session", createdAt: "2026-10-03T00:00:00Z", lineage: null, createdWith: { profileId: "test", runtimeContractVersion: "1", manifestDigest: "test", plugins: [], codecSetDigest: registry.digest } }) });
  const service = new AgentService({ openSession: async () => session, harnessId: () => "main", acquire: id => harnesses.acquire(id), readConfiguration: () => ({ mode: "agent" }) });
  try {
    harnesses.activate(await prepare("old", 0));
    await service.submit(session.header.sessionId, "one", "first"); await started.promise;
    await service.submit(session.header.sessionId, "two", "second");
    harnesses.activate(await prepare("new", 1));
    expect(disposed).toEqual([]);
    expect(harnesses.inspect().find(item => item.state === "retired")?.users).toBe(1);
    proceed.resolve(); await service.waitForIdle(session.header.sessionId);
    expect(calls).toEqual(["old", "new"]);
    expect(disposed).toEqual(["old"]);
    expect((await service.snapshot(session.header.sessionId)).runs.map(run => run.harness.revision)).toEqual([1, 2]);
  } finally {
    proceed.resolve(); await service.dispose(); await harnesses.close(); await session.close(); await root.dispose(); await rm(directory, { recursive: true, force: true });
  }
});
