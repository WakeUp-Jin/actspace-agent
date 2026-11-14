import type { CordisContext } from "./cordis-types.js";

/** What an observer is told about one mounted Harness plugin entry. */
export interface HarnessMountPluginInfo {
  readonly id: string;
  readonly provides: readonly string[];
  readonly injects: readonly string[];
  readonly optionalInjects: readonly string[];
  /** Caller-defined provenance label (e.g. builtin / user / evolved); the mount layer does not interpret it. */
  readonly origin?: string;
}
export interface HarnessApplyResult {
  readonly ok: boolean;
  readonly error?: unknown;
  readonly ms: number;
}
/** Per-plugin hooks. Every member is optional; an observation with no members is a no-op. */
export interface HarnessPluginObservation {
  /** Receives the plugin's own (already provide-guarded) context; the returned context is what the plugin sees. */
  wrapContext?(ctx: CordisContext): CordisContext;
  onApplyStart?(): void;
  /** Called once per `apply` call, after it returns or its promise settles. */
  onApplyEnd?(result: HarnessApplyResult): void;
}
/** Optional, generic mount observation port. Without one, mounting behaves exactly as before. */
export interface HarnessMountObserver {
  /** Called once per entry while the tree is prepared; `entries` is every entry of this mount. Return undefined to skip it. */
  observePlugin(
    entry: HarnessMountPluginInfo,
    entries: readonly HarnessMountPluginInfo[],
  ): HarnessPluginObservation | undefined;
}
