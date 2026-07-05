import type { PermissionChecker } from "../../../internal-tools";
import { APPROVED_OUTSIDE_BOUNDARY_ARG, guardWritablePath } from "../../workspace-guard";

function displayFileName(path: string): string {
  const normalized = path.replace(/[\\/]+$/, "");
  return normalized.split(/[\\/]+/).filter(Boolean).pop() ?? normalized ?? path;
}

/**
 * Edit-file permission checker.
 *
 * - 目标在 workspace（含 additionalWritableRoots）内：直接放行。
 * - 目标越界：不再硬拒绝，改为 `ask` 请求用户审批（对齐 Cursor 的行为）。
 *   审批通过后 scheduler 用 sanitizedArgs 执行，executor 依据
 *   APPROVED_OUTSIDE_BOUNDARY_ARG 标记放行越界路径。
 *
 * 两个分支都会覆盖该标记，模型自行传入无效。
 */
export function createEditPermissionChecker(
  workspaceRoot: string,
  additionalWritableRoots: string[] = [],
): PermissionChecker {
  return createWriteBoundaryChecker("Edit", workspaceRoot, additionalWritableRoots);
}

/** edit/write 共用的越界审批检查器；actionLabel 只影响审批摘要文案。 */
export function createWriteBoundaryChecker(
  actionLabel: "Edit" | "Write",
  workspaceRoot: string,
  additionalWritableRoots: string[] = [],
): PermissionChecker {
  return async (args) => {
    const pathArg = typeof args.path === "string" ? args.path : "";
    if (!pathArg) {
      return { decision: "deny", reason: "path is required" };
    }

    // 无论走哪个分支都先剥掉模型可能自行传入的越界标记，标记只能由本检查器写入。
    const { [APPROVED_OUTSIDE_BOUNDARY_ARG]: _modelSupplied, ...cleanArgs } = args;

    const guard = guardWritablePath(pathArg, workspaceRoot, additionalWritableRoots);
    if (guard.ok) {
      return {
        decision: "allow",
        sanitizedArgs: { ...cleanArgs, path: guard.resolvedPath },
      };
    }

    return {
      decision: "ask",
      reason: `Target path is outside the workspace: ${guard.resolvedPath}`,
      summary: `${actionLabel} ${displayFileName(guard.resolvedPath)} (outside workspace)`,
      riskLevel: "medium",
      allowSimilar: false,
      sanitizedArgs: { ...cleanArgs, path: guard.resolvedPath, [APPROVED_OUTSIDE_BOUNDARY_ARG]: true },
    };
  };
}
