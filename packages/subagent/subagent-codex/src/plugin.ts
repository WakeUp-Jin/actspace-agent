import { AGENT_REGISTRY_SERVICE } from "@actspace/agent";
import { requireService, type CordisContext } from "@actspace/cordis-adapter";
import { clearCommandCache, registerExternalSubagentTool, SUBAGENT_HOST_PORT } from "@actspace/subagent";
import { TOOL_RUNTIME_SERVICE } from "@actspace/tool-runtime";
import { codexConfig, createCodexBackend } from "./backend.js";
import { CODEX_SUBAGENT_PLUGIN_ID } from "./manifest.js";

export const inject = ["tools.runtime", "agent.registry", "actspace.host.subagents"];

/** Registers `agent_codex` only when `codex` is installed; otherwise the plugin reports why (design 04 §1). */
export async function apply(ctx: CordisContext, config: Readonly<Record<string, unknown>> = {}): Promise<void> {
  const tools = requireService(ctx, TOOL_RUNTIME_SERVICE, "Codex subagent plugin");
  const registry = requireService(ctx, AGENT_REGISTRY_SERVICE, "Codex subagent plugin");
  const port = requireService(ctx, SUBAGENT_HOST_PORT, "Codex subagent plugin");
  const backend = createCodexBackend({ config: codexConfig(config) });
  const availability = await backend.available();
  const registration = availability.ok
    ? registerExternalSubagentTool(
        tools,
        port,
        backend,
        CODEX_SUBAGENT_PLUGIN_ID,
        (sessionId) =>
          registry
            .list()
            .find(
              (agent) =>
                agent.session.header.sessionId === sessionId && agent.session.header.lineage?.origin !== "delegation",
            )?.scope,
      )
    : undefined;
  ctx.provide?.("tools.subagent-codex", Object.freeze({ availability }));
  ctx.effect?.(() => async () => {
    await registration?.dispose();
    clearCommandCache("codex");
  });
}
