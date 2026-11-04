import type { CordisContext } from "@actspace/cordis-adapter";
import type { AgentRegistry } from "@actspace/agent";
import type { ToolRuntime } from "@actspace/tool-runtime";
import { registerSubagentTools, type SubagentHostPort } from "@actspace/subagent";

export const inject = ["tools.runtime", "agent.registry", "actspace.host.subagents"];
/** Tool definitions belong to the Harness; scheduling belongs to the Host's SubagentManager. */
export function apply(ctx: CordisContext): void {
  const tools = ctx.get?.("tools.runtime") as ToolRuntime;
  const registry = ctx.get?.("agent.registry") as AgentRegistry;
  const port = ctx.get?.("actspace.host.subagents") as SubagentHostPort;
  const registrations = registerSubagentTools(tools, port, sessionId => registry.list().find(agent => agent.session.header.sessionId === sessionId && agent.session.header.lineage?.origin !== "delegation")?.scope);
  ctx.provide?.("tools.subagents", { registrations });
  ctx.effect?.(() => async () => { await Promise.all(registrations.map(registration => registration.dispose())); });
}
