import { createRequire } from "node:module";

export type RuntimeV2Module = typeof import("@actspace/runtime");

type RuntimeV2Loader = {
  loadRuntime(): Promise<RuntimeV2Module>;
};

let modulePromise: Promise<RuntimeV2Module> | undefined;

export function loadRuntimeV2Module(): Promise<RuntimeV2Module> {
  modulePromise ??= loadFromPackage();
  return modulePromise;
}

async function loadFromPackage(): Promise<RuntimeV2Module> {
  const requireFromMain = createRequire(__filename);
  const loader = requireFromMain("@actspace/runtime/loader") as RuntimeV2Loader;
  if (typeof loader?.loadRuntime !== "function") {
    throw new Error("@actspace/runtime/loader does not expose loadRuntime().");
  }
  return loader.loadRuntime();
}

export function resetRuntimeV2ModuleForTest(): void {
  modulePromise = undefined;
}
