import { BUILTIN_MODEL_CATALOG } from "@actspace/shared/model-catalog-data";
import { catalogProviderForEndpoint, resolveModelPricing } from "@actspace/shared";
import type { LlmAdapter, LlmAdapterDispatchInput, LlmAdapterPrepareInput, LlmPreparedAdapterCall, LlmRequestModelFacts, LlmStreamSource } from "@actspace/llm-service";
import type { PiAiWireRoute } from "@actspace/llm-pi-ai";
import { DeepSeekFileUploader, PiAiAdapter } from "@actspace/llm-pi-ai";
import { ProviderProxyPool } from "@actspace/llm-service";
import type { ModelApi, ModelCapabilities, ThinkingLevel } from "@actspace/shared";
import { IMAGE_INSPECTION_CREDENTIAL_REF, bearerAwareAuth } from "./credential-resolver";
import { customConnectionPricingInput, type DesktopRuntimeV2ModelPort } from "./model-port";

type SessionArtifactReader = (sessionId: string, artifactId: string) => Promise<{ readonly bytes: Uint8Array; readonly mediaType: string }>;

/** Desktop v2 provider boundary. The historical filename remains until P15 removes v1 source. */
export class DesktopLegacyLlmAdapter implements LlmAdapter {
  readonly adapterVersion = "actspace.desktop-pi-ai.v2";
  readonly #proxies = new ProviderProxyPool();
  #deepSeekFiles: DeepSeekFileUploader | undefined;

  constructor(private readonly models: DesktopRuntimeV2ModelPort, private readonly readArtifact: SessionArtifactReader, private readonly purpose: "chat" | "utility" | "auto-review" | "explore" = "chat") {}

  private resolveModel(requested?: string) {
    if (this.purpose === "auto-review") {
      if (!this.models.resolveAutoReviewModel) throw new Error("自动审批模型不可用");
      return this.models.resolveAutoReviewModel(requested);
    }
    if (this.purpose === "explore" && this.models.resolveExploreTaskModel) return this.models.resolveExploreTaskModel(requested);
    return this.purpose === "utility" && this.models.resolveUtilityTaskModel
      ? this.models.resolveUtilityTaskModel(requested)
      : this.models.resolveMainModel(requested);
  }

  /** 会话默认以外的用途按用途表的思考档位发请求；会话里的档位由对话框决定。 */
  private purposeThinking(imageInspection: boolean): ThinkingLevel | null {
    const purpose = imageInspection ? "vision" : this.purpose === "auto-review" ? "autoReview" : this.purpose === "chat" ? null : this.purpose;
    return purpose ? this.models.purposeThinking?.(purpose) ?? null : null;
  }

  resolveModelFacts(model: string): LlmRequestModelFacts {
    const resolution = this.resolveModel(model === "default" ? undefined : model);
    return { contextWindow: "model" in resolution ? resolution.model.definition.contextWindow : null };
  }

  prepare(input: LlmAdapterPrepareInput): LlmPreparedAdapterCall {
    const requested = input.request.model === "default" ? undefined : input.request.model;
    const imageInspection = input.request.credentialRef === IMAGE_INSPECTION_CREDENTIAL_REF;
    const resolution = imageInspection
      ? this.models.resolveImageInspectionModel()
      : this.resolveModel(requested);
    if (!("model" in resolution)) throw new Error(resolution.message);
    const model = resolution.model;
    const runtime = model.providerRuntime;
    const capabilities = model.definition.capabilities;
    const purposeLevel = this.purposeThinking(imageInspection);
    const requestedOptions = purposeLevel ? { ...input.request.options, ...thinkingLevelOptions(purposeLevel, capabilities) } : input.request.options;
    const reasoning = capabilities?.reasoning === false ? false
      : capabilities?.reasoningMandatory ? true
      : capabilities?.thinkingToggle === false ? model.definition.thinkingDefault ?? capabilities.reasoning
      : requestedOptions.reasoning ?? model.definition.thinkingDefault;
    const effort = requestedOptions.reasoningEffort;
    const reasoningEffort = reasoning === false ? undefined
      : effort && (capabilities === undefined || capabilities.reasoningEfforts === null || capabilities.reasoningEfforts?.includes(effort)) ? effort
      : capabilities?.reasoningDefaultEffort;
    // Options enter the JSON request snapshot, so an unresolved value is omitted rather than undefined.
    const requestOptions = { ...requestedOptions, reasoning, reasoningEffort };
    for (const key of Object.keys(requestOptions) as (keyof typeof requestOptions)[]) if (requestOptions[key] === undefined) delete requestOptions[key];
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
    const cacheRetention = runtime.promptCacheMode === "off" ? "none" : requestedOptions.cacheRetention ?? "short";
    const pricingModel = model;
    const pricing = this.models.resolvePricing ? this.models.resolvePricing(pricingModel, requestModel) : resolveModelPricing(BUILTIN_MODEL_CATALOG, customConnectionPricingInput(pricingModel, requestModel));
    const endpointOwner = catalogProviderForEndpoint(runtime.baseUrl ?? "");
    const wireProvider = !customConnection ? model.definition.provider
      : endpointOwner === "openrouter" || endpointOwner === "deepseek" ? endpointOwner
      : endpointOwner === "moonshotai" || endpointOwner === "moonshotai-cn" ? "kimi" : "custom";
    const supportsPromptCache = route === "anthropic-messages"
      || (endpointOwner === "openrouter" && route === "openai-completions" && requestModel.startsWith("anthropic/"));
    if (supportsPromptCache) requestOptions.cacheRetention = cacheRetention;
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
      ...(supportsPromptCache ? { cacheRetention } : {}),
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

/** 用途档位 → 请求参数：关 = 不思考；其他档位只在模型声明了这档强度时才带上，否则只开思考、强度用模型默认。 */
export function thinkingLevelOptions(level: ThinkingLevel, capabilities: ModelCapabilities | undefined): { reasoning: boolean; reasoningEffort?: Exclude<ThinkingLevel, "off"> } {
  if (level === "off") return { reasoning: false };
  return capabilities?.reasoningEfforts?.includes(level) ? { reasoning: true, reasoningEffort: level } : { reasoning: true };
}
