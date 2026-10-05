import { ToolRuntime, ToolRuntimeService } from "./runtime.js";
import { ToolRegistry } from "./registry.js";
import { ToolExecutionScheduler } from "./scheduler.js";
import type { CordisContext } from "@actspace/cordis-adapter";

export type ToolRuntimePluginConfig = { readonly maxParallel?: number };

export function apply(ctx: CordisContext, config: ToolRuntimePluginConfig = {}): void {
  const runtime = new ToolRuntimeService(ctx as never, { maxParallel: config.maxParallel });
  ctx.provide?.("tools.runtime.types", Object.freeze({ ToolRuntime, ToolRuntimeService, ToolRegistry, ToolExecutionScheduler, runtime }));
}
