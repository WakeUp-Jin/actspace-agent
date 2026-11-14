export { manifest } from "./manifest.js";
export { apply, CONTEXT_ENGINE_SERVICE, type ContextEngineService, type ContextProjectionService } from "./plugin.js";
export * from "./assembly.js";
export * from "./types.js";
export * from "./instances.js";
export * from "./reducers.js";
export * from "./projection.js";
export * from "./modules.js";
export * from "./engine.js";
export { surfaceMessage } from "./conversion.js";
export * from "./request-snapshot.js";
export * from "./system.js";
export * from "./registry.js";
export * from "./supplements.js";
export * from "./compaction.js";
export * from "./disclosure-contract.js";

export * from "./content-manifest.js";


export { contextEvents, latestContextEvent } from "./supplements.js";
/** 会话源等不直接依赖日志包的插件，用它给对话算缓存 key（agent-spec-context-trusted-surface.md §3.4）。 */
export { surfaceViewVersion, isTrustedSurfaceView, type TrustedSurfaceView } from "@actspace/session-journal";
