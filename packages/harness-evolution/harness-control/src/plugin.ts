import { getService, provideService, type CordisContext } from "@actspace/cordis-adapter";
import { HARNESS_CONTROL_HOST_PORT, HARNESS_CONTROL_SERVICE, HarnessControl } from "./service.js";
export const inject = ["actspace.host.harness-control"];
export async function apply(ctx: CordisContext): Promise<void> {
  const options = getService(ctx, HARNESS_CONTROL_HOST_PORT);
  if (!options) throw new Error("Harness control requires Host options");
  const service = new HarnessControl({ ...options, context: ctx });
  try { await service.initialize(); provideService(ctx, HARNESS_CONTROL_SERVICE, service); ctx.effect?.(() => () => service.close(), "harness.control"); }
  catch (error) { await service.close(); throw error; }
}
