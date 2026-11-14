import { requireService, type CordisContext } from "@actspace/cordis-adapter";
import { AGENT_REGISTRY_SERVICE } from "@actspace/agent";
import { TOOL_RUNTIME_SERVICE } from "@actspace/tool-runtime";
import { registerSubagentTools, SUBAGENT_HOST_PORT } from "@actspace/subagent";

export const inject = ["tools.runtime", "agent.registry", "actspace.host.subagents"];
/** Tool definitions belong to the Harness; scheduling belongs to the Host's SubagentManager. */
export function apply(ctx: CordisContext): void {
  const tools = requireService(ctx, TOOL_RUNTIME_SERVICE, "Subagent tools plugin");
  const registry = requireService(ctx, AGENT_REGISTRY_SERVICE, "Subagent tools plugin");
  const port = requireService(ctx, SUBAGENT_HOST_PORT, "Subagent tools plugin");
  const registrations = registerSubagentTools(
    tools,
    port,
    (sessionId) =>
      registry
        .list()
        .find(
          (agent) =>
            agent.session.header.sessionId === sessionId && agent.session.header.lineage?.origin !== "delegation",
        )?.scope,
  );
  ctx.provide?.("tools.subagents", { registrations });
  ctx.effect?.(() => async () => {
    await Promise.all(registrations.map((registration) => registration.dispose()));
  });
}
