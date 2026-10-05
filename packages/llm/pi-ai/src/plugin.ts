import { PiAiAdapter } from "./pi-ai-adapter.js";
import type { CordisContext } from "@actspace/cordis-adapter";

export function apply(ctx: CordisContext): void {
  ctx.provide?.("llm.route.pi-ai", Object.freeze({ PiAiAdapter }));
}
