import type { InternalTool } from "../../../internal-tools";
import { bashDefinition } from "./definition";
import { bashExecutor } from "./executor";
import { createBashPermissionChecker } from "./permissions";
import { renderBashResult } from "./render-result";

export { bashDefinition } from "./definition";
export { bashExecutor } from "./executor";
export type { BashResult } from "./executor";
export { bashCheckPermissions, createBashPermissionChecker } from "./permissions";
export { renderBashResult } from "./render-result";

export function createBashTool(workspaceRoot: string): InternalTool {
  return {
    ...bashDefinition,
    handler: (args) => bashExecutor(args, workspaceRoot),
    checkPermissions: createBashPermissionChecker(workspaceRoot),
    renderResult: renderBashResult,
  };
}
