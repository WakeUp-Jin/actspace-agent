import type { LlmAdapter, LlmAdapterDispatchInput, LlmStreamSource } from "@actspace/llm-service";
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

  constructor(private readonly models: DesktopRuntimeV2ModelPort, private readonly readArtifact: SessionArtifactReader) {}

  async dispatch(input: LlmAdapterDispatchInput): Promise<LlmStreamSource> {
    const requested = input.request.model === "default" ? undefined : input.request.model;
    const resolution = input.request.credentialRef === IMAGE_INSPECTION_CREDENTIAL_REF
      ? this.models.resolveImageInspectionModel()
      : this.models.resolveMainModel(requested);
    if (!("model" in resolution)) throw new Error(resolution.message);
    const model = resolution.model;
    const runtime = model.providerRuntime;
    const route = toWireRoute(model.definition.api);
    const engineOptions = {
      route,
      providerId: model.definition.provider,
      modelId: model.definition.apiModel,
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
      request: { ...input.request, model: model.definition.apiModel },
      credential: {
        ...input.credential,
        apiKey: input.credential.apiKey ?? runtime.apiKey,
        baseUrl: input.credential.baseUrl ?? runtime.baseUrl,
        ...(input.credential.proxyUrl === undefined && runtime.transport?.proxyUrl === undefined ? {} : { proxyUrl: input.credential.proxyUrl ?? runtime.transport?.proxyUrl }),
      },
    });
  }

  dispose(): Promise<void> { return this.#proxies.dispose(); }
}

function toWireRoute(api: ModelApi): PiAiWireRoute { return api; }
