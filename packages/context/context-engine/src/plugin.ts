import { describeContextContent } from "./content-manifest.js";
import { ContextCompactionCoordinator } from "./compaction.js";
import { ContextEngine, type ContextEngineOptions } from "./engine.js";
import { ContextInstanceRegistry } from "./instances.js";
import { ContextReducerRegistry } from "./reducers.js";
import { projectContext } from "./projection.js";
import type { ContextProjection } from "./types.js";
import type { CordisContext } from "@actspace/cordis-adapter";

export type ContextProjectionService = {
  readonly getProjection: (sessionId: string, logicalAgentScopeId?: string, basis?: ContextProjection["basis"]) => ContextProjection | undefined;
};

export function apply(ctx: CordisContext): void {
  const instances = new ContextInstanceRegistry();
  const reducers = new ContextReducerRegistry();
  ctx.provide?.("context.engine", Object.freeze({
    compaction: new ContextCompactionCoordinator(),
    instances,
    reducers,
    getProjection: (sessionId: string, logicalAgentScopeId = "main", basis: ContextProjection["basis"] = "current-context") => {
      const instance = instances.get(sessionId, logicalAgentScopeId);
      return instance === undefined ? undefined : projectContext(instance.view, basis);
    },
    readEntry: (sessionId: string, logicalAgentScopeId: string, key: string, revision: number, generation: string) => {
      const instance = instances.get(sessionId, logicalAgentScopeId);
      if (!instance || instance.revision !== revision || instance.view.status.instanceGeneration !== generation) throw new Error("Context revision stale; reload the panel.");
      return describeContextContent(instance.view).text.get(key) ?? null;
    },
    create: (options: ContextEngineOptions) => new ContextEngine({ ...options, instances: options.instances ?? instances, reducers: options.reducers ?? reducers }),
  }));
}
