import type { CordisContext } from "@actspace/cordis-adapter";
import { AgentApplication } from "@actspace/agent-service";
export const inject = Object.freeze(["session.runtime", "agent.runtime"]);
export function apply(ctx: CordisContext): void {
  if (ctx.get?.("actspace.host.remote") === undefined) return;
  const application = new AgentApplication(ctx, "host");
  ctx.provide?.("host.application", application);
}
