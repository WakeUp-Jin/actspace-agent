import { createRequire } from "node:module";

export type RuntimeModule = typeof import("@actspace/runtime");

type RuntimeLoader = {
  loadRuntime(): Promise<RuntimeModule>;
};

let modulePromise: Promise<RuntimeModule> | undefined;

export function loadRuntimeModule(): Promise<RuntimeModule> {
  modulePromise ??= loadFromPackage();
  return modulePromise;
}

async function loadFromPackage(): Promise<RuntimeModule> {
  const requireFromMain = createRequire(__filename);
  const loader = requireFromMain("@actspace/runtime/loader") as RuntimeLoader;
  if (typeof loader?.loadRuntime !== "function") {
    throw new Error("@actspace/runtime/loader does not expose loadRuntime().");
  }
  return loader.loadRuntime();
}
