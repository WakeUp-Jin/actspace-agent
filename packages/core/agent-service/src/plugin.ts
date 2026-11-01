import type { CordisContext } from "@actspace/cordis-adapter";
import { AgentService, type AgentServicePorts } from "./service.js";
export const inject = Object.freeze(["actspace.host.agent-service"]);
export function activate(ports: AgentServicePorts) {
  const service = new AgentService(ports);
  return { services: { "agent.service": service }, dispose: () => service.dispose() };
}
export function apply(ctx: CordisContext): void {
  const ports = ctx.get?.("actspace.host.agent-service") as AgentServicePorts | undefined;
  if (!ports) throw new Error("Agent service requires actspace.host.agent-service");
  const instance = activate(ports);
  ctx.provide?.("agent.service", instance.services["agent.service"]);
  ctx.effect?.(() => () => instance.dispose());
}
