import { getService, provideService, type CordisContext } from "@actspace/cordis-adapter";
import { HARNESS_HMR_HOST_PORT, HARNESS_HMR_SERVICE, HarnessHmr } from "./service.js";
export const inject = ["actspace.host.hmr"];
export function apply(ctx: CordisContext): void {
  const options = getService(ctx, HARNESS_HMR_HOST_PORT);
  if (!options) throw new Error("HMR requires Host options");
  const service = new HarnessHmr(options);
  provideService(ctx, HARNESS_HMR_SERVICE, service);
  ctx.effect?.(() => () => service.close(), "harness.hmr");
}
