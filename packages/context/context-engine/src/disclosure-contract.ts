import { CONTEXT_ACTIVE_PATH_LIMIT, compareContextPaths } from "@actspace/shared";
import type { ContextPathState } from "./types.js";

/** Durable contract shared by the engine state reducer and disclosure plugin. */
export type PathReference = Pick<ContextPathState, "path" | "description" | "history"> & {
  readonly owner: string;
};

export type DisclosureArtifact = {
  readonly artifactId: string;
  readonly mediaType: string;
  readonly size: number;
  readonly sha256: string;
};

export const ACTIVE_PATH_LIMIT = CONTEXT_ACTIVE_PATH_LIMIT;

/** 排序规则的唯一实现在 shared（面板预判也用它）。 */
export function comparePaths(a: ContextPathState, b: ContextPathState): number {
  return compareContextPaths(a, b);
}

export function capNewPaths(paths: readonly ContextPathState[], newIds: ReadonlySet<string>): readonly string[] {
  return paths
    .filter(path => path.visibility === "active" || newIds.has(path.id))
    .sort(comparePaths)
    .slice(0, ACTIVE_PATH_LIMIT)
    .map(path => path.id);
}
