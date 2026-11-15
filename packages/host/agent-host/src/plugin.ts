import { provideService, serviceKey, type CordisContext } from "@actspace/cordis-adapter";
import { AgentApplication, type AgentApplicationContract } from "@actspace/agent-service";
/** 远程 Host 上的应用操作入口；只有 Host 给了 `actspace.host.remote` 才提供。 */
export const HOST_APPLICATION_SERVICE = serviceKey<AgentApplicationContract>("host.application");
export const inject = Object.freeze(["session.runtime", "agent.runtime"]);
export function apply(ctx: CordisContext): void {
  if (ctx.get?.("actspace.host.remote") === undefined) return;
  const application = new AgentApplication(ctx, "host");
  provideService(ctx, HOST_APPLICATION_SERVICE, application);
}
