import { readdir } from "node:fs/promises";
import type { ToolResult } from "../../../internal-tools";
import { guardWorkspacePath } from "../../workspace-guard";
import type { ToolExecutorFn } from "../../types";

export const listDirectoryExecutor: ToolExecutorFn = async (
  args,
  workspaceRoot,
): Promise<ToolResult> => {
  const pathArg = typeof args.path === "string" ? args.path : "";
  if (!pathArg) {
    return { success: false, error: "path is required" };
  }

  const guard = guardWorkspacePath(pathArg, workspaceRoot);
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  try {
    const entries = await readdir(guard.resolvedPath, { withFileTypes: true });
    const lines = entries.map((entry) => {
      const prefix = entry.isDirectory() ? "[dir]  " : "[file] ";
      return `${prefix}${entry.name}`;
    });

    if (lines.length === 0) {
      return { success: true, data: "(empty directory)" };
    }

    return {
      success: true,
      data: lines.join("\n"),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("ENOENT")) {
      return { success: false, error: `Directory not found: ${pathArg}` };
    }
    if (msg.includes("ENOTDIR")) {
      return { success: false, error: `Path is a file, not a directory: ${pathArg}` };
    }
    return { success: false, error: `Failed to list directory: ${msg}` };
  }
};
