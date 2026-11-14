import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import {
  artifactHash,
  publishPluginArtifact,
  entryId,
  pluginId,
  serviceId,
  type PluginBehaviorDescriptor,
  type PluginManifest,
  type SharedArtifactModule,
  type HarnessContract,
} from "@actspace/cordis-adapter";
import type { HarnessMountRequest } from "@actspace/boot";
import type { ResolvedComposition } from "@actspace/composition";

const loopEvents: readonly HarnessContract[] = [
  ...["agent/pre-step", "agent/request", "llm/stream", "agent/request-error"].map((id) => ({
    id,
    version: 1,
    mode: "waterfall" as const,
  })),
  { id: "agent/turn-stopping", version: 1, mode: "serial" },
  ...["agent/session-start", "agent/status", "agent/error", "llm/chunk"].map((id) => ({
    id,
    version: 1,
    mode: "emit" as const,
  })),
];
const toolEvents: readonly HarnessContract[] = [
  ...["tools/pre-execute", "tools/execute", "tools/post-execute"].map((id) => ({
    id,
    version: 1,
    mode: "waterfall" as const,
  })),
  { id: "tools/result", version: 1, mode: "emit" },
];

import {
  DEFAULT_HARNESS_ENTRIES,
  DEFAULT_HARNESS_KERNEL_ID,
  type DefaultHarnessEntry,
} from "./default-harness-definition.js";
import { isHarnessToolPlugin, pluginCatalogEntry, type PluginCatalogEntry } from "../plugin-catalog.js";

const rows: readonly DefaultHarnessEntry[] = DEFAULT_HARNESS_ENTRIES;

/** `files.json` written by `scripts/build-default-harness.mjs`: the kernel closure plus one directory per tool plugin. */
type DefaultHarnessInventory = {
  readonly kernel: readonly string[];
  readonly plugins: Readonly<Record<string, readonly string[]>>;
};

function parseInventory(value: unknown): DefaultHarnessInventory {
  const jsFiles = (files: unknown): files is readonly string[] =>
    Array.isArray(files) && files.every((file) => typeof file === "string" && file.endsWith(".js"));
  const inventory = value as Partial<DefaultHarnessInventory> | null;
  if (
    inventory === null ||
    typeof inventory !== "object" ||
    !jsFiles(inventory.kernel) ||
    inventory.plugins === null ||
    typeof inventory.plugins !== "object" ||
    !Object.values(inventory.plugins).every(jsFiles)
  ) {
    throw new Error("Invalid default Harness build inventory");
  }
  return inventory as DefaultHarnessInventory;
}

/** Host modules supply data contracts, persistence, and scope identity, not execution policy. */
const hostModules = [
  "@actspace/cordis-adapter",
  "@actspace/scope",
  "@actspace/shared",
  "@actspace/shared/runtime-v2",
  "@actspace/session-journal",
  "@actspace/session-persistence",
  "@actspace/session-projection",
];
export const DEFAULT_HARNESS_SHARED_SERVICES = Object.freeze([
  "actspace.host.llm",
  "actspace.host.prompt",
  "actspace.host.agent",
  "actspace.host.subagents",
  "actspace.host.background-tasks",
  "actspace.host.sandbox",
  "actspace.host.models",
  "actspace.host.session",
  "agent.registry",
  "session.runtime",
  "llm.auxiliary-requests",
  "session.checkpoint",
  "session.journal",
  "session.projection",
  "actspace.host.tools.browser",
  // Capability grants: the Host hands over roots and hooks, the Harness plugins own the file and shell tools.
  "actspace.host.filesystem",
  "actspace.host.process",
  ...["web-tools", "image-generation", "image-inspection"].map((id) => `actspace.host.tools.${id}`),
]);
/** Shared services a Host may leave out; the Harness plugins that use them declare a fallback. */
export const OPTIONAL_HOST_SHARED_SERVICES: readonly string[] = Object.freeze([
  "actspace.host.tools.browser",
  "actspace.host.filesystem",
  "actspace.host.process",
]);

/** Resolve trusted Host contracts without touching persisted executable artifacts. */
export async function defaultHarnessSharedModules(): Promise<SharedArtifactModule[]> {
  return (
    await Promise.all(
      hostModules.map(async (specifier) => {
        const url = pathToFileURL(createRequire(import.meta.url).resolve(specifier)).href;
        return { specifier, url, integrity: artifactHash(await readFile(fileURLToPath(url))) };
      }),
    )
  ).sort((a, b) => a.specifier.localeCompare(b.specifier));
}

/** The manifest's `config` with the Host's settings for this entry on top. */
function entryConfig(
  defaults: PluginBehaviorDescriptor["config"] | undefined,
  settings: Readonly<Record<string, unknown>> | undefined,
): PluginBehaviorDescriptor["config"] {
  if (settings === undefined) return defaults ?? {};
  const base = defaults !== null && typeof defaults === "object" && !Array.isArray(defaults) ? defaults : {};
  return { ...base, ...settings } as PluginBehaviorDescriptor["config"];
}

export interface PrepareDefaultHarnessOptions {
  readonly artifactRoot: string;
  readonly sourceRoot?: string;
  readonly disabledEntries?: readonly string[];
  /** Entry id -> settings over the manifest's `config` defaults. */
  readonly entryConfig?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly hostCapabilities: readonly string[];
}

