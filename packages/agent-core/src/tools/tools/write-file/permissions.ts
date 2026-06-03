import type { PermissionChecker } from "../../../internal-tools";
import { guardWritablePath } from "../../workspace-guard";

/**
 * Write-file permission checker.
 *
 * Current policy: allow by default. The hook is preserved so a future
 * AgentMode ("careful") can switch to `decision: "ask"` without touching
 * the scheduler or executor.
 */
export function createWritePermissionChecker(
  workspaceRoot: string,
  additionalWritableRoots: string[] = [],
): PermissionChecker {
  return async (args) => {
    const pathArg = typeof args.path === "string" ? args.path : "";
    if (!pathArg) {
      return { decision: "deny", reason: "path is required" };
    }

    const guard = guardWritablePath(pathArg, workspaceRoot, additionalWritableRoots);
    if (!guard.ok) {
      return { decision: "deny", reason: guard.error };
    }

    return {
      decision: "allow",
      sanitizedArgs: { ...args, path: guard.resolvedPath },
    };
  };
}
