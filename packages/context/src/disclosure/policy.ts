import type { ContextPathState } from "../types.js";
export const ACTIVE_PATH_LIMIT = 100;
export function comparePaths(a: ContextPathState, b: ContextPathState): number {
  return b.readsInCycle - a.readsInCycle || (b.lastReadAt ?? "").localeCompare(a.lastReadAt ?? "") || b.addedCycle - a.addedCycle || a.id.localeCompare(b.id);
}
export function selectActive(paths: readonly ContextPathState[], cycle: number): readonly string[] {
  return paths.filter(path => path.readsInCycle > 0 || path.addedCycle === cycle).sort(comparePaths).slice(0, ACTIVE_PATH_LIMIT).map(path => path.id);
}
export function capNewPaths(paths: readonly ContextPathState[], newIds: ReadonlySet<string>): readonly string[] {
  return paths.filter(path => path.visibility === "active" || newIds.has(path.id)).sort(comparePaths).slice(0, ACTIVE_PATH_LIMIT).map(path => path.id);
}
