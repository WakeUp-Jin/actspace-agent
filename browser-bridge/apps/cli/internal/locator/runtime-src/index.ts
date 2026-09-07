import { createRuntime } from "./runtime";

declare const __ACTSPACE_LOCATOR_BUILD_HASH__: string;

const VERSION = "5";
const BUILD_HASH = __ACTSPACE_LOCATOR_BUILD_HASH__;

if (window.__actspaceLocator?.version !== VERSION || window.__actspaceLocator.buildHash !== BUILD_HASH) {
  window.__actspaceLocator = createRuntime(VERSION, BUILD_HASH);
}
