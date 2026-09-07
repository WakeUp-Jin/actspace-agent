import { LlmRuntimeService, LlmService } from "./service.js";
import { LlmRouteRegistry, type LlmRouteRegistrationHandle } from "./route-registry.js";
import { LlmModelCatalog } from "./model-catalog.js";
import type { CordisContext } from "@actspace/cordis-adapter";
import type { LlmRouteRegistration } from "./adapter.js";
import type { CredentialResolver } from "./credential-port.js";

export const LLM_HOST_PORT_ID = "actspace.host.llm" as const;

export type LlmHostPort = {
  readonly credentials: CredentialResolver;
  readonly routes: readonly LlmRouteRegistration[];
};

export async function apply(ctx: CordisContext): Promise<void> {
  const service = new LlmRuntimeService(ctx as never);
  ctx.provide?.("llm.routes", service.routes);
  ctx.provide?.("llm.service.types", Object.freeze({ LlmService, LlmRuntimeService, LlmRouteRegistry, LlmModelCatalog }));
}

export function activate() {
  return { services: { "llm.service": Object.freeze({ LlmService, LlmRouteRegistry, LlmModelCatalog }) }, dispose: () => undefined };
}
