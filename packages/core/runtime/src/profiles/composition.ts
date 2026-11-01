import type { RuntimeV2HostDescriptor } from "@actspace/shared/runtime-v2";
import { composeRuntime, type ResolvedComposition } from "@actspace/composition";
import type { Bundle, Patch, Profile } from "@actspace/bundle";
import { entryId, pluginId, serviceId } from "@actspace/cordis-adapter";
import type { PluginManifest } from "@actspace/cordis-adapter";
import { manifest as agentServiceManifest } from "@actspace/agent-service/manifest";
import { manifest as hostManifest } from "@actspace/agent-host/manifest";
import { manifest as headlessManifest } from "@actspace/headless/manifest";
import { BASE_BUNDLE } from "./base.bundle.js";
import { KERNEL_BUNDLE } from "./kernel.bundle.js";
import { PLUGIN_CATALOG, pluginCatalogEntry } from "../plugin-catalog.js";

export const RUNTIME_PROFILE_IDS = Object.freeze({
  headless: "actspace.headless",
  desktop: "actspace.desktop",
  host: "actspace.host",
} as const);

export type RuntimeProfileId = (typeof RUNTIME_PROFILE_IDS)[keyof typeof RUNTIME_PROFILE_IDS];

const DEPENDENCIES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  "session.persistence": ["session.codec"],
  prompt: ["scope", "skills"],
  "agent.registry": ["scope", "session.persistence"],
  inbox: ["session.persistence"],
  compaction: ["session.persistence", "prompt", "llm"],
  "agent.loop": ["session.persistence", "prompt", "tools", "llm", "agent.registry", "inbox"],
  "subagent.agent": ["agent.loop", "tools", "session.persistence", "scope"],
  "subagent.explore": ["agent.loop", "tools", "session.persistence", "scope"],
});
function createBuiltinManifest(plugin: string, name: string, entries: readonly string[]): PluginManifest {
  return Object.freeze({
    schemaVersion: 1,
    pluginId: pluginId(plugin),
    version: "2.0.0",
    name,
    runtimeContract: "actspace.runtime.v2",
    source: { kind: "builtin" as const, reference: `builtin:${plugin}` },
    codecs: [],
    behaviors: Object.freeze(entries.map((id) => Object.freeze({
      entryId: entryId(id), module: `builtin:${id}`, required: true, enabled: true, config: {},
      host: { required: [], optional: [] }, frontend: null,
      provides: [serviceId(id)], injects: (DEPENDENCIES[id] ?? []).map(serviceId),
    }))),
    contributions: { services: Object.freeze(entries), events: [], contributions: Object.freeze(entries) },
  });
}
const kernelManifest = createBuiltinManifest("actspace.kernel", "ActSpace Runtime Kernel", KERNEL_BUNDLE.entries);
const coreManifest = createBuiltinManifest("actspace.core", "ActSpace Agent Core", BASE_BUNDLE.entries);
const kernelBundle: Bundle = Object.freeze({ id: KERNEL_BUNDLE.id, version: KERNEL_BUNDLE.version, manifests: Object.freeze([kernelManifest]), provenance: "builtin:actspace.kernel" });
/** Builtin Codecs are admitted by the plugin catalog's `codec` field; agent-service is the only Codec owner outside it. */
export async function loadBuiltinToolCodec(specifier: string, manifest: PluginManifest) {
  if (specifier === "./codec.js") {
    if (manifest.pluginId === agentServiceManifest.pluginId) return import("@actspace/agent-service/codec");
    const owner = PLUGIN_CATALOG.find(entry => entry.codec !== undefined && entry.manifest.pluginId === manifest.pluginId);
    if (owner?.codec !== undefined && owner.manifest.codecs.some(codec => codec.module === specifier)) return import(owner.codec) as Promise<{ readonly codecs: readonly import("@actspace/session-journal").EventCodec[] }>;
  }
  throw new Error(`No admitted builtin Codec for ${manifest.pluginId}/${specifier}.`);
}
/** Harness rows whose manifest the Host composes: a composition-disabled or skipped entry is not loaded into the Harness. */
export function toolTransportPatches(composition: ResolvedComposition) {
  return PLUGIN_CATALOG.filter(item => item.loaders.includes("harness") && item.admitOnHost === true).map(item => {
    const entry = composition.entries.find(entry => entry.pluginId === item.manifest.pluginId && entry.entryId === item.manifest.behaviors[0]!.entryId);
    return { id: item.id, disabled: !entry?.enabled || entry.state === "skipped" };
  });
}
/**
 * Host (Cordis) loader rows whose composition entry is disabled or skipped, as startup-only Include overrides.
 * This is what makes an `invocationPatch` `disable` (for example the english-learning switch) stop the loader
 * from mounting the plugin; the composition alone only records the decision.
 */
