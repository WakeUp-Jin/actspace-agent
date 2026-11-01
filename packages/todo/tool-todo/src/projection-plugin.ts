import type { CordisContext } from "@actspace/cordis-adapter";
import type { SessionProjectionService } from "@actspace/session-projection";
import { todoProjectionContributor } from "./projection.js";

/** Host-owned history projection is registered once, independently of live Harnesses. */
export function apply(ctx: CordisContext): void {
  const projection = ctx.get?.("session.projection") as SessionProjectionService | undefined;
  if (!projection) throw new Error("Todo projection requires session.projection.");
  const unregister = projection.registerContributor(todoProjectionContributor);
  ctx.effect?.(() => unregister, "todo-projection");
}
