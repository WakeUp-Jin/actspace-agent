import { BUILTIN_MODEL_CATALOG } from "@actspace/shared/model-catalog-data";
import { catalogProviderForEndpoint, resolveModelPricing } from "@actspace/shared";
import type { LlmAdapter, LlmAdapterDispatchInput, LlmAdapterPrepareInput, LlmPreparedAdapterCall, LlmRequestModelFacts, LlmStreamSource } from "@actspace/llm-service";
import type { PiAiWireRoute } from "@actspace/llm-pi-ai";
import { DeepSeekFileUploader, PiAiAdapter } from "@actspace/llm-pi-ai";
import { ProviderProxyPool } from "@actspace/llm-service";
import type { ModelApi } from "@actspace/shared";
import { IMAGE_INSPECTION_CREDENTIAL_REF, bearerAwareAuth } from "./credential-resolver";
import { customConnectionPricingInput, type DesktopRuntimeV2ModelPort } from "./model-port";

type SessionArtifactReader = (sessionId: string, artifactId: string) => Promise<{ readonly bytes: Uint8Array; readonly mediaType: string }>;

/** Desktop v2 provider boundary. The historical filename remains until P15 removes v1 source. */
export class DesktopLegacyLlmAdapter implements LlmAdapter {
  readonly adapterVersion = "actspace.desktop-pi-ai.v2";
  readonly #proxies = new ProviderProxyPool();
  #deepSeekFiles: DeepSeekFileUploader | undefined;

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

  prepare(input: LlmAdapterPrepareInput): LlmPreparedAdapterCall {
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
    const customConnection = Boolean(model.connectionId && model.connectionId !== `${model.definition.provider}:default`);
    if (customConnection && requestedOptions.reasoningEffort && !capabilities?.reasoningEfforts?.includes(requestedOptions.reasoningEffort)) throw new Error("该模型未配置此推理强度，请在模型设置中确认支持的档位。");
    // Auto is an omitted effort, including when the UI explicitly enables reasoning.
    if (customConnection && requestedOptions.reasoning !== false && requestedOptions.reasoningEffort === undefined) {
      delete requestOptions.reasoningEffort;
      delete requestOptions.reasoning;
    }
    if (capabilities?.reasoning === false) { delete requestOptions.reasoning; delete requestOptions.reasoningEffort; }
    const requestModel = reasoningEffort ? model.definition.requestModelByReasoningEffort?.[reasoningEffort] ?? model.definition.apiModel : model.definition.apiModel;
    const route = toWireRoute(model.definition.api);
    const cacheRetention: "short" | "none" = runtime.promptCacheMode === "off" ? "none" : "short";
    const pricingModel = model;
    const pricing = this.models.resolvePricing ? this.models.resolvePricing(pricingModel, requestModel) : resolveModelPricing(BUILTIN_MODEL_CATALOG, customConnectionPricingInput(pricingModel, requestModel));
    const endpointOwner = catalogProviderForEndpoint(runtime.baseUrl ?? "");
    const wireProvider = !customConnection ? model.definition.provider
      : endpointOwner === "openrouter" || endpointOwner === "deepseek" ? endpointOwner
      : endpointOwner === "moonshotai" || endpointOwner === "moonshotai-cn" ? "kimi" : "custom";
    const deepSeekFiles = wireProvider === "deepseek" && route === "openai-completions" && capabilities?.input?.includes("image")
      ? (this.#deepSeekFiles ??= new DeepSeekFileUploader())
      : undefined;
    const engineOptions = {
      pricing,
      ...(capabilities?.input ? { modelFacts: { contextWindow: model.definition.contextWindow, maxTokens: model.definition.maxTokens ?? null, input: capabilities.input, reasoning: capabilities.reasoning } } : {}),
      route,
      providerId: wireProvider,
      modelId: requestModel,
      baseUrl: runtime.baseUrl,
      ...(route === "anthropic-messages" ? { cacheRetention } : {}),
      readArtifact: async (sessionId: string, artifactId: string) => {
        const artifact = await this.readArtifact(sessionId, artifactId);
        return { data: artifact.bytes, mimeType: artifact.mediaType };
      },
      ...(deepSeekFiles === undefined ? {} : { deepSeekFiles }),
    } as const;
    const adapter = new PiAiAdapter({
      wire: engineOptions,
      legacyProxy: { ...engineOptions, proxies: this.#proxies },
    }, this.adapterVersion);
    const request = Object.freeze({ ...input.request, model: requestModel, options: Object.freeze(requestOptions), contextWindow: model.definition.contextWindow });
    const dispatchBound = (requestForAttempt: typeof request, dispatchInput: LlmAdapterDispatchInput) => adapter.dispatch({
        ...dispatchInput,
        request: requestForAttempt,
        // Connection identity is fixed during prepare; secret material is resolved per dispatch.
        credential: runtime.authScheme === "bearer" ? {
          ...withoutApiKey(dispatchInput.credential),
          headers: { ...dispatchInput.credential.headers, ...bearerAwareAuth({ apiKey: dispatchInput.credential.apiKey ?? runtime.apiKey, authScheme: "bearer" }).headers },
          baseUrl: runtime.baseUrl,
          proxyUrl: runtime.transport?.proxyUrl,
          pricingMultiplier: runtime.pricingMultiplier,
        } : {
          ...dispatchInput.credential,
          ...(dispatchInput.credential.apiKey === undefined && runtime.apiKey === undefined ? {} : { apiKey: dispatchInput.credential.apiKey ?? runtime.apiKey }),
          baseUrl: runtime.baseUrl,
          proxyUrl: runtime.transport?.proxyUrl,
          pricingMultiplier: runtime.pricingMultiplier,
        },
      });
    return {
      request,
      dispatch: (dispatchInput) => dispatchBound(request, dispatchInput),
      forAttempt: (attemptRequest) => {
        const fixedRequest = Object.freeze({ ...attemptRequest, model: request.model, options: request.options, contextWindow: request.contextWindow });
        return { request: fixedRequest, dispatch: (dispatchInput) => dispatchBound(fixedRequest, dispatchInput) };
      },
    };
  }

  async dispatch(input: LlmAdapterDispatchInput): Promise<LlmStreamSource> { return this.prepare({ request: input.request, signal: input.signal }).dispatch(input); }

  async dispose(): Promise<void> { this.#deepSeekFiles?.clear(); await this.#proxies.dispose(); }
}

function toWireRoute(api: ModelApi): PiAiWireRoute { return api; }

function withoutApiKey<T extends { readonly apiKey?: string }>(credential: T): Omit<T, "apiKey"> {
  const { apiKey: _apiKey, ...rest } = credential;
  return rest;
}
