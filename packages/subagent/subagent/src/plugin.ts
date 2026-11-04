import { SubagentManager } from "./manager.js";
import { subagentToolNames } from "./preset.js";
import type { CordisContext } from "@actspace/cordis-adapter";

export function apply(ctx: CordisContext): void {
  ctx.provide?.("subagent.manager", Object.freeze({ SubagentManager, subagentToolNames }));
}
