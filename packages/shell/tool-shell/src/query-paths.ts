import { realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { isPathWithin, classifyFileResource } from "@actspace/tool-runtime";

/**
 * Fail closed when a query target cannot be resolved. No filesystem isolation is implied.
 * The directory must be in the workspace; each path may also be inside one of `extraRoots` (the Host scratch directory, for scripts).
 */
export async function queryPathsWithinWorkspace(analysis: { readonly directory?: string; readonly queryPaths?: readonly string[] }, cwd: string, workspace: string, extraRoots: readonly string[] = []): Promise<boolean> {
  if (analysis.queryPaths === undefined && analysis.directory === undefined) return true;
  try {
    const effective = await realpath(resolve(cwd, analysis.directory ?? "."));
    if (!isPathWithin(workspace, effective)) return false;
    for (const path of analysis.queryPaths ?? []) {
      const canonicalPath = await realpath(resolve(effective, path));
      if (!isPathWithin(workspace, canonicalPath) && !extraRoots.some(root => isPathWithin(root, canonicalPath))) return false;
      if (classifyFileResource({ kind: "file", access: "read", canonicalPath, targetKind: "file" }).kind !== "normal") return false;
    }
    return true;
  } catch { return false; }
}
