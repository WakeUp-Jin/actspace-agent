import type { ContextPathState } from "@actspace/context-engine";
import { ACTIVE_PATH_LIMIT, comparePaths } from "@actspace/context-engine";
import { selectNextActivePathIds } from "@actspace/shared";
export { ACTIVE_PATH_LIMIT, comparePaths };
/** 规则与面板 `nextCompaction` 预判共用 shared 的同一实现。 */
export function selectActive(paths: readonly ContextPathState[], cycle: number): readonly string[] {
  return selectNextActivePathIds(paths, cycle);
}
export function capNewPaths(paths: readonly ContextPathState[], newIds: ReadonlySet<string>): readonly string[] {
  return paths.filter(path => path.visibility === "active" || newIds.has(path.id)).sort(comparePaths).slice(0, ACTIVE_PATH_LIMIT).map(path => path.id);
}
