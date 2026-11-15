import { LlmRuntimeService, LlmService } from "./service.js";
export { LLM_HOST_PORT_ID, type LlmHostPort } from "./service-keys.js";
import { LlmRouteRegistry} from "./route-registry.js";
import { LlmModelCatalog } from "./model-catalog.js";
import type { CordisContext } from "@actspace/cordis-adapter";

export async function apply(ctx: CordisContext): Promise<void> {
  const service = new LlmRuntimeService(ctx as never);
  ctx.provide?.("llm.routes", service.routes);
  ctx.provide?.("llm.service.types", Object.freeze({ LlmService, LlmRuntimeService, LlmRouteRegistry, LlmModelCatalog }));
}
