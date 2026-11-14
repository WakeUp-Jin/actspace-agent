import { createRequire } from "node:module";

export type RuntimeModule = typeof import("@actspace/runtime");

let loaded: Promise<RuntimeModule> | undefined;
let override: (() => Promise<RuntimeModule>) | undefined;

export function loadRuntimeModule(): Promise<RuntimeModule> {
  if (override) return override();
  loaded ??= Promise.resolve().then(() => {
    const loader = createRequire(__filename)("@actspace/runtime/loader") as { loadRuntime?: () => Promise<RuntimeModule> };
    if (typeof loader.loadRuntime !== "function") throw new Error("@actspace/runtime/loader is unavailable.");
    return loader.loadRuntime();
  });
  return loaded;
}

export function setRuntimeLoaderForTest(loader?: () => Promise<RuntimeModule>): void { override = loader; loaded = undefined; }
