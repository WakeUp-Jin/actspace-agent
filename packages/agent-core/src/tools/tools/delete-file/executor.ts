import { lstat, unlink } from "node:fs/promises";
import { relative } from "node:path";
import type { ToolResult, ResultRenderer } from "../../../internal-tools";
import { guardWorkspacePath } from "../../workspace-guard";
import type { ToolExecutorFn } from "../../types";

function workspaceRelativePath(filePath: string, workspaceRoot: string): string {
  return relative(workspaceRoot, filePath) || ".";
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT";
}

export const deleteFileExecutor: ToolExecutorFn = async (
  args,
  workspaceRoot,
): Promise<ToolResult> => {
  const pathArg = typeof args.path === "string" ? args.path : "";

  if (!pathArg) return { success: false, error: "path is required" };

  const guard = guardWorkspacePath(pathArg, workspaceRoot);
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  let stats;
  try {
    stats = await lstat(guard.resolvedPath);
  } catch (error) {
    if (isNotFoundError(error)) {
      return { success: false, error: `File not found: ${pathArg}` };
    }
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Cannot inspect file: ${message}` };
  }

  if (stats.isDirectory()) {
    return {
      success: false,
      error: "delete_file only supports files. Directories are not supported.",
    };
  }

  if (!stats.isFile()) {
    return {
      success: false,
      error: "delete_file only supports regular files.",
    };
  }

  try {
    await unlink(guard.resolvedPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Cannot delete file: ${message}` };
  }

  const relativePath = workspaceRelativePath(guard.resolvedPath, workspaceRoot);
  return {
    success: true,
    data: {
      type: "delete",
      filePath: guard.resolvedPath,
      relativePath,
    },
  };
};

export const renderDeleteResult: ResultRenderer = (result) => {
  if (!result.success) return `Error: ${result.error}`;
  const data = result.data as Record<string, unknown> | undefined;
  const filePath = typeof data?.relativePath === "string"
    ? data.relativePath
    : typeof data?.filePath === "string"
      ? data.filePath
      : "file";
  return `File deleted: ${filePath}`;
};
