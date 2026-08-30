import type { PromptContributor } from "./contributor.js";
import type { AgentScope } from "@actspace/core-scope";

export class ContributorRegistry {
  register(scope: AgentScope, contributor: PromptContributor): () => void {
    if (contributor.scopeId !== scope.identity.scopeId) throw new Error(`Contributor ${contributor.id} belongs to another scope.`);
    return scope.contributors.register({ id: contributor.id, owner: contributor.ownerPluginId, value: contributor });
  }

  visible(scope: AgentScope): readonly PromptContributor[] {
    return scope.contributors.entries()
      .map((entry) => entry.value as PromptContributor)
      .sort((left, right) => layerRank(left.layer) - layerRank(right.layer) || left.order - right.order || left.id.localeCompare(right.id));
  }
}

function layerRank(layer: PromptContributor["layer"]): number {
  return ["core", "profile", "host", "agent", "plugin"].indexOf(layer);
}
