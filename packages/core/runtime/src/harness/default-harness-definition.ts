/** Default Harness admission and build inputs are computed from the plugin catalog. */
import { PLUGIN_CATALOG } from "../plugin-catalog.js";

/** An optional service is injected when present; `fallback` states what the entry does without it. */
export type DefaultHarnessOptionalInject = { readonly id: string; readonly fallback: string };
export type DefaultHarnessEntry = readonly [
  id: string,
  provides: readonly string[],
  injects: readonly string[],
  optionalInjects?: readonly DefaultHarnessOptionalInject[],
];

/** Plugin id of the kernel artifact: every Harness entry that is not a tool plugin (`isHarnessToolPlugin`). */
export const DEFAULT_HARNESS_KERNEL_ID = "actspace.default-harness";

/** Manifests list optional injects by service id; what a plugin does without the service is stated here. */
const OPTIONAL_INJECT_FALLBACKS: Readonly<Record<string, string>> = Object.freeze({
  sandbox: "bash runs outside the sandbox after approval",
  "actspace.host.filesystem": "file tools register but report the capability as unavailable",
  "actspace.host.process": "bash registers but reports the capability as unavailable",
});

function optionalInjects(entryId: string, ids: readonly string[]): readonly DefaultHarnessOptionalInject[] {
  return ids.map((id) => {
    const fallback = OPTIONAL_INJECT_FALLBACKS[id];
    if (fallback === undefined)
      throw new Error(`Plugin ${entryId} has optional inject ${id} without a documented fallback.`);
    return { id, fallback };
  });
}

export const DEFAULT_HARNESS_ENTRIES: readonly DefaultHarnessEntry[] = Object.freeze(
  PLUGIN_CATALOG.filter((entry) => entry.loaders.includes("harness")).map((entry): DefaultHarnessEntry => {
    const behavior = entry.manifest.behaviors[0];
    const optional = optionalInjects(entry.id, behavior.optionalInjects ?? []);
    return optional.length === 0
      ? [entry.id, behavior.provides ?? [], behavior.injects ?? []]
      : [entry.id, behavior.provides ?? [], behavior.injects ?? [], optional];
  }),
);
