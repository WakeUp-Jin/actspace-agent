import type { CordisContext } from "@actspace/cordis-adapter";
import { DesktopAppService } from "./service.js";

export const inject = Object.freeze(["session.runtime", "agent.runtime", "llm.service", "compaction.runtime"]);

/**
 * Desktop is an application Bundle, not a second runtime. The loader may
 * discover this entry for a headless tree as well; without the desktop Host
 * marker it remains dormant and publishes no application service.
 */
export function apply(ctx: CordisContext): void {
  if (ctx.get?.("actspace.host.desktop") === undefined) return;
  const service = new DesktopAppService(ctx);
  ctx.provide?.("desktop.app", service);
  ctx.effect?.(() => async () => service.dispose(), "desktop.app");
}
