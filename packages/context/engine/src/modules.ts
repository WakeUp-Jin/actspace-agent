export type ContextPluginPackage = {
  readonly id: string;
  readonly logicalPackage: string;
  readonly role: "engine" | "context-module" | "strategy";
  /** Current behavior entry; some prompt-owned modules remain adapters until the dependency cycle is removed. */
  readonly behaviorEntry: string;
  readonly owner: string;
  readonly fields: readonly string[];
};

/**
 * The package map is the single migration boundary for Context modules. It
 * keeps the Harness composition explicit while allowing prompt-owned sources to
 * move under `packages/context` without changing Session event owners.
 */
export const CONTEXT_PLUGIN_PACKAGES: readonly ContextPluginPackage[] = Object.freeze([
  { id: "context-engine", logicalPackage: "@actspace/context-engine", role: "engine", behaviorEntry: "@actspace/context-engine/plugin", owner: "actspace.context", fields: ["lifecycle", "capture", "reconcile", "projection"] },
  { id: "context-system", logicalPackage: "@actspace/context-system", role: "context-module", behaviorEntry: "@actspace/context-system/plugin", owner: "actspace.context-system", fields: ["system"] },
  { id: "context-runtime", logicalPackage: "@actspace/context-runtime", role: "context-module", behaviorEntry: "@actspace/context-runtime/plugin", owner: "actspace.context-runtime", fields: ["system", "supplements"] },
  { id: "context-rules", logicalPackage: "@actspace/context-rules", role: "context-module", behaviorEntry: "@actspace/context-rules/plugin", owner: "actspace.context-rules", fields: ["system"] },
  { id: "context-skills", logicalPackage: "@actspace/context-skills", role: "context-module", behaviorEntry: "@actspace/context-skills/plugin", owner: "actspace.context-skills", fields: ["system"] },
  { id: "context-conversation", logicalPackage: "@actspace/context-conversation", role: "context-module", behaviorEntry: "@actspace/context-conversation/plugin", owner: "actspace.context-conversation", fields: ["conversation"] },
  { id: "context-background-tasks", logicalPackage: "@actspace/context-background-tasks", role: "context-module", behaviorEntry: "@actspace/context-background-tasks/plugin", owner: "actspace.context-background-tasks", fields: ["supplements"] },
  { id: "context-tools", logicalPackage: "@actspace/context-tools", role: "context-module", behaviorEntry: "@actspace/context-tools/plugin", owner: "actspace.context-tools", fields: ["tools"] },
  { id: "context-disclosure", logicalPackage: "@actspace/context-disclosure", role: "context-module", behaviorEntry: "@actspace/context-disclosure/plugin", owner: "actspace.context-disclosure", fields: ["status", "supplements"] },
  { id: "context-compaction", logicalPackage: "@actspace/context-compaction", role: "strategy", behaviorEntry: "@actspace/context-compaction/plugin", owner: "actspace.compaction", fields: ["conversation", "status"] },
]);

export function contextPluginPackage(id: string): ContextPluginPackage | undefined {
  return CONTEXT_PLUGIN_PACKAGES.find(entry => entry.id === id);
}
