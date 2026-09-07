import { createSessionProjection } from "./projection.js";
import { SessionProjectionRegistry } from "./registry.js";
import type { CordisContext } from "@actspace/cordis-adapter";

export type SessionProjectionService = {
  readonly createSessionProjection: typeof createSessionProjection;
  readonly createRegistry: () => SessionProjectionRegistry;
};

const service: SessionProjectionService = Object.freeze({
  createSessionProjection,
  createRegistry: () => new SessionProjectionRegistry(),
});

export function apply(ctx: CordisContext): void {
  ctx.provide?.("session.projection", service);
}

export function activate() {
  return {
    services: { "session.projection": service },
    dispose: () => undefined,
  };
}
