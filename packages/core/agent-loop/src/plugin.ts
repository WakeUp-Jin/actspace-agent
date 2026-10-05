import { AgentLoop } from "./loop.js";
import type { CordisContext } from "@actspace/cordis-adapter";

/** Default implementation only. Cross-Run scheduling is owned by agent-service. */
export function apply(ctx: CordisContext): void {
  ctx.provide?.("core.agent-loop", Object.freeze({ AgentLoop }));
}
