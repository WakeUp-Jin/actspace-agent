import { BUILTIN_MODEL_CATALOG } from "@actspace/shared/model-catalog-data";
import { resolveModelPricing } from "@actspace/shared";
import type { LlmAdapter, LlmAdapterDispatchInput, LlmStreamSource, LlmStreamEvent } from "@actspace/llm-service";
import type { PiAiWireRoute } from "@actspace/llm-pi-ai";
import { LegacyProxyWireEngine, PiAiAdapter, PiAiWireEngine } from "@actspace/llm-pi-ai";
import { ProviderProxyPool } from "@actspace/llm-service";

export type CliPiAiProvider = {
  readonly providerId: string;
  readonly route: PiAiWireRoute;
  readonly apiKey?: string;
  readonly baseUrl: string;
  readonly proxyUrl?: string;
};

export class CliV2LlmAdapter implements LlmAdapter {
  readonly adapterVersion = "actspace.cli-pi-ai.v2";
  readonly #proxies = new ProviderProxyPool();
  constructor(private readonly options: { readonly mock: boolean; readonly model?: string; readonly provider: CliPiAiProvider; readonly readArtifact: (sessionId: string, artifactId: string) => Promise<{ readonly bytes: Uint8Array; readonly mediaType: string }> }) {}

  async dispatch(input: LlmAdapterDispatchInput): Promise<LlmStreamSource> {
    if (this.options.mock) return mockStream(input.signal);
    const apiModel = this.options.model ?? input.request.model;
    const engineOptions = {
      pricing: resolveModelPricing(BUILTIN_MODEL_CATALOG, { providerId: this.options.provider.providerId, apiModel, modelKey: input.request.model, baseUrl: input.credential.baseUrl ?? this.options.provider.baseUrl }),
      route: this.options.provider.route,
      providerId: this.options.provider.providerId,
      modelId: this.options.model,
      baseUrl: this.options.provider.baseUrl,
      readArtifact: async (sessionId: string, artifactId: string) => {
        const artifact = await this.options.readArtifact(sessionId, artifactId);
        return { data: artifact.bytes, mimeType: artifact.mediaType };
      },
    } as const;
    const adapter = new PiAiAdapter({
      engine: new PiAiWireEngine(engineOptions),
      legacyProxyEngine: new LegacyProxyWireEngine({ ...engineOptions, proxies: this.#proxies }),
    }, this.adapterVersion);
    return adapter.dispatch({
      ...input,
      credential: {
        ...input.credential,
        ...(this.options.provider.apiKey === undefined ? {} : { apiKey: input.credential.apiKey ?? this.options.provider.apiKey }),
        baseUrl: input.credential.baseUrl ?? this.options.provider.baseUrl,
        ...(input.credential.proxyUrl === undefined && this.options.provider.proxyUrl === undefined ? {} : { proxyUrl: input.credential.proxyUrl ?? this.options.provider.proxyUrl }),
      },
    });
  }

  dispose(): Promise<void> { return this.#proxies.dispose(); }
}

async function* mockStream(signal: AbortSignal): AsyncGenerator<LlmStreamEvent> {
  if (!await cancellableDelay(100, signal)) {
    yield { type: "aborted", reason: "Mock LLM request aborted." };
    return;
  }
  const text = "Mock ActSpace Agent response.";
  yield { type: "text-delta", text };
  yield { type: "done", stopReason: "stop", usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, cost: 0, costCurrency: "USD", source: "estimated", costProvenance: { version: 1, basis: "estimated", reason: "mock", pricingSnapshot: null } }, content: [{ type: "text", text }] };
}

function cancellableDelay(delayMs: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve(true);
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
