import { provideService, type CordisContext } from "@actspace/cordis-adapter";
import * as sessionTitle from "./session-title.js";
import { DESKTOP_APP_SERVICE, DesktopAppService } from "./service.js";

export const inject = Object.freeze(["session.runtime", "agent.runtime", "llm.service", "llm.auxiliary-requests"]);

/**
 * Desktop is an application Bundle, not a second runtime. The loader may
 * discover this entry for a headless tree as well; without the desktop Host
 * marker it remains dormant and publishes no application service.
 */
export async function apply(ctx: CordisContext): Promise<void> {
  if (ctx.get?.("actspace.host.desktop") === undefined) return;
  await ctx.plugin?.(sessionTitle);
  const service = new DesktopAppService(ctx);
  provideService(ctx, DESKTOP_APP_SERVICE, service);
  ctx.effect?.(() => async () => service.dispose(), "desktop.app");
}
