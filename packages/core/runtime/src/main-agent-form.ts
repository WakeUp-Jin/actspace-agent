import { defineMainAgentForm, type AgentFormMember } from "@actspace/agent";
import { PLUGIN_CATALOG, type PluginCatalogEntry } from "./plugin-catalog.js";

/**
 * Form members are the Harness-loaded catalog entries whose manifest declares tools. The manifest also says
 * whether the member is required (`entry.required`) and which tools it must register; `activateAgentFormTools`
 * checks the registry against that list. `0.x` plugins count as version 1 because Headers need a positive version.
 */
export function agentFormMembersFromCatalog(catalog: readonly PluginCatalogEntry[]): readonly AgentFormMember[] {
  return catalog
    .filter(entry => entry.loaders.includes("harness") && (entry.manifest.contributions.tools?.length ?? 0) > 0)
    .map(entry => Object.freeze({
      id: entry.manifest.pluginId,
      version: Math.max(1, Number.parseInt(entry.manifest.version, 10) || 0),
      required: entry.manifest.behaviors[0]?.required ?? true,
      toolNames: entry.manifest.contributions.tools!,
    }));
}

export const MAIN_AGENT_FORM = defineMainAgentForm(agentFormMembersFromCatalog(PLUGIN_CATALOG));
