import { createHash } from "node:crypto";
import { AgentScope, scopeContext } from "@actspace/core-scope";
import { discoverPluginCodecs, importArtifactModule, mountIsolatedCordisTree, verifyPluginArtifact, type CordisContext, type EventCodec, type PluginArtifact } from "@actspace/cordis-adapter";
import type { ResolvedComposition } from "@actspace/composition";

export interface HarnessMountRequest {
  readonly composition: ResolvedComposition;
  readonly artifacts: ReadonlyMap<string, PluginArtifact>;
  readonly sharedServices: readonly string[];
}
export interface HarnessMount {
  readonly executionDigest: string;
  readonly compositionDigest: string;
  readonly scope: AgentScope;
  readonly context: CordisContext;
  readonly codecs: readonly EventCodec[];
  getService<T>(name: string): T | undefined;
  dispose(): Promise<void>;
}

/** Admit all codecs before importing behavior; mount a scoped tree under the existing Host. */
export async function mountHarness(parent: CordisContext, request: HarnessMountRequest): Promise<HarnessMount> {
  // Callers may retain mutable composition objects; preparation captures its own description.
  const composition = structuredClone(request.composition);
  const requestedArtifacts = structuredClone(request.artifacts);
  const sharedServices = [...request.sharedServices];
  const entries = composition.entries.filter(entry => entry.enabled && entry.state !== "skipped");
  const artifacts = new Map<string, PluginArtifact>();
  for (const id of new Set(entries.map(entry => entry.pluginId))) {
    const artifact = requestedArtifacts.get(id);
    if (!artifact) throw new Error(`Missing Harness artifact: ${id}`);
    const verified = await verifyPluginArtifact(artifact);
    if (verified.manifest.plugin.pluginId !== id) throw new Error(`Harness artifact identity mismatch: ${id}`);
    const declared = composition.manifests.find(manifest => manifest.pluginId === id);
    if (!declared || stable({ ...declared, source: { kind: declared.source.kind } }) !== stable({ ...verified.manifest.plugin, source: { kind: verified.manifest.plugin.source.kind } })) throw new Error(`Harness manifest differs from artifact: ${id}`);
    artifacts.set(id, verified);
  }
  for (const entry of entries) {
    const manifest = artifacts.get(entry.pluginId)!.manifest.plugin;
    const descriptor = manifest.behaviors.find(item => item.entryId === entry.entryId);
    if (!descriptor || descriptor.module !== entry.module || manifest.version !== entry.pluginVersion || stable(descriptor.provides ?? []) !== stable(entry.provides) || stable(descriptor.injects ?? []) !== stable(entry.injects)) throw new Error(`Harness entry differs from manifest: ${entry.entryId}`);
    for (const capability of new Set([...descriptor.host.required, ...entry.requiredCapabilities])) {
      if (!composition.hostCapabilities.includes(capability)) throw new Error(`Missing Harness Host capability: ${entry.entryId}/${capability}`);
    }
  }
  const codecs = await discoverPluginCodecs([...artifacts.values()].map(a => a.manifest.plugin), async (specifier, manifest) => {
    const module = await importArtifactModule(artifacts.get(manifest.pluginId)!, specifier) as { codecs: readonly EventCodec[] };
    return module;
  });
  for (const codec of codecs) {
    if (typeof codec.validate !== "function" || !Number.isSafeInteger(codec.currentVersion) || codec.currentVersion < 1 || !["required", "ignorable"].includes(codec.criticality)) throw new Error(`Invalid Harness codec: ${codec.type}`);
  }
  // Every declared codec is required to be present even if its descriptor was empty at runtime.
  for (const artifact of artifacts.values()) for (const descriptor of artifact.manifest.plugin.codecs) for (const type of descriptor.eventTypes) {
    if (!codecs.some(codec => codec.type === type)) throw new Error(`Missing Harness codec: ${type}`);
  }
  const rows = [];
  for (const entry of entries) rows.push({ id: entry.entryId, module: await importArtifactModule(artifacts.get(entry.pluginId)!, entry.module), config: entry.config, provides: entry.provides, injects: entry.injects });
  const scope = new AgentScope("harness");
  try {
    const tree = await mountIsolatedCordisTree({ parent, entries: rows, sharedServices, decorate: ctx => scopeContext(ctx, scope.scopeKey, scope.disposer) });
    let disposal: Promise<void> | undefined;
    return Object.freeze({
      executionDigest: createHash("sha256").update(stable({ composition: composition.digest, artifacts: [...artifacts].map(([id, artifact]) => [id, artifact.artifactId]).sort(), sharedServices: [...sharedServices].sort() })).digest("hex"),
      compositionDigest: composition.digest, scope, context: tree.context, codecs, getService: tree.getService,
      dispose: () => disposal ??= (async () => {
        const results = await Promise.allSettled([scope.dispose(), tree.dispose()]);
        const errors = results.filter((r): r is PromiseRejectedResult => r.status === "rejected").map(r => r.reason);
        if (errors.length) throw new AggregateError(errors, "Harness cleanup failed");
      })(),
    });
  } catch (error) {
    try { await scope.dispose(); } catch (cleanup) { throw new AggregateError([error, cleanup], "Harness preparation and scope cleanup failed"); }
    throw error;
  }
}
function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).filter(key => record[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${stable(record[key])}`).join(",")}}`;
}
