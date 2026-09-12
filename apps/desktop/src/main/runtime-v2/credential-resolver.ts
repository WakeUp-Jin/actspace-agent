import type { CredentialResolver, LlmCredential } from "@actspace/llm-service";
import type { DesktopRuntimeV2ModelPort } from "./model-port";

const DEFAULT_CREDENTIAL_REF = "desktop:default";
const IMAGE_INSPECTION_CREDENTIAL_REF = "desktop:image-inspection";

export class DesktopCredentialResolver implements CredentialResolver {
  constructor(private readonly models: DesktopRuntimeV2ModelPort) {}

  async resolve(credentialRef: string, signal: AbortSignal): Promise<LlmCredential> {
    if (signal.aborted) throw signal.reason ?? new Error("Credential resolution aborted.");
    if (credentialRef === "desktop:utility") return Object.freeze({});
    // The Desktop adapter resolves the requested model and its entire connection together.
    // Resolving the task default here would bind every model to the default provider.
    if (credentialRef === DEFAULT_CREDENTIAL_REF) return Object.freeze({});
    const requestedModel = credentialRef.startsWith("desktop:model:") ? credentialRef.slice("desktop:model:".length) : undefined;
    const resolution = credentialRef === IMAGE_INSPECTION_CREDENTIAL_REF
      ? this.models.resolveImageInspectionModel()
      : requestedModel === undefined
        ? undefined
        : this.models.resolveMainModel(requestedModel);
    if (resolution === undefined) throw new Error("Unsupported Desktop credential reference.");
    if (!("model" in resolution)) throw new Error(resolution.message);
    const runtime = resolution.model.providerRuntime;
    return Object.freeze({
      apiKey: runtime.apiKey,
      baseUrl: runtime.baseUrl,
      proxyUrl: runtime.transport?.proxyUrl,
      pricingMultiplier: runtime.pricingMultiplier,
    });
  }
}

export { DEFAULT_CREDENTIAL_REF, IMAGE_INSPECTION_CREDENTIAL_REF };
