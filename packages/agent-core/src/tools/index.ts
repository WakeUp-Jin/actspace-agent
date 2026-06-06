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
  type ApprovalGate,
  type ToolApprovalDecision,
  type ToolApprovalDecisionKind,
  type ToolApprovalRequest,
  type ToolCallRecord,
  type ToolCallStatus,
  type ToolSchedulerConfig,
  type ToolSchedulerExecution,
} from "./scheduler";
export { guardWorkspacePath, guardWritablePath, resolveReadablePath, displayReadablePath } from "./workspace-guard";
export type { GuardResult } from "./workspace-guard";
export { shouldExposeTool } from "./exposure";
export { cleanupOldToolOutputs } from "./cleanup-tool-outputs";
export {
  TOOL_OUTPUT_DIRNAME,
  toolOutputDir,
  buildToolOutputPath,
  createToolOutputId,
} from "./tool-output-paths";

// 工具定义
export { readFileDefinition } from "./tools/read-file/definition";
export { grepDefinition } from "./tools/grep/definition";
export { globDefinition } from "./tools/glob/definition";
export { listDirectoryDefinition } from "./tools/list-directory/definition";
export { editFileDiffDefinition } from "./tools/edit-file-diff/definition";
export { writeFileDefinition } from "./tools/write-file/definition";
export { deleteFileDefinition } from "./tools/delete-file/definition";
export { bashDefinition } from "./tools/bash/definition";
export { webSearchDefinition } from "./tools/web-search/definition";
export { analyzeMediaDefinition } from "./tools/analyze-media/definition";
export { agentDefinition, exploreDefinition } from "./tools/agent/definition";

// 工具执行器
export { readFileExecutor } from "./tools/read-file/executor";
export { grepExecutor } from "./tools/grep/executor";
export { globExecutor } from "./tools/glob/executor";
export { listDirectoryExecutor } from "./tools/list-directory/executor";
export { editFileDiffExecutor, renderEditResult } from "./tools/edit-file-diff/executor";
export { writeFileExecutor, renderWriteResult } from "./tools/write-file/executor";
export { deleteFileExecutor, renderDeleteResult } from "./tools/delete-file/executor";
export { bashExecutor } from "./tools/bash/executor";
export type { BashResult } from "./tools/bash/executor";
export {
  createDeleteFilePermissionChecker,
  createDeleteFileTool,
} from "./tools/delete-file";
export {
  bashCheckPermissions,
  createBashPermissionChecker,
  createBashTool,
  renderBashResult,
} from "./tools/bash";
export { webSearchExecutor } from "./tools/web-search/executor";
export { analyzeMediaExecutor } from "./tools/analyze-media/executor";
export {
  createAgentTool,
  createExploreTool,
  type CreateAgentToolOptions,
  type CreateExploreToolOptions,
} from "./tools/agent";
export type { AgentToolInput, AgentToolOutput, SubAgentEventSink } from "./tools/agent/runner";

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
import { editFileDiffExecutor, renderEditResult } from "./tools/edit-file-diff/executor";
import { writeFileDefinition } from "./tools/write-file/definition";
import { writeFileExecutor, renderWriteResult } from "./tools/write-file/executor";
import { createDeleteFileTool } from "./tools/delete-file";
import { createBashTool } from "./tools/bash";
import { webSearchDefinition } from "./tools/web-search/definition";
import { webSearchExecutor } from "./tools/web-search/executor";
import { analyzeMediaDefinition } from "./tools/analyze-media/definition";
import { analyzeMediaExecutor } from "./tools/analyze-media/executor";
import { createAgentTool, createExploreTool } from "./tools/agent";
import { shouldExposeTool } from "./exposure";

/** 创建预装基础工具的 ToolManager */
export function createToolManager(config: ToolManagerConfig): ToolManager {
  const manager = new ToolManager(config);
  const runtime = {
    primaryProvider: config.primaryProvider,
    apiFormat: config.apiFormat,
    hasKimiKey: config.hasKimiKey,
  };
  const disabledTools = new Set(config.disabledTools ?? []);
  const entries: ReadonlyArray<
    readonly [import("./types").ToolDefinitionSpec, import("./types").ToolExecutorFn, import("../internal-tools").ResultRenderer?]
  > = [
    [readFileDefinition, readFileExecutor],
    [grepDefinition, grepExecutor],
    [globDefinition, globExecutor],
    [listDirectoryDefinition, listDirectoryExecutor],
    [editFileDiffDefinition, editFileDiffExecutor, renderEditResult],
    [writeFileDefinition, writeFileExecutor, renderWriteResult],
    [webSearchDefinition, webSearchExecutor],
    [analyzeMediaDefinition, analyzeMediaExecutor],
  ];

  for (const [definition, executor, renderResult] of entries) {
    if (!disabledTools.has(definition.name) && shouldExposeTool(definition, runtime)) {
      manager.registerFromSpec(definition, executor, renderResult);
    }
  }

  if (!disabledTools.has("delete_file")) {
    manager.register(createDeleteFileTool(config.workspaceRoot));
  }

  if (!disabledTools.has("bash")) {
    manager.register(
      createBashTool(config.workspaceRoot, {
        tmpRoot: config.tmpRoot,
        sessionId: config.sessionId,
        inlineThreshold: config.bashInlineThreshold,
        diskCap: config.bashDiskCap,
      }),
    );
  }

  if (!disabledTools.has("agent") && config.llm) {
    manager.register(
      createAgentTool({
        llm: config.llm,
        workspaceRoot: config.workspaceRoot,
        sessionId: config.sessionId,
        turnId: config.turnId,
        contextWindow: config.contextWindow,
      }),
    );
  }

  const exploreLlm = config.exploreLlm ?? config.llm;
  if (!disabledTools.has("explore") && exploreLlm) {
    manager.register(
      createExploreTool({
        llm: exploreLlm,
        workspaceRoot: config.workspaceRoot,
        sessionId: config.sessionId,
        turnId: config.turnId,
        contextWindow: config.contextWindow,
      }),
    );
  }

  return manager;
}
