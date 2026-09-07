import { PiAiAdapter } from "./pi-ai-adapter.js";
import { PiAiWireEngine } from "./pi-ai-wire-engine.js";
import { LegacyProxyWireEngine } from "./legacy-proxy-wire-engine.js";
import type { CordisContext } from "@actspace/cordis-adapter";

export function apply(ctx: CordisContext): void {
  ctx.provide?.("llm.route.pi-ai", Object.freeze({ PiAiAdapter, PiAiWireEngine, LegacyProxyWireEngine }));
}

export function activate() {
  return { services: { "llm.route.pi-ai": Object.freeze({ PiAiAdapter, PiAiWireEngine, LegacyProxyWireEngine }) }, dispose: () => undefined };
}
