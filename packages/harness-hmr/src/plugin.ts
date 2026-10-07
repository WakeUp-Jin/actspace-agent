import type { CordisContext } from "@actspace/cordis-adapter";
import { HarnessHmr, type HarnessHmrOptions } from "./service.js";
export const inject = ["actspace.host.hmr"];
export function apply(ctx: CordisContext): void {
  const options = ctx.get?.("actspace.host.hmr") as HarnessHmrOptions | undefined;
  if (!options) throw new Error("HMR requires Host options");
  const service = new HarnessHmr(options);
  ctx.provide?.("harness.hmr", service);
  ctx.effect?.(() => () => service.close(), "harness.hmr");
}
