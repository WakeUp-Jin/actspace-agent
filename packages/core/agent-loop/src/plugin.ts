import { AgentLoop } from "./loop.js";
import { AgentLoopRuntimeService, AgentLoopService } from "./service.js";
import type { AgentLoopServiceOptions } from "./service.js";
import type { CordisContext } from "@actspace/cordis-adapter";

export const inject = Object.freeze(["actspace.agent.factory"]);

export function apply(ctx: CordisContext): void {
  const options = ctx.get?.("actspace.agent.factory") as AgentLoopServiceOptions | undefined;
  if (options === undefined) throw new Error("AgentLoop plugin requires actspace.agent.factory.");
  const service = new AgentLoopRuntimeService(ctx as never, options);
  ctx.provide?.("core.agent-loop", Object.freeze({ AgentLoop, AgentLoopService, AgentLoopRuntimeService, service: service.runtime, runtime: service }));
}

export function activate() {
  return { services: { "core.agent-loop": Object.freeze({ AgentLoop, AgentLoopService, AgentLoopRuntimeService }) }, dispose: () => undefined };
}
