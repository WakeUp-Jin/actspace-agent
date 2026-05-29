import type { InternalTool } from "../../../internal-tools";
import { bashDefinition } from "./definition";
import { bashExecutor, type BashExecutorConfig } from "./executor";
import { createBashPermissionChecker } from "./permissions";
import { renderBashResult } from "./render-result";

export { bashDefinition } from "./definition";
export { bashExecutor } from "./executor";
export type { BashResult, BashExecutorConfig } from "./executor";
export { bashCheckPermissions, createBashPermissionChecker } from "./permissions";
export { renderBashResult } from "./render-result";

export function createBashTool(workspaceRoot: string, config: BashExecutorConfig = {}): InternalTool {
  return {
    ...bashDefinition,
    handler: (args) => bashExecutor(args, workspaceRoot, config),
    checkPermissions: createBashPermissionChecker(workspaceRoot),
    renderResult: renderBashResult,
    previewKind: "bash",
  };
}
