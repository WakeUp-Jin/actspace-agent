import type { CordisContext } from "@actspace/cordis-adapter";
import type { HarnessControlOptions } from "./contracts.js";
import { HarnessControl } from "./service.js";
export const inject = ["actspace.host.harness-control"];
export async function apply(ctx: CordisContext): Promise<void> {
  const options = ctx.get?.("actspace.host.harness-control") as Omit<HarnessControlOptions, "context"> | undefined;
  if (!options) throw new Error("Harness control requires Host options");
  const service = new HarnessControl({ ...options, context: ctx });
  try { await service.initialize(); ctx.provide?.("harness.control", service); ctx.effect?.(() => () => service.close(), "harness.control"); }
  catch (error) { await service.close(); throw error; }
}
