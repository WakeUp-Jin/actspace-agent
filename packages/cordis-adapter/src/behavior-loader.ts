import type { Context, Plugin } from "@deepseek-ai/cordis";
import type { PluginBehaviorDescriptor, PluginManifest } from "./manifest.js";
import type { JsonObject, JsonValue } from "./plugin-contract.js";

/** DSH-native Behavior ABI. The wrapper below intentionally presents an arrow
 * `apply` callback to Cordis so a Behavior's returned disposer is collected as
 * an ordinary plugin effect even when the module itself exports a named
 * function declaration (which Cordis otherwise treats as a constructor). */
export type ActSpaceBehavior = {
  readonly inject?: readonly string[] | Readonly<Record<string, unknown>>;
  readonly apply: (ctx: Context, config: JsonObject) => unknown;
};

export type ActSpaceBehaviorModule = ActSpaceBehavior | ((ctx: Context, config: JsonObject) => unknown);

export type BehaviorActivation = { readonly services: Readonly<Record<string, unknown>>; readonly dispose: () => void | Promise<void> };
export type BehaviorModule = { readonly activate: (context: { readonly pluginId: string; readonly entryId: string; readonly config: unknown }) => { readonly services?: Readonly<Record<string, unknown>>; readonly dispose: () => void | Promise<void> } | Promise<{ readonly services?: Readonly<Record<string, unknown>>; readonly dispose: () => void | Promise<void> }> };

/**
 * Normalize a trusted module's default/named export into a real Cordis plugin
 * object. `activate()` is deliberately rejected on this path; it belongs to
 * the retired ActSpace activation protocol and must not be silently adapted.
 */
export function toCordisBehavior(module: unknown, entryId = "behavior"): Plugin {
  const record = asRecord(module);
  const candidate = record?.default ?? module;
  const candidateRecord = asRecord(candidate);
  const apply = typeof candidate === "function"
    ? candidate
    : candidateRecord !== undefined && typeof candidateRecord.apply === "function"
      ? candidateRecord.apply
      : undefined;
  if (apply === undefined) {
    if (candidateRecord !== undefined && typeof candidateRecord.activate === "function") {
      throw new Error(`Behavior ${entryId} uses retired activate(); export apply(ctx, config) instead.`);
    }
    throw new Error(`Behavior ${entryId} has no apply export.`);
  }
  const inject = candidateRecord?.inject ?? (record?.inject as ActSpaceBehavior["inject"] | undefined);
  return Object.freeze({
    ...(inject === undefined ? {} : { inject }),
    name: entryId,
    apply: (ctx: Context, config: JsonObject) => apply(ctx, config),
  }) as Plugin;
}

/** Normalize ESM/CJS interop and create the Loader-ready plugin object. */
export async function loadCordisBehavior(
  specifier: string,
  load: (specifier: string) => Promise<unknown>,
  entryId = specifier,
): Promise<Plugin> {
  return toCordisBehavior(await load(specifier), entryId);
}

export async function activateBehavior(manifest: PluginManifest, descriptor: PluginBehaviorDescriptor, load: (specifier: string) => Promise<BehaviorModule>): Promise<BehaviorActivation> {
  const module = await load(descriptor.module);
  if (typeof module.activate !== "function") throw new Error(`Behavior ${descriptor.entryId} has no activate export.`);
  const activation = await module.activate({ pluginId: manifest.pluginId, entryId: descriptor.entryId, config: descriptor.config });
  if (typeof activation?.dispose !== "function") throw new Error(`Behavior ${descriptor.entryId} did not return an owned disposer.`);
  const services = Object.freeze({ ...(activation.services ?? {}) });
  const expected = [...(descriptor.provides ?? [])].sort(); const actual = Object.keys(services).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) { await activation.dispose(); throw new Error(`Behavior ${descriptor.entryId} service exports do not match its manifest.`); }
  let disposed = false;
  return Object.freeze({ services, dispose: async () => { if (disposed) return; disposed = true; await activation.dispose(); } });
}

function asRecord(value: unknown): Record<string, any> | undefined {
  return value !== null && typeof value === "object" ? value as Record<string, any> : undefined;
}
