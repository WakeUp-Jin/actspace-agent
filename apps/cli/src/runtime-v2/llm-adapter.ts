import { BUILTIN_MODEL_CATALOG } from "@actspace/shared/model-catalog-data";
import { resolveModelPricing } from "@actspace/shared";
import type { LlmAdapter, LlmAdapterDispatchInput, LlmAdapterPrepareInput, LlmPreparedAdapterCall, LlmStreamSource, LlmStreamEvent } from "@actspace/llm-service";
import type { PiAiWireRoute } from "@actspace/llm-pi-ai";
import { DeepSeekFileUploader, PiAiAdapter } from "@actspace/llm-pi-ai";
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
  readonly #deepSeekFiles = new DeepSeekFileUploader();
  constructor(private readonly options: { readonly mock: boolean; readonly model?: string; readonly provider: CliPiAiProvider; readonly readArtifact: (sessionId: string, artifactId: string) => Promise<{ readonly bytes: Uint8Array; readonly mediaType: string }> }) {}

  prepare(input: LlmAdapterPrepareInput): LlmPreparedAdapterCall {
    if (this.options.mock) return { request: input.request, dispatch: ({ signal }) => Promise.resolve(mockStream(signal)) };
    const apiModel = this.options.model ?? input.request.model;
    const engineOptions = {
      pricing: resolveModelPricing(BUILTIN_MODEL_CATALOG, { providerId: this.options.provider.providerId, apiModel, modelKey: input.request.model, baseUrl: this.options.provider.baseUrl }),
      route: this.options.provider.route,
      providerId: this.options.provider.providerId,
      modelId: this.options.model,
      baseUrl: this.options.provider.baseUrl,
      readArtifact: async (sessionId: string, artifactId: string) => {
        const artifact = await this.options.readArtifact(sessionId, artifactId);
        return { data: artifact.bytes, mimeType: artifact.mediaType };
      },
      deepSeekFiles: this.#deepSeekFiles,
    } as const;
    const adapter = new PiAiAdapter({
      wire: engineOptions,
      legacyProxy: { ...engineOptions, proxies: this.#proxies },
    }, this.adapterVersion);
    const request = Object.freeze({ ...input.request, model: apiModel });
    const dispatchBound = (requestForAttempt: typeof request, dispatchInput: LlmAdapterDispatchInput) => adapter.dispatch({
        ...dispatchInput,
        request: requestForAttempt,
        credential: {
          ...dispatchInput.credential,
          baseUrl: this.options.provider.baseUrl,
          ...(this.options.provider.proxyUrl === undefined ? {} : { proxyUrl: this.options.provider.proxyUrl }),
        },
      });
    return {
      request,
      dispatch: (dispatchInput) => dispatchBound(request, dispatchInput),
      forAttempt: (attemptRequest) => {
        const fixedRequest = Object.freeze({ ...attemptRequest, model: request.model, contextWindow: request.contextWindow });
        return { request: fixedRequest, dispatch: (dispatchInput) => dispatchBound(fixedRequest, dispatchInput) };
      },
    };
  }

  async dispatch(input: LlmAdapterDispatchInput): Promise<LlmStreamSource> { return this.prepare({ request: input.request, signal: input.signal }).dispatch(input); }

  async dispose(): Promise<void> { this.#deepSeekFiles.clear(); await this.#proxies.dispose(); }
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
