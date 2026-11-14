import { getService, provideService, serviceKey, type CordisContext } from "@actspace/cordis-adapter";
import { AgentService, type AgentServicePorts } from "./service.js";
export const AGENT_SERVICE_HOST_PORT = serviceKey<AgentServicePorts>("actspace.host.agent-service");
export const AGENT_SERVICE = serviceKey<AgentService>("agent.service");
export const inject = Object.freeze(["actspace.host.agent-service"]);
export function activate(ports: AgentServicePorts) {
  const service = new AgentService(ports);
  return { services: { "agent.service": service }, dispose: () => service.dispose() };
}
export function apply(ctx: CordisContext): void {
  const ports = getService(ctx, AGENT_SERVICE_HOST_PORT);
  if (!ports) throw new Error("Agent service requires actspace.host.agent-service");
  const instance = activate(ports);
  provideService(ctx, AGENT_SERVICE, instance.services["agent.service"]);
  ctx.effect?.(() => () => instance.dispose());
}