export function hostTransportPatches(composition: ResolvedComposition) {
  return PLUGIN_CATALOG.filter(item => item.loaders.includes("host")).flatMap(item => {
    const entry = composition.entries.find(entry => entry.pluginId === item.manifest.pluginId && entry.entryId === item.manifest.behaviors[0]?.entryId);
    return entry !== undefined && (!entry.enabled || entry.state === "skipped") ? [{ id: item.id, disabled: true }] : [];
  });
}
// Admit the pure Context codecs on the Host; behavior lives only in the Harness.
const contextManifest = pluginCatalogEntry("context-engine")!.manifest;
const contextCodecManifest: PluginManifest = Object.freeze({ ...contextManifest, behaviors: [], contributions: { services: [], events: contextManifest.contributions.events, contributions: [] } });
const baseBundle: Bundle = Object.freeze({ id: BASE_BUNDLE.id, version: BASE_BUNDLE.version, manifests: Object.freeze([coreManifest, contextCodecManifest, agentServiceManifest, ...PLUGIN_CATALOG.filter(entry => entry.admitOnHost === true).map(entry => entry.manifest)]), provenance: "builtin:actspace.base" });
const browserBundle: Bundle = Object.freeze({ id: "actspace.host.browser", version: "2.0.0", manifests: Object.freeze([pluginCatalogEntry("browser-tools")!.manifest]), provenance: "builtin:actspace.host.browser" });
const headlessBundle: Bundle = Object.freeze({ id: "actspace.headless", version: headlessManifest.version, manifests: Object.freeze([headlessManifest]), provenance: "@actspace/headless" });

const hostBundle: Bundle = Object.freeze({ id: "actspace.host", version: hostManifest.version, manifests: Object.freeze([hostManifest]), provenance: "@actspace/agent-host" });

const profileDefinitions: Readonly<Record<RuntimeProfileId, Profile>> = Object.freeze({
  [RUNTIME_PROFILE_IDS.host]: Object.freeze({ id: RUNTIME_PROFILE_IDS.host, runtimeContract: "actspace.runtime.v2", orderedBundleIds: Object.freeze([kernelBundle.id, baseBundle.id, hostBundle.id]) }),
  [RUNTIME_PROFILE_IDS.headless]: Object.freeze({ id: RUNTIME_PROFILE_IDS.headless, runtimeContract: "actspace.runtime.v2", orderedBundleIds: Object.freeze([kernelBundle.id, baseBundle.id, headlessBundle.id]) }),
  // Desktop's application Bundle is supplied by @actspace/desktop-app in the
  // Desktop migration phase. Keeping the Profile identity here prevents the
  // Host from falling back to the old `actspace.default` composition.
  [RUNTIME_PROFILE_IDS.desktop]: Object.freeze({ id: RUNTIME_PROFILE_IDS.desktop, runtimeContract: "actspace.runtime.v2", orderedBundleIds: Object.freeze([kernelBundle.id, baseBundle.id]) }),
});

/**
 * The checked-in Cordis transport is intentionally represented as immutable
 * metadata too. Boot verifies the file-backed Include against this list so a
 * hand-edited cordis.yml cannot silently diverge from the resolved Composer.
 */
export const TRUSTED_LOADER_ENTRIES = Object.freeze(PLUGIN_CATALOG.filter(entry => entry.loaders.includes("host")).map(entry =>
  Object.freeze({ id: entry.id, name: entry.module, inject: [...(entry.manifest.behaviors[0]?.injects ?? [])] as string[] }),
));

export function resolveRuntimeProfile(profileId: RuntimeProfileId): Profile {
  const profile = profileDefinitions[profileId];
  if (profile === undefined) throw new Error(`Unknown ActSpace runtime profile: ${profileId}`);
  return profile;
}

export function createProfileComposition(profileId: RuntimeProfileId, host: RuntimeV2HostDescriptor, options: {
  readonly plugins?: readonly PluginManifest[];
  readonly homePatch?: Patch;
  readonly invocationPatch?: Patch;
  /** Application Bundle supplied by a concrete frontend package. */
  readonly appBundle?: Bundle;
} = {}): ResolvedComposition {
  const profile = resolveRuntimeProfile(profileId);
  const pluginBundles = (options.plugins ?? []).map((manifest): Bundle => Object.freeze({
    id: `plugin:${manifest.pluginId}`,
    version: manifest.version,
    manifests: Object.freeze([manifest]),
    provenance: manifest.source.reference,
  }));
  const appBundle = options.appBundle;
  const orderedBundleIds = [
    ...profile.orderedBundleIds,
    ...(appBundle === undefined ? [] : [appBundle.id]),
    ...pluginBundles.map((bundle) => bundle.id),
  ];
  const runtimeProfile: Profile = Object.freeze({ ...profile, orderedBundleIds: Object.freeze(orderedBundleIds) });
  const bundles = [kernelBundle, baseBundle, ...(profileId === RUNTIME_PROFILE_IDS.headless ? [headlessBundle] : []), ...(profileId === RUNTIME_PROFILE_IDS.host ? [hostBundle] : []), ...(appBundle === undefined ? [] : [appBundle]), ...pluginBundles];
  return composeRuntime({ profile: runtimeProfile, bundles, hostBundle: browserBundle, homePatch: options.homePatch, invocationPatch: options.invocationPatch, hostCapabilities: host.capabilityCeiling, loaderConfig: { profileId: runtimeProfile.id, entries: TRUSTED_LOADER_ENTRIES } });
}
