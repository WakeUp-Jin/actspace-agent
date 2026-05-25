/**
 * 工具系统统一导出
 *
 * 新架构：ToolManager + definition/executor 分离模式
 * 每个工具是一个文件夹（definition.ts + executor.ts）
 */

// 模块级类型
export type {
  ToolDefinitionSpec,
  ToolExecutorFn,
  ToolManagerConfig,
  ToolRuntimeConfig,
} from "./types";

// 核心组件
export { ToolManager } from "./manager";
export {
  ToolScheduler,
  type ToolApprovalDecision,
  type ToolApprovalDecisionKind,
  type ToolApprovalRequest,
  type ToolCallRecord,
  type ToolCallStatus,
  type ToolSchedulerConfig,
  type ToolSchedulerExecution,
} from "./scheduler";
export { guardWorkspacePath } from "./workspace-guard";
export type { GuardResult } from "./workspace-guard";
export { shouldExposeTool } from "./exposure";

// 工具定义
export { readFileDefinition } from "./tools/read-file/definition";
export { searchFilesDefinition } from "./tools/search-files/definition";
export { grepDefinition } from "./tools/grep/definition";
export { globDefinition } from "./tools/glob/definition";
export { listDirectoryDefinition } from "./tools/list-directory/definition";
export { editFileDiffDefinition } from "./tools/edit-file-diff/definition";
export { bashDefinition } from "./tools/bash/definition";
export { webSearchDefinition } from "./tools/web-search/definition";
export { analyzeMediaDefinition } from "./tools/analyze-media/definition";

// 工具执行器
export { readFileExecutor } from "./tools/read-file/executor";
export { searchFilesExecutor } from "./tools/search-files/executor";
export { grepExecutor } from "./tools/grep/executor";
export { globExecutor } from "./tools/glob/executor";
export { listDirectoryExecutor } from "./tools/list-directory/executor";
export { editFileDiffExecutor } from "./tools/edit-file-diff/executor";
export { bashExecutor } from "./tools/bash/executor";
export type { BashResult } from "./tools/bash/executor";
export {
  bashCheckPermissions,
  createBashPermissionChecker,
  createBashTool,
  renderBashResult,
} from "./tools/bash";
export { webSearchExecutor } from "./tools/web-search/executor";
export { analyzeMediaExecutor } from "./tools/analyze-media/executor";

// ─── 便捷函数 ───

import { ToolManager } from "./manager";
import type { ToolManagerConfig } from "./types";
import { readFileDefinition } from "./tools/read-file/definition";
import { readFileExecutor } from "./tools/read-file/executor";
import { grepDefinition } from "./tools/grep/definition";
import { grepExecutor } from "./tools/grep/executor";
import { globDefinition } from "./tools/glob/definition";
import { globExecutor } from "./tools/glob/executor";
import { listDirectoryDefinition } from "./tools/list-directory/definition";
import { listDirectoryExecutor } from "./tools/list-directory/executor";
import { editFileDiffDefinition } from "./tools/edit-file-diff/definition";
import { editFileDiffExecutor } from "./tools/edit-file-diff/executor";
import { createBashTool } from "./tools/bash";
import { webSearchDefinition } from "./tools/web-search/definition";
import { webSearchExecutor } from "./tools/web-search/executor";
import { analyzeMediaDefinition } from "./tools/analyze-media/definition";
import { analyzeMediaExecutor } from "./tools/analyze-media/executor";
import { shouldExposeTool } from "./exposure";

/** 创建预装基础工具的 ToolManager */
export function createToolManager(config: ToolManagerConfig): ToolManager {
  const manager = new ToolManager(config);
  const runtime = {
    primaryProvider: config.primaryProvider,
    hasKimiKey: config.hasKimiKey,
  };
  const disabledTools = new Set(config.disabledTools ?? []);
  const entries = [
    [readFileDefinition, readFileExecutor],
    [grepDefinition, grepExecutor],
    [globDefinition, globExecutor],
    [listDirectoryDefinition, listDirectoryExecutor],
    [editFileDiffDefinition, editFileDiffExecutor],
    [webSearchDefinition, webSearchExecutor],
    [analyzeMediaDefinition, analyzeMediaExecutor],
  ] as const;

  for (const [definition, executor] of entries) {
    if (!disabledTools.has(definition.name) && shouldExposeTool(definition, runtime)) {
      manager.registerFromSpec(definition, executor);
    }
  }

  if (!disabledTools.has("bash")) {
    manager.register(createBashTool(config.workspaceRoot));
  }

  return manager;
}
