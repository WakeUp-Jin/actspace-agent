import type { InternalTool } from "../../../internal-tools";
import { deleteFileDefinition } from "./definition";
import { deleteFileExecutor, renderDeleteResult } from "./executor";
import { createDeleteFilePermissionChecker } from "./permissions";

export { deleteFileDefinition } from "./definition";
export { deleteFileExecutor, renderDeleteResult } from "./executor";
export { createDeleteFilePermissionChecker } from "./permissions";

export function createDeleteFileTool(workspaceRoot: string): InternalTool {
  return {
    ...deleteFileDefinition,
    handler: (args) => deleteFileExecutor(args, workspaceRoot),
    checkPermissions: createDeleteFilePermissionChecker(workspaceRoot),
    renderResult: renderDeleteResult,
    previewKind: "delete",
  };
}
