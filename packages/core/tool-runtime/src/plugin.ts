import { ToolRuntime, ToolRuntimeService } from "./runtime.js";
import { ToolRegistry } from "./registry.js";
import { ToolExecutionScheduler } from "./scheduler.js";
import { HOST_WRITABLE_ROOTS_SERVICE_ID, HostWritableRoots } from "./permission/host-writable-roots.js";
import type { CordisContext } from "@actspace/cordis-adapter";

export type ToolRuntimePluginConfig = { readonly maxParallel?: number };

export function apply(ctx: CordisContext, config: ToolRuntimePluginConfig = {}): void {
  const runtime = new ToolRuntimeService(ctx as never, { maxParallel: config.maxParallel });
  ctx.provide?.("tools.runtime.types", Object.freeze({ ToolRuntime, ToolRuntimeService, ToolRegistry, ToolExecutionScheduler, runtime }));
  // Tool plugins that own a scratch directory (shell-tools) register it here; the agent factory reads it per tool call.
  ctx.provide?.(HOST_WRITABLE_ROOTS_SERVICE_ID, new HostWritableRoots());
}