/** The Harness-side behavior row for one catalog entry; `module` is where the build put it inside its artifact. */
function behaviorFor(
  [name, provides, injects, optional = []]: DefaultHarnessEntry,
  module: string,
  options: PrepareDefaultHarnessOptions,
): PluginBehaviorDescriptor {
  return {
    entryId: entryId(name),
    module,
    required: true,
    enabled: !options.disabledEntries?.includes(name),
    config: entryConfig(pluginCatalogEntry(name)?.manifest.behaviors[0]?.config, options.entryConfig?.[name]),
    host: { required: [], optional: [] },
    frontend: null,
    provides: provides.map(serviceId),
    injects: injects.map(serviceId),
    ...(optional.length ? { optionalInjects: optional.map((o) => serviceId(o.id)) } : {}),
    contracts: {
      services: {
        provides: provides.map((id) => ({ id, version: 1 })),
        requires: [
          ...injects.map((id) => ({ id, version: 1 })),
          ...optional.map((o) => ({ id: o.id, version: 1, optional: true, fallback: o.fallback })),
        ],
      },
      events: {
        provides: name === "agent-factory" ? loopEvents : name === "tools-runtime" ? toolEvents : [],
        requires: [],
      },
    },
  };
}

/** A tool plugin keeps its catalog identity (plugin id, version, source, display) so a patch can address that plugin alone. */
function toolPluginManifest(entry: PluginCatalogEntry, behavior: PluginBehaviorDescriptor): PluginManifest {
  const { manifest } = entry;
  return {
    schemaVersion: 1,
    pluginId: manifest.pluginId,
    version: manifest.version,
    name: manifest.name,
    runtimeContract: "actspace.runtime.v2",
    source: manifest.source,
    codecs: [],
    behaviors: [behavior],
    contributions: {
      services: [...(behavior.provides ?? [])],
      events: [],
      contributions: [...manifest.contributions.contributions],
      ...(manifest.contributions.tools ? { tools: [...manifest.contributions.tools] } : {}),
    },
    ...(manifest.display ? { display: manifest.display } : {}),
  };
}

/**
 * Publish the build-produced closure; only supported default builtin implementation is admitted.
 * The kernel entries share one artifact (`DEFAULT_HARNESS_KERNEL_ID`); every tool plugin is its own artifact.
 */
export async function prepareDefaultHarnessArtifact(
  options: PrepareDefaultHarnessOptions,
): Promise<HarnessMountRequest> {
  const sourceRoot = options.sourceRoot ?? fileURLToPath(new URL("../default-harness", import.meta.url));
  const inventory = parseInventory(JSON.parse(await readFile(join(sourceRoot, "files.json"), "utf8")));
  const sharedModules = await defaultHarnessSharedModules();
  const kernelRows = rows.filter(([name]) => !isHarnessToolPlugin(pluginCatalogEntry(name)));
  const toolRows = rows.filter(([name]) => isHarnessToolPlugin(pluginCatalogEntry(name)));
  const kernel: PluginManifest = {
    schemaVersion: 1,
    pluginId: pluginId(DEFAULT_HARNESS_KERNEL_ID),
    version: "1",
    name: "Default built-in Harness",
    runtimeContract: "actspace.runtime.v2",
    source: { kind: "builtin", reference: `builtin:${DEFAULT_HARNESS_KERNEL_ID}` },
    codecs: [],
    behaviors: kernelRows.map((row) => behaviorFor(row, `./${row[0]}.js`, options)),
    contributions: { services: kernelRows.flatMap(([, provides]) => [...provides]), events: [], contributions: [] },
  };
  const published = [
    {
      manifest: kernel,
      artifact: await publishPluginArtifact({
        sourceRoot,
        artifactRoot: options.artifactRoot,
        plugin: kernel,
        files: inventory.kernel,
        sharedModules,
      }),
    },
  ];
  for (const row of toolRows) {
    const files = inventory.plugins[row[0]];
    if (files === undefined)
      throw new Error(
        `Default Harness build inventory has no artifact for tool plugin ${row[0]}; rebuild @actspace/runtime.`,
      );
    const manifest = toolPluginManifest(pluginCatalogEntry(row[0])!, behaviorFor(row, "./plugin.js", options));
    published.push({
      manifest,
      artifact: await publishPluginArtifact({
        sourceRoot: join(sourceRoot, "plugins", row[0]),
        artifactRoot: options.artifactRoot,
        plugin: manifest,
        files,
        sharedModules,
      }),
    });
  }
  const owner = new Map(
    published.flatMap((item) => item.manifest.behaviors.map((behavior) => [behavior.entryId as string, item] as const)),
  );
  const composition: ResolvedComposition = {
    schemaVersion: 1,
    profileId: DEFAULT_HARNESS_KERNEL_ID,
    bundles: [],
    manifests: published.map((item) => item.manifest),
    entries: rows.map(([name]) => {
      const { manifest, artifact } = owner.get(name)!;
      const row = manifest.behaviors.find((behavior) => behavior.entryId === name)!;
      return {
        entryId: row.entryId,
        artifactId: artifact.artifactId,
        pluginId: manifest.pluginId,
        pluginVersion: manifest.version,
        module: row.module,
        required: row.required,
        enabled: row.enabled,
        config: row.config,
        requiredCapabilities: [],
        optionalCapabilities: [],
        provides: [...(row.provides ?? [])],
        injects: [...(row.injects ?? [])],
        ...(row.optionalInjects ? { optionalInjects: [...row.optionalInjects] } : {}),
        frontendRequired: false,
        provenance: manifest.source.reference,
        state: row.enabled ? "candidate" : "skipped",
      };
    }),
    patchResults: [],
    hostCapabilities: [...options.hostCapabilities],
    warnings: [],
    config: {},
    digest: artifactHash(JSON.stringify(published.map((item) => item.artifact.artifactId))),
  };
  return {
    composition,
    artifacts: new Map(published.map((item) => [item.manifest.pluginId, item.artifact])),
    sharedServices: DEFAULT_HARNESS_SHARED_SERVICES,
  };
}
