import type { PermissionChecker } from "../../../internal-tools";
import { guardWorkspacePath } from "../../workspace-guard";

/**
 * Edit-file permission checker.
 *
 * Current policy: allow by default (mainstream Agent products are relaxing
 * approval for file edits). The check_permissions hook is preserved so a
 * future AgentMode ("careful") can switch to `decision: "ask"` without
 * changing the scheduler or executor.
 */
export function createEditPermissionChecker(workspaceRoot: string): PermissionChecker {
  return async (args) => {
    const pathArg = typeof args.path === "string" ? args.path : "";
    if (!pathArg) {
      return { decision: "deny", reason: "path is required" };
    }

    const guard = guardWorkspacePath(pathArg, workspaceRoot);
    if (!guard.ok) {
      return { decision: "deny", reason: guard.error };
    }

    return {
      decision: "allow",
      sanitizedArgs: { ...args, path: guard.resolvedPath },
    };
  };
}
