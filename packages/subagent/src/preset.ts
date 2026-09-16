export type StaticAgentPreset = {
  readonly id: string;
  readonly version: number;
  readonly routeId: string;
  readonly model: string;
  readonly promptContributorIds: readonly string[];
  readonly allowedToolNames: readonly string[];
  readonly readOnly: boolean;
  readonly maxSteps: number;
  readonly maxDurationMs: number;
  readonly maxDelegationDepth: number;
};

export class StaticPresetRegistry {
  readonly #presets = new Map<string, StaticAgentPreset>();
  register(preset: StaticAgentPreset): void { if (this.#presets.has(preset.id)) throw new Error(`Duplicate Agent Preset ${preset.id}.`); this.#presets.set(preset.id, deepFreeze({ ...preset, promptContributorIds: [...preset.promptContributorIds].sort(), allowedToolNames: [...preset.allowedToolNames].sort() })); }
  get(id: string): StaticAgentPreset { const preset = this.#presets.get(id); if (preset === undefined) throw new Error(`Agent Preset ${id} is unavailable.`); return preset; }
  list(): readonly StaticAgentPreset[] { return Object.freeze([...this.#presets.values()].sort((a, b) => a.id.localeCompare(b.id))); }
}

export function createBuiltInPresets(allToolNames: readonly string[]): StaticPresetRegistry {
  const registry = new StaticPresetRegistry();
  const readOnlyTools = allToolNames.filter((name) => /^(read_file|list_directory|grep|glob)$/.test(name));
  registry.register({ id: "actspace.agent", version: 1, routeId: "default", model: "default", promptContributorIds: [], allowedToolNames: readOnlyTools, readOnly: true, maxSteps: 300, maxDurationMs: 1_800_000, maxDelegationDepth: 1 });
  registry.register({ id: "actspace.explore", version: 1, routeId: "default", model: "default", promptContributorIds: [], allowedToolNames: readOnlyTools, readOnly: true, maxSteps: 300, maxDurationMs: 1_800_000, maxDelegationDepth: 1 });
  return registry;
}

function deepFreeze<T>(value: T): T { if (value !== null && typeof value === "object") { for (const child of Array.isArray(value) ? value : Object.values(value)) deepFreeze(child); Object.freeze(value); } return value; }
