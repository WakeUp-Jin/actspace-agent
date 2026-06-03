/**
 * Workspace 路径边界检查
 *
 * 写类工具（write_file / edit_file / bash）的文件/目录操作必须经过 guardWorkspacePath：
 * - 路径必须在 workspaceRoot 下
 * - 禁止 .. 逃逸
 * - 禁止 symlink 逃逸（V1 增加 realpath 检查）
 *
 * 读类工具（read_file / grep / glob / list_directory）改用 resolveReadablePath：
 * 只解析路径、不做越界检查——这样模型才能回读 Agent 内部产物（bash 落盘文件在
 * <userData>/tmp、session.jsonl 在 <userData>/sessions，都在 workspace 之外）。
 * 安全取舍与后续 blocklist/读审核见 docs/SECURITY.md「读边界放开」。
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

/**
 * 写类工具的路径解析：默认只允许 workspaceRoot；调用方可显式传入额外
 * 可写根，例如主 Agent 的 Kairos inbox handoff 目录。
 */
export function guardWritablePath(
  inputPath: string,
  workspaceRoot: string,
  additionalWritableRoots: string[] = [],
): GuardResult {
  if (!inputPath || inputPath.trim() === "") {
    return { ok: false, resolvedPath: "", error: "Path is empty" };
  }

  const workspaceGuard = guardWorkspacePath(inputPath, workspaceRoot);
  if (workspaceGuard.ok) return workspaceGuard;

  if (isAbsolute(inputPath)) {
    for (const root of additionalWritableRoots.filter((root) => root.trim() !== "")) {
      const guard = guardWorkspacePath(inputPath, root);
      if (guard.ok) return guard;
    }
  }

  const absolutePath = isAbsolute(inputPath)
    ? resolve(inputPath)
    : resolve(workspaceRoot, inputPath);

  return {
    ok: false,
    resolvedPath: absolutePath,
    error: `Path escapes writable boundary: ${inputPath}`,
  };
}

/**
 * 读类工具的路径解析：相对路径基于 workspaceRoot，绝对路径原样保留，
 * **不做越界检查**。仅在路径为空时报错。
 *
 * 放开读边界后模型理论上可读任意本机文件——这是本期明确接受的取舍，
 * 后续应补「敏感路径 blocklist + 按需读审核」收口（见 docs/SECURITY.md）。
 */
export function resolveReadablePath(
  inputPath: string,
  workspaceRoot: string,
): GuardResult {
  if (!inputPath || inputPath.trim() === "") {
    return { ok: false, resolvedPath: "", error: "Path is empty" };
  }

  const absolutePath = isAbsolute(inputPath)
    ? resolve(inputPath)
    : resolve(workspaceRoot, inputPath);

  return { ok: true, resolvedPath: absolutePath };
}

/**
 * 给读类工具展示用：路径在 workspace 内则返回相对路径，否则返回绝对路径。
 * 避免对 workspace 外文件展示一长串 `../../..`。
 */
export function displayReadablePath(absolutePath: string, workspaceRoot: string): string {
  const rel = relative(workspaceRoot, absolutePath);
  return rel.startsWith("..") || isAbsolute(rel) ? absolutePath : rel;
}
