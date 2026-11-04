import type { AgentRegistry } from "@actspace/agent";
import type { CordisContext } from "@actspace/cordis-adapter";
import { clearCommandCache, registerExternalSubagentTool, type SubagentHostPort } from "@actspace/subagent";
import type { ToolRuntime } from "@actspace/tool-runtime";
import { claudeCodeConfig, createClaudeCodeBackend } from "./backend.js";
import { CLAUDE_CODE_SUBAGENT_PLUGIN_ID } from "./manifest.js";

export const inject = ["tools.runtime", "agent.registry", "actspace.host.subagents"];

/** Registers `agent_claude_code` only when `claude` is installed; otherwise the plugin reports why (design 04 §1). */
export async function apply(ctx: CordisContext, config: Readonly<Record<string, unknown>> = {}): Promise<void> {
  const tools = ctx.get?.("tools.runtime") as ToolRuntime;
  const registry = ctx.get?.("agent.registry") as AgentRegistry;
  const port = ctx.get?.("actspace.host.subagents") as SubagentHostPort;
  const backend = createClaudeCodeBackend({ config: claudeCodeConfig(config) });
  const availability = await backend.available();
  const registration = availability.ok
    ? registerExternalSubagentTool(tools, port, backend, CLAUDE_CODE_SUBAGENT_PLUGIN_ID, sessionId => registry.list().find(agent => agent.session.header.sessionId === sessionId && agent.session.header.lineage?.origin !== "delegation")?.scope)
    : undefined;
  ctx.provide?.("tools.subagent-claude-code", Object.freeze({ availability }));
  ctx.effect?.(() => async () => { await registration?.dispose(); clearCommandCache("claude"); });
}
