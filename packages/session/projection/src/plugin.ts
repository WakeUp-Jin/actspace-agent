import { createSessionProjection } from "./projection.js";
import type { CordisContext } from "@actspace/cordis-adapter";

export function apply(ctx: CordisContext): void {
  ctx.provide?.("session.projection", Object.freeze({ createSessionProjection }));
}

export function activate() {
  return {
    services: { "session.projection": Object.freeze({ createSessionProjection }) },
    dispose: () => undefined,
  };
}
