import type { CordisContext } from "@actspace/cordis-adapter";
import type { AgentRegistry } from "@actspace/core-agent";
import type { ToolRuntime } from "@actspace/tools-runtime";
import type { BackgroundTaskHost } from "@actspace/background-tasks";
import { registerSubagentTools, type OneShotSubagentProvider } from "@actspace/subagent";

export const inject = ["tools.runtime", "agent.registry", "actspace.host.subagents", "actspace.host.background-tasks"];
/** Tool definitions belong to the Harness; child scheduling belongs to the Host. */
export function apply(ctx: CordisContext): void {
  const tools = ctx.get?.("tools.runtime") as ToolRuntime;
  const registry = ctx.get?.("agent.registry") as AgentRegistry;
  const provider = ctx.get?.("actspace.host.subagents") as Pick<OneShotSubagentProvider, "invoke" | "launch">;
  const background = ctx.get?.("actspace.host.background-tasks") as BackgroundTaskHost | undefined;
  const registrations = registerSubagentTools(tools, provider, sessionId => {
    const parent = registry.list().find(agent => agent.session.header.sessionId === sessionId);
    return parent ? { session: parent.session, scope: parent.scope } : undefined;
  }, background);
  ctx.provide?.("tools.subagents", { registrations });
  ctx.effect?.(() => async () => { await Promise.all(registrations.map(registration => registration.dispose())); });
}
