import { ContextCompactionCoordinator } from "./compaction.js";
import { ContextEngine, type ContextEngineOptions } from "./engine.js";
import type { CordisContext } from "@actspace/cordis-adapter";

export function apply(ctx: CordisContext): void {
  ctx.provide?.("context.engine", Object.freeze({ compaction: new ContextCompactionCoordinator(), create: (options: ContextEngineOptions) => new ContextEngine(options) }));
}
