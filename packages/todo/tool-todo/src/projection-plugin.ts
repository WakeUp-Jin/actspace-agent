import { getService, type CordisContext } from "@actspace/cordis-adapter";
import { SESSION_PROJECTION_SERVICE } from "@actspace/session-projection";
import { todoProjectionContributor } from "./projection.js";

/** Host-owned history projection is registered once, independently of live Harnesses. */
export function apply(ctx: CordisContext): void {
  const projection = getService(ctx, SESSION_PROJECTION_SERVICE);
  if (!projection) throw new Error("Todo projection requires session.projection.");
  const unregister = projection.registerContributor(todoProjectionContributor);
  ctx.effect?.(() => unregister, "todo-projection");
}
