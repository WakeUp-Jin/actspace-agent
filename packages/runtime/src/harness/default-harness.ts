import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import { artifactHash, publishPluginArtifact, entryId, pluginId, serviceId, type PluginBehaviorDescriptor, type PluginManifest, type SharedArtifactModule, type HarnessContract } from "@actspace/cordis-adapter";
import type { HarnessMountRequest } from "@actspace/boot";
import type { ResolvedComposition } from "@actspace/composition";

const loopEvents: readonly HarnessContract[] = [
  ...["agent/pre-step", "agent/request", "llm/stream", "agent/request-error"].map(id => ({ id, version: 1, mode: "waterfall" as const })),
  { id: "agent/turn-stopping", version: 1, mode: "serial" },
  ...["agent/session-start", "agent/status", "agent/error", "llm/chunk"].map(id => ({ id, version: 1, mode: "emit" as const })),
];
const toolEvents: readonly HarnessContract[] = [
  ...["tools/pre-execute", "tools/execute", "tools/post-execute"].map(id => ({ id, version: 1, mode: "waterfall" as const })),
  { id: "tools/result", version: 1, mode: "emit" },
];

import { DEFAULT_HARNESS_ENTRIES as rows } from "./default-harness-definition.js";

/** Host modules supply data contracts, persistence, and scope identity, not execution policy. */
const hostModules = ["@actspace/cordis-adapter", "@actspace/core-scope", "@actspace/shared", "@actspace/shared/runtime-v2", "@actspace/session-journal", "@actspace/session-persistence", "@actspace/session-projection"];
export const DEFAULT_HARNESS_SHARED_SERVICES = Object.freeze([
  "actspace.host.llm", "actspace.host.prompt", "actspace.host.agent", "actspace.host.subagents", "agent.registry", "session.runtime", "session.checkpoint", "session.journal", "session.projection", "actspace.host.tools.browser",
  ...["filesystem-read", "filesystem-search", "filesystem-write", "shell-tools", "web-tools", "image-generation", "image-inspection"].map(id => `actspace.host.tools.${id}`),
]);

/** Resolve trusted Host contracts without touching persisted executable artifacts. */
export async function defaultHarnessSharedModules(): Promise<SharedArtifactModule[]> {
  return (await Promise.all(hostModules.map(async specifier => {
    const url = pathToFileURL(createRequire(import.meta.url).resolve(specifier)).href;
    return { specifier, url, integrity: artifactHash(await readFile(fileURLToPath(url))) };
  }))).sort((a, b) => a.specifier.localeCompare(b.specifier));
}

/** Publish the build-produced closure; only supported default builtin implementation is admitted. */
export async function prepareDefaultHarnessArtifact(options: {
  readonly artifactRoot: string;
  readonly sourceRoot?: string;
  readonly disabledEntries?: readonly string[];
  readonly hostCapabilities: readonly string[];
}): Promise<HarnessMountRequest> {
  const sourceRoot = options.sourceRoot ?? fileURLToPath(new URL("../default-harness", import.meta.url));
  const files: unknown = JSON.parse(await readFile(join(sourceRoot, "files.json"), "utf8"));
  if (!Array.isArray(files) || files.some(file => typeof file !== "string" || !file.endsWith(".js"))) throw new Error("Invalid default Harness build inventory");
  const sharedModules = await defaultHarnessSharedModules();
  const id = pluginId("actspace.default-harness");
  const manifest: PluginManifest = {
    schemaVersion: 1, pluginId: id, version: "1", name: "Default built-in Harness", runtimeContract: "actspace.runtime.v2",
    source: { kind: "builtin", reference: "builtin:actspace.default-harness" }, codecs: [],
    behaviors: rows.map(([name, provides, injects]): PluginBehaviorDescriptor => ({ entryId: entryId(name as string), module: `./${name}.js`, required: true, enabled: !options.disabledEntries?.includes(name as string), config: name === "browser-tools" ? { disposeHost: false } : {}, host: { required: [], optional: [] }, frontend: null, provides: [...provides].map(serviceId), injects: [...injects].map(serviceId), contracts: { services: { provides: [...provides].map(id => ({ id, version: 1 })), requires: [...injects].map(id => ({ id, version: 1 })) }, events: { provides: name === "agent-factory" ? loopEvents : name === "tools-runtime" ? toolEvents : [], requires: [] } } })),
    contributions: { services: rows.flatMap(([, provides]) => [...provides]), events: [], contributions: [] },
  };
  const artifact = await publishPluginArtifact({ sourceRoot, artifactRoot: options.artifactRoot, plugin: manifest, files: files as string[], sharedModules });
  const composition: ResolvedComposition = {
    schemaVersion: 1, profileId: "actspace.default-harness", bundles: [], manifests: [manifest],
    entries: manifest.behaviors.map(row => ({ entryId: row.entryId, pluginId: id, pluginVersion: manifest.version, module: row.module, required: row.required, enabled: row.enabled, config: row.config, requiredCapabilities: [], optionalCapabilities: [], provides: [...row.provides ?? []], injects: [...row.injects ?? []], frontendRequired: false, provenance: manifest.source.reference, state: row.enabled ? "candidate" : "skipped" })),
    patchResults: [], hostCapabilities: [...options.hostCapabilities], warnings: [], config: {}, digest: artifact.artifactId,
  };
  return { composition, artifacts: new Map([[id, artifact]]), sharedServices: DEFAULT_HARNESS_SHARED_SERVICES };
}
