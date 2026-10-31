import { manifest as contextManifest } from "@actspace/context-engine/manifest";
import type { RuntimeV2HostDescriptor } from "@actspace/shared/runtime-v2";
import { composeRuntime, type ResolvedComposition } from "@actspace/composition";
import type { Bundle, Patch, Profile } from "@actspace/bundle";
import { entryId, pluginId, serviceId } from "@actspace/cordis-adapter";
import type { PluginManifest } from "@actspace/cordis-adapter";
import { BASE_BUNDLE } from "./base.bundle.js";
import { KERNEL_BUNDLE } from "./kernel.bundle.js";
import { manifest as hostManifest } from "@actspace/agent-host/manifest";
import { manifest as headlessManifest } from "@actspace/headless/manifest";
import { manifest as agentServiceManifest } from "@actspace/agent-service/manifest";
import { manifest as todoManifest } from "@actspace/tools-todo-tools/manifest";

import { manifest as filesystemreadManifest } from "@actspace/tools-filesystem-read/manifest";
import { manifest as filesystemsearchManifest } from "@actspace/tools-filesystem-search/manifest";
import { manifest as filesystemwriteManifest } from "@actspace/tools-filesystem-write/manifest";
import { manifest as shelltoolsManifest } from "@actspace/tools-shell-tools/manifest";
import { manifest as webtoolsManifest } from "@actspace/tools-web-tools/manifest";
import { manifest as imagegenerationManifest } from "@actspace/tools-image-generation/manifest";
import { manifest as imageinspectionManifest } from "@actspace/tools-image-inspection/manifest";

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
export const TOOL_PLUGIN_TRANSPORT = Object.freeze([
  { manifest: filesystemreadManifest, id: "filesystem-read", packageName: "@actspace/tools-filesystem-read" },
  { manifest: filesystemsearchManifest, id: "filesystem-search", packageName: "@actspace/tools-filesystem-search" },
  { manifest: filesystemwriteManifest, id: "filesystem-write", packageName: "@actspace/tools-filesystem-write" },
  { manifest: shelltoolsManifest, id: "shell-tools", packageName: "@actspace/tools-shell-tools" },
  { manifest: webtoolsManifest, id: "web-tools", packageName: "@actspace/tools-web-tools" },
  { manifest: imagegenerationManifest, id: "image-generation", packageName: "@actspace/tools-image-generation" },
  { manifest: imageinspectionManifest, id: "image-inspection", packageName: "@actspace/tools-image-inspection" },
  { manifest: todoManifest, id: "todo-tools", packageName: "@actspace/tools-todo-tools" },
]);
export async function loadBuiltinToolCodec(specifier: string, manifest: PluginManifest) {
  if (manifest.pluginId === agentServiceManifest.pluginId && specifier === "./codec.js") return import("@actspace/agent-service/codec");
  if (manifest.pluginId === contextManifest.pluginId && specifier === "./codec.js") return import("@actspace/context-engine/codec");
  const transport = TOOL_PLUGIN_TRANSPORT.find(item => item.manifest.pluginId === manifest.pluginId);
  if (!transport || !transport.manifest.codecs.some(codec => codec.module === specifier) || specifier !== "./codec.js") throw new Error(`No admitted builtin Codec for ${manifest.pluginId}/${specifier}.`);
  return import(`${transport.packageName}/codec`) as Promise<{ readonly codecs: readonly import("@actspace/session-journal").EventCodec[] }>;
}
export function toolTransportPatches(composition: ResolvedComposition) {
  return TOOL_PLUGIN_TRANSPORT.map(item => {
    const entry = composition.entries.find(entry => entry.pluginId === item.manifest.pluginId && entry.entryId === item.manifest.behaviors[0]!.entryId);
    return { id: item.id, disabled: !entry?.enabled || entry.state === "skipped" };
  });
}
// Admit the pure Context codecs on the Host; behavior lives only in the Harness.
const contextCodecManifest: PluginManifest = Object.freeze({ ...contextManifest, behaviors: [], contributions: { services: [], events: contextManifest.contributions.events, contributions: [] } });
const baseBundle: Bundle = Object.freeze({ id: BASE_BUNDLE.id, version: BASE_BUNDLE.version, manifests: Object.freeze([coreManifest, contextCodecManifest, agentServiceManifest, todoManifest, filesystemreadManifest, filesystemsearchManifest, filesystemwriteManifest, shelltoolsManifest, webtoolsManifest, imagegenerationManifest, imageinspectionManifest]), provenance: "builtin:actspace.base" });
const browserManifest: PluginManifest = Object.freeze({ schemaVersion: 1, pluginId: pluginId("actspace.browser-tools"), version: "2.0.0", name: "ActSpace Browser Tools", runtimeContract: "actspace.runtime.v2", source: { kind: "builtin" as const, reference: "builtin:actspace.browser-tools" }, codecs: [], behaviors: [{ entryId: entryId("browser-tools"), module: "builtin:browser-tools", required: false, enabled: true, config: {}, host: { required: ["browser" as const], optional: [] }, frontend: null, provides: [serviceId("browser-tools")], injects: [serviceId("tools")] }], contributions: { services: ["browser-tools"], events: [], contributions: ["browser-tools"] } });
const browserBundle: Bundle = Object.freeze({ id: "actspace.host.browser", version: "2.0.0", manifests: Object.freeze([browserManifest]), provenance: "builtin:actspace.host.browser" });
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
export const TRUSTED_LOADER_ENTRIES = Object.freeze([
  Object.freeze({ id: "actspace-runtime", name: "@actspace/runtime/cordis", inject: ["actspace.host"] }),
  Object.freeze({ id: "session-journal", name: "@actspace/session-journal/plugin", inject: ["actspace.host.session.codecs"] }),
  Object.freeze({ id: "session-persistence", name: "@actspace/session-persistence/plugin", inject: ["session.journal", "session.storage"] }),
  Object.freeze({ id: "session-jsonl", name: "@actspace/session-jsonl/plugin", inject: ["actspace.host.session", "session.journal"] }),
  Object.freeze({ id: "session-projection", name: "@actspace/session-projection/plugin", inject: [] }),
  Object.freeze({ id: "session-runtime", name: "@actspace/runtime/session", inject: ["actspace.host.session", "session.journal", "session.store", "session.projection"] }),
  Object.freeze({ id: "session-checkpoint-policy", name: "@actspace/session-checkpoint-policy/plugin", inject: ["session.runtime"] }),
  Object.freeze({ id: "llm-service", name: "@actspace/llm-service/plugin", inject: ["actspace.host.llm"] }),
  Object.freeze({ id: "todo-projection", name: "@actspace/runtime/todo-projection", inject: ["session.projection"] }),
  Object.freeze({ id: "core-agent", name: "@actspace/core-agent/plugin", inject: [] }),
  Object.freeze({ id: "agent-runtime", name: "@actspace/runtime/agent-runtime", inject: ["actspace.host.llm", "actspace.host.prompt", "actspace.host.agent", "actspace.host.subagents", "agent.registry", "session.runtime", "session.checkpoint", "session.journal", "session.projection", "actspace.host.tools.filesystem-read", "actspace.host.tools.filesystem-search", "actspace.host.tools.filesystem-write", "actspace.host.tools.shell-tools", "actspace.host.tools.web-tools", "actspace.host.tools.image-generation", "actspace.host.tools.image-inspection", "actspace.host.session"] }),
  Object.freeze({ id: "headless-runner", name: "@actspace/headless/plugin", inject: ["actspace.host.headless", "session.runtime", "agent.runtime"] }),
  Object.freeze({ id: "agent-host", name: "@actspace/agent-host/plugin", inject: ["session.runtime", "agent.runtime"] }),
  Object.freeze({ id: "desktop-app", name: "@actspace/desktop-app/plugin", inject: ["session.runtime", "agent.runtime", "llm.service"] }),
  Object.freeze({ id: "english-learning", name: "@actspace/english-learning/plugin", inject: ["agent.registry", "session.runtime"] }),
  Object.freeze({ id: "side-chat", name: "@actspace/side-chat/plugin", inject: ["session.runtime"] }),
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
  const bundles = [kernelBundle, baseBundle, ...(profileId === RUNTIME_PROFILE_IDS.headless ? [headlessBundle] : []), ...(profileId === RUNTIME_PROFILE_IDS.host ? [hostBundle] : []), ...(appBundle === undefined ? [] : [appBundle]), ...pluginBundles];
  return composeRuntime({ profile: runtimeProfile, bundles, hostBundle: browserBundle, homePatch: options.homePatch, invocationPatch: options.invocationPatch, hostCapabilities: host.capabilityCeiling, loaderConfig: { profileId: runtimeProfile.id, entries: TRUSTED_LOADER_ENTRIES } });
}
