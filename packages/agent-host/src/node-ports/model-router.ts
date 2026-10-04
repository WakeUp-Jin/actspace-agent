import type { LlmAdapter, LlmAdapterDispatchInput, LlmAdapterPrepareInput, LlmPreparedAdapterCall } from "@actspace/llm-service";
import type { HostConfig } from "../config.js";
import { NodeLlmAdapter } from "./llm-adapter.js";
/** One stable Runtime route selects a Host-owned model and credential per request. */
export class HostModelRouter implements LlmAdapter {
  readonly adapterVersion = "actspace.host-model-router.v1";
  readonly #models = new Map<string, { adapter: NodeLlmAdapter; keyEnv: string; baseUrl: string }>();
  constructor(private readonly config: HostConfig, options: { mock?: boolean; readArtifact: ConstructorParameters<typeof NodeLlmAdapter>[0]["readArtifact"]; env?: NodeJS.ProcessEnv }) {
    this.#env = options.env ?? process.env;
    for (const provider of config.providers) for (const model of provider.models) this.#models.set(`${provider.id}/${model}`, {
      keyEnv: provider.keyEnv, baseUrl: provider.baseUrl,
      adapter: new NodeLlmAdapter({ mock: options.mock === true, model, provider: { providerId: provider.id, route: provider.type, baseUrl: provider.baseUrl }, readArtifact: options.readArtifact }),
    });
  }
  readonly #env: NodeJS.ProcessEnv;
  prepare(input: LlmAdapterPrepareInput): LlmPreparedAdapterCall {
    const key = input.request.model === "default" || !input.request.model ? this.config.defaultModel : input.request.model;
    const entry = this.#models.get(key);
    if (!entry) throw new Error("Model is not published by this Host");
    const apiKey = this.#env[entry.keyEnv];
    const prepared = entry.adapter.prepare(input);
    const bind = (call: LlmPreparedAdapterCall): LlmPreparedAdapterCall => ({
      request: call.request,
      dispatch: dispatch => call.dispatch({ ...dispatch, credential: { apiKey, baseUrl: entry.baseUrl } }),
      forAttempt: call.forAttempt ? request => bind(call.forAttempt!(request)) : undefined,
    });
    return bind(prepared);
  }
  dispatch(input: LlmAdapterDispatchInput) { return this.prepare({ request: input.request, signal: input.signal }).dispatch(input); }
  async dispose(): Promise<void> { await Promise.all([...this.#models.values()].map(entry => entry.adapter.dispose())); }
}
