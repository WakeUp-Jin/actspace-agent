import type { AgentRegistry } from "@actspace/agent";
import type { CordisContext } from "@actspace/cordis-adapter";
import { clearCommandCache, registerExternalSubagentTool, type SubagentHostPort } from "@actspace/subagent";
import type { ToolRuntime } from "@actspace/tool-runtime";
import { codexConfig, createCodexBackend } from "./backend.js";
import { CODEX_SUBAGENT_PLUGIN_ID } from "./manifest.js";

export const inject = ["tools.runtime", "agent.registry", "actspace.host.subagents"];

/** Registers `agent_codex` only when `codex` is installed; otherwise the plugin reports why (agent-subagent-runtime.md「外部子智能体」). */
export async function apply(ctx: CordisContext, config: Readonly<Record<string, unknown>> = {}): Promise<void> {
  const tools = ctx.get?.("tools.runtime") as ToolRuntime;
  const registry = ctx.get?.("agent.registry") as AgentRegistry;
  const port = ctx.get?.("actspace.host.subagents") as SubagentHostPort;
  const backend = createCodexBackend({ config: codexConfig(config) });
  const availability = await backend.available();
  const registration = availability.ok
    ? registerExternalSubagentTool(tools, port, backend, CODEX_SUBAGENT_PLUGIN_ID, sessionId => registry.list().find(agent => agent.session.header.sessionId === sessionId && agent.session.header.lineage?.origin !== "delegation")?.scope)
    : undefined;
  ctx.provide?.("tools.subagent-codex", Object.freeze({ availability }));
  ctx.effect?.(() => async () => { await registration?.dispose(); clearCommandCache("codex"); });
}
