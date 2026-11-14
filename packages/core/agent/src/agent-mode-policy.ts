import type { RuntimeAgentMode } from "@actspace/shared/runtime-v2";
import type { ToolDefinition } from "@actspace/tool-runtime";

export const AGENT_MODES: readonly RuntimeAgentMode[] = Object.freeze(["chat", "plan", "agent"]);
export const EVOLVED_PLUGIN_ID_PREFIX = "actspace.evolved." as const;
export type ModeVisibleTool = Pick<ToolDefinition, "name" | "pluginId" | "modes">;

export function isEvolvedPluginId(pluginId: string): boolean {
  return pluginId.startsWith(EVOLVED_PLUGIN_ID_PREFIX);
}

/**
 * Tool names visible in `mode`. Each definition declares the modes it is visible in (`ToolDefinition.modes`), so a
 * tool that does not name a mode never appears there. Evolved tools are Agent-only whatever their source declares.
 */
export function allowedAgentModeTools(mode: RuntimeAgentMode, definitions: readonly ModeVisibleTool[]): ReadonlySet<string> {
  if (!AGENT_MODES.includes(mode)) throw new Error(`Unsupported Agent mode ${String(mode)}.`);
  const names = new Set<string>();
  for (const definition of definitions) {
    if (!definition.modes.includes(mode)) continue;
    if (mode !== "agent" && isEvolvedPluginId(definition.pluginId)) continue;
    names.add(definition.name);
  }
  return names;
}
