import type { RuntimeV2HostDescriptor } from "@actspace/shared/runtime-v2";
import { composeRuntime, type ResolvedComposition } from "@actspace/composition";
import type { Bundle, Patch, Profile } from "@actspace/bundle";
import { entryId, pluginId, serviceId } from "@actspace/cordis-adapter";
import type { PluginManifest } from "@actspace/cordis-adapter";
import { BASE_BUNDLE } from "./base.bundle.js";
import { KERNEL_BUNDLE } from "./kernel.bundle.js";
import { manifest as headlessManifest } from "@actspace/headless/manifest";

export const RUNTIME_PROFILE_IDS = Object.freeze({
  headless: "actspace.headless",
  desktop: "actspace.desktop",
} as const);

export type RuntimeProfileId = (typeof RUNTIME_PROFILE_IDS)[keyof typeof RUNTIME_PROFILE_IDS];

const DEPENDENCIES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  "session.persistence": ["session.codec"],
  prompt: ["scope", "skills"],
  "agent.registry": ["scope", "session.persistence"],
  inbox: ["session.persistence"],
  todo: ["session.persistence"],
  compaction: ["session.persistence", "prompt", "llm"],
  "core-tools": ["tools"],
  "agent.loop": ["session.persistence", "prompt", "tools", "llm", "agent.registry", "inbox", "todo"],
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
const baseBundle: Bundle = Object.freeze({ id: BASE_BUNDLE.id, version: BASE_BUNDLE.version, manifests: Object.freeze([coreManifest]), provenance: "builtin:actspace.base" });
const browserManifest: PluginManifest = Object.freeze({ schemaVersion: 1, pluginId: pluginId("actspace.browser-tools"), version: "2.0.0", name: "ActSpace Browser Tools", runtimeContract: "actspace.runtime.v2", source: { kind: "builtin" as const, reference: "builtin:actspace.browser-tools" }, codecs: [], behaviors: [{ entryId: entryId("browser-tools"), module: "builtin:browser-tools", required: false, enabled: true, config: {}, host: { required: ["browser" as const], optional: [] }, frontend: null, provides: [serviceId("browser-tools")], injects: [serviceId("tools")] }], contributions: { services: [], events: [], contributions: ["browser-tools"] } });
const browserBundle: Bundle = Object.freeze({ id: "actspace.host.browser", version: "2.0.0", manifests: Object.freeze([browserManifest]), provenance: "builtin:actspace.host.browser" });
const headlessBundle: Bundle = Object.freeze({ id: "actspace.headless", version: headlessManifest.version, manifests: Object.freeze([headlessManifest]), provenance: "@actspace/headless" });

const profileDefinitions: Readonly<Record<RuntimeProfileId, Profile>> = Object.freeze({
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
export const TRUSTED_LOADER_ENTRIES = Object.freeze([
  Object.freeze({ id: "actspace-runtime", name: "@actspace/runtime/cordis", inject: ["actspace.host"] }),
  Object.freeze({ id: "session-journal", name: "@actspace/session-journal/plugin", inject: ["actspace.host.session.codecs"] }),
  Object.freeze({ id: "session-persistence", name: "@actspace/session-persistence/plugin", inject: ["actspace.host.session", "session.journal"] }),
  Object.freeze({ id: "session-jsonl", name: "@actspace/session-jsonl/plugin", inject: [] }),
  Object.freeze({ id: "session-projection", name: "@actspace/session-projection/plugin", inject: [] }),
  Object.freeze({ id: "session-runtime", name: "@actspace/runtime/session", inject: ["actspace.host.session", "session.journal", "session.persistence", "session.jsonl", "session.projection"] }),
  Object.freeze({ id: "llm-service", name: "@actspace/llm-service/plugin", inject: ["actspace.host.llm"] }),
  Object.freeze({ id: "tools-runtime", name: "@actspace/tools-runtime/plugin", inject: ["tools.approval"] }),
  Object.freeze({ id: "tools-approval", name: "@actspace/tools-approval/plugin", inject: [] }),
  Object.freeze({ id: "context-assembly", name: "@actspace/context/plugin", inject: ["session.journal"] }),
  Object.freeze({ id: "prompt-runtime", name: "@actspace/prompt/plugin", inject: ["actspace.host.prompt", "context.assembly"] }),
  Object.freeze({ id: "compaction-runtime", name: "@actspace/compaction/plugin", inject: ["llm.service"] }),
  Object.freeze({ id: "core-tools", name: "@actspace/tools-core-tools/plugin", inject: ["tools.runtime", "llm.service", "actspace.host.tools.core"] }),
  Object.freeze({ id: "browser-tools", name: "@actspace/tools-browser-tools/plugin", inject: ["tools.runtime"] }),
  Object.freeze({ id: "core-agent", name: "@actspace/core-agent/plugin", inject: [] }),
  Object.freeze({ id: "agent-factory", name: "@actspace/runtime/agent-factory", inject: ["actspace.host.agent", "agent.registry", "session.runtime", "llm.service", "tools.runtime", "prompt.runtime", "compaction.runtime"] }),
  Object.freeze({ id: "core-agent-loop", name: "@actspace/core-agent-loop/plugin", inject: ["core.agent", "actspace.agent.factory"] }),
  Object.freeze({ id: "subagent-surface", name: "@actspace/subagent/plugin", inject: [] }),
  Object.freeze({ id: "agent-runtime", name: "@actspace/runtime/agent-runtime", inject: ["actspace.host.agent", "agent.registry", "agent.loop", "actspace.agent.factory", "session.runtime", "tools.runtime", "subagent.one-shot"] }),
  Object.freeze({ id: "headless-runner", name: "@actspace/headless/plugin", inject: ["actspace.host.headless", "session.runtime", "agent.loop"] }),
  Object.freeze({ id: "desktop-app", name: "@actspace/desktop-app/plugin", inject: ["session.runtime", "agent.runtime", "llm.service", "compaction.runtime"] }),
  Object.freeze({ id: "english-learning", name: "@actspace/english-learning/plugin", inject: ["agent.registry", "session.runtime"] }),
]);

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
  const bundles = [kernelBundle, baseBundle, ...(profileId === RUNTIME_PROFILE_IDS.headless ? [headlessBundle] : []), ...(appBundle === undefined ? [] : [appBundle]), ...pluginBundles];
  return composeRuntime({ profile: runtimeProfile, bundles, hostBundle: browserBundle, homePatch: options.homePatch, invocationPatch: options.invocationPatch, hostCapabilities: host.capabilityCeiling, loaderConfig: { profileId: runtimeProfile.id, entries: TRUSTED_LOADER_ENTRIES } });
}

export function createDefaultComposition(host: RuntimeV2HostDescriptor, options: {
  readonly plugins?: readonly PluginManifest[];
  readonly homePatch?: Patch;
  readonly invocationPatch?: Patch;
} = {}): ResolvedComposition {
  // Compatibility shim for callers that have not migrated to an explicit
  // Profile yet. New production launchers must choose a profile directly.
  const profileId = host.hostKind === "desktop" ? RUNTIME_PROFILE_IDS.desktop : RUNTIME_PROFILE_IDS.headless;
  return createProfileComposition(profileId, host, options);
}
