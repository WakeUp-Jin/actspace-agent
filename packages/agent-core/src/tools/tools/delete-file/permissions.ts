import type { PermissionChecker } from "../../../internal-tools";
import { guardWorkspacePath } from "../../workspace-guard";

function displayFileName(path: string): string {
  const normalized = path.replace(/[\\/]+$/, "");
  return normalized.split(/[\\/]+/).filter(Boolean).pop() ?? normalized ?? path;
}

export function createDeleteFilePermissionChecker(workspaceRoot: string): PermissionChecker {
  return async (args) => {
    const pathArg = typeof args.path === "string" ? args.path : "";
    if (!pathArg) {
      return { decision: "deny", reason: "path is required" };
    }

    const guard = guardWorkspacePath(pathArg, workspaceRoot);
    if (!guard.ok) {
      return { decision: "deny", reason: guard.error };
    }

    const fileName = displayFileName(pathArg);
    return {
      decision: "ask",
      reason: "delete_file is a destructive file operation and requires approval.",
      summary: `Delete ${fileName}`,
      riskLevel: "high",
      allowSimilar: false,
      sanitizedArgs: { ...args, path: guard.resolvedPath },
    };
  };
}
