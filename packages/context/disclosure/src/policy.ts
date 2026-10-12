import type { ContextPathState } from "@actspace/context-engine";
import { ACTIVE_PATH_LIMIT, comparePaths } from "@actspace/context-engine";
export { ACTIVE_PATH_LIMIT, comparePaths };
export function selectActive(paths: readonly ContextPathState[], cycle: number): readonly string[] {
  return paths.filter(path => path.readsInCycle > 0 || path.addedCycle === cycle).sort(comparePaths).slice(0, ACTIVE_PATH_LIMIT).map(path => path.id);
}
export function capNewPaths(paths: readonly ContextPathState[], newIds: ReadonlySet<string>): readonly string[] {
  return paths.filter(path => path.visibility === "active" || newIds.has(path.id)).sort(comparePaths).slice(0, ACTIVE_PATH_LIMIT).map(path => path.id);
}
