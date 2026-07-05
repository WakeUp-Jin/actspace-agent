import type { PermissionChecker } from "../../../internal-tools";
import { createWriteBoundaryChecker } from "../edit-file-diff/permissions";

/**
 * Write-file permission checker.
 *
 * 与 edit_file 共用越界审批逻辑：workspace 内直接放行，
 * 越界改为 `ask` 请求用户审批（不再硬拒绝），见 createWriteBoundaryChecker。
 */
export function createWritePermissionChecker(
  workspaceRoot: string,
  additionalWritableRoots: string[] = [],
): PermissionChecker {
  return createWriteBoundaryChecker("Write", workspaceRoot, additionalWritableRoots);
}
