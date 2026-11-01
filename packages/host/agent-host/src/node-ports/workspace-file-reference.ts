import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { normalizeWorkspaceRelativePath } from "@actspace/shared";

export type WorkspaceFileReferenceResolution =
  | { ok: true }
  | { ok: false; code: "file_not_found" | "file_outside_workspace" | "not_a_file" };

function isInside(root: string, target: string): boolean {
  const pathFromRoot = relative(root, target);
  return pathFromRoot === "" || (pathFromRoot !== ".." && !pathFromRoot.startsWith(`..${sep}`) && !isAbsolute(pathFromRoot));
}

/**
 * 确认 `@` 引用的相对路径在 session workspace 内确实是一个普通文件。
 * 先做字面检查，再比对 realpath，挡住指向 workspace 外的符号链接；不读文件内容。
 */
export async function resolveWorkspaceFileReference(workspaceRoot: string, relativePath: string): Promise<WorkspaceFileReferenceResolution> {
  const normalized = normalizeWorkspaceRelativePath(relativePath);
  if (!normalized) return { ok: false, code: "file_outside_workspace" };
  const root = resolve(workspaceRoot);
  const requested = resolve(root, ...normalized.split("/"));
  if (!isInside(root, requested)) return { ok: false, code: "file_outside_workspace" };

  let realRoot: string;
  let realTarget: string;
  try {
    [realRoot, realTarget] = await Promise.all([realpath(root), realpath(requested)]);
  } catch {
    return { ok: false, code: "file_not_found" };
  }
  if (!isInside(realRoot, realTarget)) return { ok: false, code: "file_outside_workspace" };
  try {
    return (await stat(realTarget)).isFile() ? { ok: true } : { ok: false, code: "not_a_file" };
  } catch {
    return { ok: false, code: "file_not_found" };
  }
}
