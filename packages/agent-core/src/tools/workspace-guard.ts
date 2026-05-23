/**
 * Workspace 路径边界检查
 *
 * 所有工具的文件/目录操作必须经过此守卫：
 * - 路径必须在 workspaceRoot 下
 * - 禁止 .. 逃逸
 * - 禁止 symlink 逃逸（V1 增加 realpath 检查）
 */

import { resolve, relative, isAbsolute } from "node:path";

export interface GuardResult {
  ok: boolean;
  resolvedPath: string;
  error?: string;
}

export function guardWorkspacePath(
  inputPath: string,
  workspaceRoot: string,
): GuardResult {
  if (!inputPath || inputPath.trim() === "") {
    return { ok: false, resolvedPath: "", error: "Path is empty" };
  }

  const absolutePath = isAbsolute(inputPath)
    ? resolve(inputPath)
    : resolve(workspaceRoot, inputPath);

  const rel = relative(workspaceRoot, absolutePath);

  if (rel.startsWith("..") || isAbsolute(rel)) {
    return {
      ok: false,
      resolvedPath: absolutePath,
      error: `Path escapes workspace boundary: ${inputPath}`,
    };
  }

  return { ok: true, resolvedPath: absolutePath };
}
