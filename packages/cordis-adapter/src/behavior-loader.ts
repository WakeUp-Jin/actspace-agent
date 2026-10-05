import type { Context, Plugin } from "@deepseek-ai/cordis";
import type { JsonObject} from "./plugin-contract.js";

/** DSH-native Behavior ABI. The wrapper below intentionally presents an arrow
 * `apply` callback to Cordis so a Behavior's returned disposer is collected as
 * an ordinary plugin effect even when the module itself exports a named
 * function declaration (which Cordis otherwise treats as a constructor). */
export type ActSpaceBehavior = {
  readonly inject?: readonly string[] | Readonly<Record<string, unknown>>;
  readonly apply: (ctx: Context, config: JsonObject) => unknown;
};

export type ActSpaceBehaviorModule = ActSpaceBehavior | ((ctx: Context, config: JsonObject) => unknown);

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

function asRecord(value: unknown): Record<string, any> | undefined {
  return value !== null && typeof value === "object" ? value as Record<string, any> : undefined;
}
