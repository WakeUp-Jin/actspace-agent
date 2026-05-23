/**
 * 工具系统统一导出
 *
 * 新架构：ToolManager + definition/executor 分离模式
 * 每个工具是一个文件夹（definition.ts + executor.ts）
 */

// 模块级类型
export type { ToolDefinitionSpec, ToolExecutorFn, ToolManagerConfig } from "./types";

// 核心组件
export { ToolManager } from "./manager";
export { guardWorkspacePath } from "./workspace-guard";
export type { GuardResult } from "./workspace-guard";

// 工具定义
export { readFileDefinition } from "./tools/read-file/definition";
export { searchFilesDefinition } from "./tools/search-files/definition";
export { listDirectoryDefinition } from "./tools/list-directory/definition";
export { editFileDiffDefinition } from "./tools/edit-file-diff/definition";

// 工具执行器
export { readFileExecutor } from "./tools/read-file/executor";
export { searchFilesExecutor } from "./tools/search-files/executor";
export { listDirectoryExecutor } from "./tools/list-directory/executor";
export { editFileDiffExecutor } from "./tools/edit-file-diff/executor";

// ─── 便捷函数 ───

import { ToolManager } from "./manager";
import type { ToolManagerConfig } from "./types";
import { readFileDefinition } from "./tools/read-file/definition";
import { readFileExecutor } from "./tools/read-file/executor";
import { searchFilesDefinition } from "./tools/search-files/definition";
import { searchFilesExecutor } from "./tools/search-files/executor";
import { listDirectoryDefinition } from "./tools/list-directory/definition";
import { listDirectoryExecutor } from "./tools/list-directory/executor";
import { editFileDiffDefinition } from "./tools/edit-file-diff/definition";
import { editFileDiffExecutor } from "./tools/edit-file-diff/executor";

/** 创建预装四个基础工具的 ToolManager */
export function createToolManager(config: ToolManagerConfig): ToolManager {
  const manager = new ToolManager(config);
  manager.registerFromSpec(readFileDefinition, readFileExecutor);
  manager.registerFromSpec(searchFilesDefinition, searchFilesExecutor);
  manager.registerFromSpec(listDirectoryDefinition, listDirectoryExecutor);
  manager.registerFromSpec(editFileDiffDefinition, editFileDiffExecutor);
  return manager;
}
