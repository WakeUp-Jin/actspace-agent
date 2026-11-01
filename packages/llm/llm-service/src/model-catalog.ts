export type LlmModelFacts = { readonly providerId: string; readonly modelId: string; readonly contextWindow: number; readonly capabilities: readonly string[]; readonly source: string; readonly version: string; readonly observedAt: string };

export class LlmModelCatalog {
  readonly #models = new Map<string, LlmModelFacts>();
  upsert(model: LlmModelFacts): void { this.#models.set(`${model.providerId}/${model.modelId}`, Object.freeze({ ...model, capabilities: Object.freeze([...model.capabilities].sort()) })); }
  get(providerId: string, modelId: string): LlmModelFacts | undefined { return this.#models.get(`${providerId}/${modelId}`); }
  list(): readonly LlmModelFacts[] { return Object.freeze([...this.#models.values()].sort((left, right) => `${left.providerId}/${left.modelId}`.localeCompare(`${right.providerId}/${right.modelId}`))); }
}
