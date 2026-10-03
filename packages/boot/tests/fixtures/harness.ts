import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineBuiltinPluginManifest, publishPluginArtifact, type PluginArtifact } from "@actspace/cordis-adapter";
import type { ResolvedComposition } from "@actspace/composition";
import type { HarnessMountRequest } from "../../src/harness-mount.js";

export async function harnessFixture(label: string, options: { failApply?: boolean; failImport?: boolean; failDispose?: boolean; badCodec?: boolean; gate?: boolean } = {}): Promise<{ root: string; sourceRoot: string; request: HarnessMountRequest; artifact: PluginArtifact }> {
  const root = await mkdtemp(join(tmpdir(), "actspace-harness-"));
  const sourceRoot = join(root, "source"); await mkdir(sourceRoot);
  const manifest = defineBuiltinPluginManifest({ pluginId: "fixture.harness", name: "fixture", version: "1", entry: { entryId: "reader", behavior: "./reader.mjs", ...(options.badCodec ? { codec: "./codec.mjs" } : {}) }, host: { required: [], optional: [] }, frontend: null, injects: ["host"], contributions: { services: ["reader"], tools: ["search"], prompts: [], events: options.badCodec ? ["plugin/fixture.harness/state"] : [] } });
  await writeFile(join(sourceRoot, "dep.mjs"), `export const label = ${JSON.stringify(label)};`);
  await writeFile(join(sourceRoot, "prompt.txt"), label);
  await writeFile(join(sourceRoot, "reader.mjs"), `import { label } from "./dep.mjs";
import { readFile } from "node:fs/promises";
${options.badCodec ? 'throw new Error("behavior imported before codec admission");' : ''}
${options.failImport ? 'throw new Error("fixture import failed");' : ''}
let calls = 0;
export async function apply(ctx) {
  const host = ctx.get("host");
  ${options.gate ? 'await host.gate;' : ''}
  ${options.failApply ? 'throw new Error("fixture activation failed");' : ''}
  ctx.provide("reader", { read: async () => label + ":" + await readFile(new URL("./prompt.txt", import.meta.url), "utf8"), count: () => ++calls });
  ctx.effect(() => () => { host.disposed.push(label); ${options.failDispose ? 'throw new Error("fixture cleanup failed");' : ''} });
}`);
  if (options.badCodec) await writeFile(join(sourceRoot, "codec.mjs"), 'export const codecs = [];');
  const artifact = await publishPluginArtifact({ sourceRoot, artifactRoot: join(root, "artifacts"), plugin: manifest, files: ["reader.mjs", "dep.mjs", "prompt.txt", ...(options.badCodec ? ["codec.mjs"] : [])] });
  const composition: ResolvedComposition = { schemaVersion: 1, profileId: "fixture", bundles: [], manifests: [manifest], entries: manifest.behaviors.map(row => ({ entryId: row.entryId, pluginId: manifest.pluginId, pluginVersion: manifest.version, module: row.module, required: true, enabled: true, config: {}, requiredCapabilities: [], optionalCapabilities: [], provides: [...row.provides ?? []], injects: [...row.injects ?? []], frontendRequired: false, provenance: "fixture", state: "candidate" })), patchResults: [], hostCapabilities: [], warnings: [], config: {}, digest: "fixture-description" };
  return { root, sourceRoot, artifact, request: { composition, artifacts: new Map([[manifest.pluginId, artifact]]), sharedServices: ["host"] } };
}
