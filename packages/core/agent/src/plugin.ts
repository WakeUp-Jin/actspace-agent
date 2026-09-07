import { MAIN_AGENT_DESCRIPTOR } from "./descriptor.js";
import { AgentRegistry, AgentRegistryService } from "./registry.js";
import { MainAgentInbox } from "./inbox.js";
import type { CordisContext } from "@actspace/cordis-adapter";

export function apply(ctx: CordisContext): void {
  const service = new AgentRegistryService(ctx as never);
  ctx.provide?.("core.agent", Object.freeze({ MAIN_AGENT_DESCRIPTOR, AgentRegistry, AgentRegistryService, MainAgentInbox, registry: service }));
}

export function activate() {
  return { services: { "core.agent": Object.freeze({ MAIN_AGENT_DESCRIPTOR, AgentRegistry, AgentRegistryService, MainAgentInbox }) }, dispose: () => undefined };
}
