import { createSessionProjection } from "./projection.js";
import { SessionProjectionRegistry } from "./registry.js";
import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";
import type { CordisContext } from "@actspace/cordis-adapter";

export type ProjectionContributor = {
  readonly id: string;
  readonly register: (registry: SessionProjectionRegistry, redact: (text: string, limit?: number) => string) => void;
};

export type SessionProjectionService = {
  readonly createSessionProjection: typeof createSessionProjection;
  readonly createRegistry: (accepts?: (event: SessionEventEnvelopeV1) => boolean) => SessionProjectionRegistry;
  readonly registerContributor: (contributor: ProjectionContributor) => () => void;
  readonly applyContributors: (registry: SessionProjectionRegistry, redact: (text: string, limit?: number) => string) => void;
};

export function createSessionProjectionService(): SessionProjectionService {
  const contributors = new Map<string, ProjectionContributor>();
  let sealed = false;
  return Object.freeze({
    createSessionProjection,
    createRegistry: (accepts?: (event: SessionEventEnvelopeV1) => boolean) => new SessionProjectionRegistry(accepts),
    registerContributor: (contributor: ProjectionContributor) => {
      if (sealed) throw new Error("Register projection contributors before restoring sessions.");
      if (contributors.has(contributor.id)) throw new Error(`Duplicate projection contributor ${contributor.id}.`);
      contributors.set(contributor.id, contributor);
      return () => { if (contributors.get(contributor.id) === contributor) contributors.delete(contributor.id); };
    },
    applyContributors: (registry: SessionProjectionRegistry, redact: (text: string, limit?: number) => string) => {
      sealed = true;
      for (const contributor of [...contributors.values()].sort((a, b) => a.id.localeCompare(b.id))) contributor.register(registry, redact);
    },
  });
}

export function apply(ctx: CordisContext): void {
  const service = createSessionProjectionService();
  ctx.provide?.("session.projection", service);
}

export function activate() {
  const service = createSessionProjectionService();
  return {
    services: { "session.projection": service },
    dispose: () => undefined,
  };
}
