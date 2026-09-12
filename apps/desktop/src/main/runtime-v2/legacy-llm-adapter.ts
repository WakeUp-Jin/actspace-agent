import { BUILTIN_MODEL_CATALOG } from "@actspace/shared/model-catalog-data";
import { resolveModelPricing } from "@actspace/shared";
import type { LlmAdapter, LlmAdapterDispatchInput, LlmRequestModelFacts, LlmStreamSource } from "@actspace/llm-service";
import type { PiAiWireRoute } from "@actspace/llm-pi-ai";
import { LegacyProxyWireEngine, PiAiAdapter, PiAiWireEngine } from "@actspace/llm-pi-ai";
import { ProviderProxyPool } from "@actspace/llm-service";
import type { ModelApi } from "@actspace/shared";
import { IMAGE_INSPECTION_CREDENTIAL_REF } from "./credential-resolver";
import type { DesktopRuntimeV2ModelPort } from "./model-port";

type SessionArtifactReader = (sessionId: string, artifactId: string) => Promise<{ readonly bytes: Uint8Array; readonly mediaType: string }>;

/** Desktop v2 provider boundary. The historical filename remains until P15 removes v1 source. */
export class DesktopLegacyLlmAdapter implements LlmAdapter {
  readonly adapterVersion = "actspace.desktop-pi-ai.v2";
  readonly #proxies = new ProviderProxyPool();

  constructor(private readonly models: DesktopRuntimeV2ModelPort, private readonly readArtifact: SessionArtifactReader, private readonly purpose: "chat" | "utility" = "chat") {}

  private resolveModel(requested?: string) {
    return this.purpose === "utility" && this.models.resolveUtilityTaskModel
      ? this.models.resolveUtilityTaskModel(requested)
      : this.models.resolveMainModel(requested);
  }

  resolveModelFacts(model: string): LlmRequestModelFacts {
    const resolution = this.resolveModel(model === "default" ? undefined : model);
    return { contextWindow: "model" in resolution ? resolution.model.definition.contextWindow : null };
  }

  async dispatch(input: LlmAdapterDispatchInput): Promise<LlmStreamSource> {
    const requested = input.request.model === "default" ? undefined : input.request.model;
    const resolution = input.request.credentialRef === IMAGE_INSPECTION_CREDENTIAL_REF
      ? this.models.resolveImageInspectionModel()
      : this.resolveModel(requested);
    if (!("model" in resolution)) throw new Error(resolution.message);
    const model = resolution.model;
    const runtime = model.providerRuntime;
    const capabilities = model.definition.capabilities;
    const requestedOptions = input.request.options;
    const reasoning = capabilities?.reasoning === false ? false
      : capabilities?.reasoningMandatory ? true
      : capabilities?.thinkingToggle === false ? model.definition.thinkingDefault ?? capabilities.reasoning
      : requestedOptions.reasoning ?? model.definition.thinkingDefault;
    const effort = requestedOptions.reasoningEffort;
    const reasoningEffort = reasoning === false ? undefined
      : effort && (capabilities === undefined || capabilities.reasoningEfforts === null || capabilities.reasoningEfforts?.includes(effort)) ? effort
      : capabilities?.reasoningDefaultEffort;
    const requestOptions = { ...requestedOptions, reasoning, reasoningEffort };
    if (capabilities?.reasoning === false) { delete requestOptions.reasoning; delete requestOptions.reasoningEffort; }
    const requestModel = reasoningEffort ? model.definition.requestModelByReasoningEffort?.[reasoningEffort] ?? model.definition.apiModel : model.definition.apiModel;
    const route = toWireRoute(model.definition.api);
    const pricingModel = model;
    const pricing = this.models.resolvePricing ? this.models.resolvePricing(pricingModel, requestModel) : resolveModelPricing(BUILTIN_MODEL_CATALOG, { providerId: model.definition.provider, apiModel: requestModel, modelKey: model.key, baseUrl: pricingModel.providerRuntime.baseUrl ?? "", connectionId: model.connectionId, multiplier: runtime.pricingMultiplier, configured: model.definition.source === "custom" && requestModel === model.definition.apiModel ? model.definition.pricing : undefined, configuredAlreadyMultiplied: true });
    const engineOptions = {
      pricing,
      ...(capabilities?.input ? { modelFacts: { contextWindow: model.definition.contextWindow, maxTokens: model.definition.maxTokens ?? null, input: capabilities.input, reasoning: capabilities.reasoning } } : {}),
      route,
      providerId: model.definition.provider,
      modelId: requestModel,
      baseUrl: runtime.baseUrl,
      readArtifact: async (sessionId: string, artifactId: string) => {
        const artifact = await this.readArtifact(sessionId, artifactId);
        return { data: artifact.bytes, mimeType: artifact.mediaType };
      },
    } as const;
    const adapter = new PiAiAdapter({
      engine: new PiAiWireEngine(engineOptions),
      legacyProxyEngine: new LegacyProxyWireEngine({ ...engineOptions, proxies: this.#proxies }),
    }, this.adapterVersion);
    return adapter.dispatch({
      ...input,
      request: { ...input.request, model: requestModel, options: requestOptions },
      // Never merge another connection's credentials or proxy into this model.
      credential: {
        apiKey: runtime.apiKey,
        baseUrl: runtime.baseUrl,
        proxyUrl: runtime.transport?.proxyUrl,
        pricingMultiplier: runtime.pricingMultiplier,
      },
    });
  }

  dispose(): Promise<void> { return this.#proxies.dispose(); }
}

function toWireRoute(api: ModelApi): PiAiWireRoute { return api; }
