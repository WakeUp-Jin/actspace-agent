import { createRequire } from "node:module";

export type RuntimeV2Module = typeof import("@actspace/runtime");

let loaded: Promise<RuntimeV2Module> | undefined;
let override: (() => Promise<RuntimeV2Module>) | undefined;

export function loadRuntimeV2(): Promise<RuntimeV2Module> {
  if (override) return override();
  loaded ??= Promise.resolve().then(() => {
    const loader = createRequire(__filename)("@actspace/runtime/loader") as { loadRuntime?: () => Promise<RuntimeV2Module> };
    if (typeof loader.loadRuntime !== "function") throw new Error("@actspace/runtime/loader is unavailable.");
    return loader.loadRuntime();
  });
  return loaded;
}

export function setRuntimeV2LoaderForTest(loader?: () => Promise<RuntimeV2Module>): void { override = loader; loaded = undefined; }
