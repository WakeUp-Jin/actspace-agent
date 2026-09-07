import { AgentScope } from "./scope.js";
import { ScopeDisposer } from "./disposer.js";
import { ScopedRegistry } from "./layered-registry.js";
import type { CordisContext } from "@actspace/cordis-adapter";

export function apply(ctx: CordisContext): void {
  ctx.provide?.("core.scope", Object.freeze({ AgentScope, ScopeDisposer, ScopedRegistry }));
}

export function activate() {
  return {
    services: { "core.scope": Object.freeze({ AgentScope, ScopeDisposer, ScopedRegistry }) },
    dispose: () => undefined,
  };
}
