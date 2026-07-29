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
  ToolProfile,
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
export {
  createApprovalGateForPermissionMode,
  type PermissionMode,
} from "./permission-mode";
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
export { webFetchDefinition } from "./tools/web-fetch/definition";
export { generateImageDefinition } from "./tools/generate-image/definition";
export { agentDefinition, exploreDefinition } from "./tools/agent/definition";
export {
  browserDefinitions,
  browserCuaDefinition,
  browserDomDefinition,
  browserLocatorDefinition,
  browserNavigationDefinition,
  browserTabsDefinition,
  browserUserDefinition,
  browserWaitDefinition,
  browserIoDefinition,
  browserDebugDefinition,
  browserHelpDefinition,
  browserRunDefinition,
} from "./tools/browser/definition";

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
  createBrowserToolExecutors,
  type BrowserToolExecutors,
} from "./tools/browser/executor";
export {
  createDeleteFilePermissionChecker,
  createDeleteFileTool,
} from "./tools/delete-file";
export {
  bashCheckPermissions,
  createBashPermissionChecker,
  createBashTool,
  renderBashResult,
  bashOutputTool,
  bashKillTool,
  bashTaskRegistry,
  DEFAULT_BASH_MAX_RUNTIME_MS,
  DEFAULT_MAX_BACKGROUND_TASKS_PER_SESSION,
  formatTaskNotification,
} from "./tools/bash";
export type {
  BashTask,
  BashTaskNotification,
  BashTaskStatus,
  BashBackgroundedResult,
  BashExecutorConfig,
} from "./tools/bash";
export { webSearchExecutor } from "./tools/web-search/executor";
export { webFetchExecutor } from "./tools/web-fetch/executor";
export { generateImageExecutor } from "./tools/generate-image/executor";
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
import { createEditPermissionChecker } from "./tools/edit-file-diff/permissions";
import { writeFileDefinition } from "./tools/write-file/definition";
import { writeFileExecutor, renderWriteResult } from "./tools/write-file/executor";
import { createWritePermissionChecker } from "./tools/write-file/permissions";
import { createDeleteFileTool } from "./tools/delete-file";
import { createBashTool, bashOutputTool, bashKillTool } from "./tools/bash";
import { webSearchDefinition } from "./tools/web-search/definition";
import { webSearchExecutor } from "./tools/web-search/executor";
import { webFetchDefinition } from "./tools/web-fetch/definition";
import { webFetchExecutor } from "./tools/web-fetch/executor";
import { generateImageDefinition } from "./tools/generate-image/definition";
import { generateImageExecutor } from "./tools/generate-image/executor";
import { createAgentTool, createExploreTool } from "./tools/agent";
import {
  browserDefinitions,
} from "./tools/browser/definition";
import { createBrowserToolExecutors } from "./tools/browser/executor";
import {
  createBrowserActionPermissionChecker,
  createBrowserRunPermissionChecker,
} from "./tools/browser/permissions";
import { browserLegacyAliases } from "./tools/browser/generated-actions";
import { shouldExposeTool } from "./exposure";

/** 创建预装基础工具的 ToolManager */
export function createToolManager(config: ToolManagerConfig): ToolManager {
  const manager = new ToolManager(config);
  const toolProfile = config.toolProfile ?? "full";
  if (toolProfile === "none") return manager;
  const runtime = {
    primaryProvider: config.primaryProvider,
    apiFormat: config.apiFormat,
    hasKimiKey: config.hasKimiKey,
    hasWebSearchKey: config.hasWebSearchKey,
    hasImageGenerationKey: config.hasImageGenerationKey,
  };
  const disabledTools = new Set(config.disabledTools ?? []);
  const entries: ReadonlyArray<
    readonly [
      import("./types").ToolDefinitionSpec,
      import("./types").ToolExecutorFn,
      import("../internal-tools").ResultRenderer?,
      import("../internal-tools").PermissionChecker?,
    ]
  > = [
    [readFileDefinition, readFileExecutor],
    [grepDefinition, grepExecutor],
    [globDefinition, globExecutor],
    [listDirectoryDefinition, listDirectoryExecutor],
    // edit/write：workspace 内直接放行，越界走 ask 审批（见 permissions.ts）
    [
      editFileDiffDefinition,
      editFileDiffExecutor,
      renderEditResult,
      createEditPermissionChecker(config.workspaceRoot, config.additionalWritableRoots),
    ],
    [
      writeFileDefinition,
      writeFileExecutor,
      renderWriteResult,
      createWritePermissionChecker(config.workspaceRoot, config.additionalWritableRoots),
    ],
    [webSearchDefinition, webSearchExecutor],
    [webFetchDefinition, webFetchExecutor],
    [generateImageDefinition, generateImageExecutor],
  ];

  for (const [definition, executor, renderResult, checkPermissions] of entries) {
    if (isToolAllowedByProfile(definition.name, toolProfile) && !disabledTools.has(definition.name) && shouldExposeTool(definition, runtime)) {
      manager.registerFromSpec(definition, executor, renderResult, checkPermissions);
    }
  }

  const browserGroupDisabled = disabledTools.has("browser") || disabledTools.has("browser_help");
  if (toolProfile === "full" && config.browserBridgeSocketPath && !browserGroupDisabled) {
    const browserExecutors = createBrowserToolExecutors({
      socketPath: config.browserBridgeSocketPath,
      sessionId: config.sessionId ?? `session-${process.pid}`,
      turnId: config.turnId ?? `turn-${Date.now()}`,
    });
    for (const definition of browserDefinitions) {
      if (isBrowserToolDisabled(definition.name, disabledTools)) continue;
      const executor = browserExecutors.executors[definition.name];
      if (!executor) continue;
      const category = definition.name.replace(/^browser_/, "");
      const checkPermissions = definition.name === "browser_help"
        ? undefined
        : definition.name === "browser_run"
          ? createBrowserRunPermissionChecker(browserExecutors.preflight, disabledTools)
          : createBrowserActionPermissionChecker(category, disabledTools);
      manager.registerFromSpec(definition, executor, undefined, checkPermissions);
    }
    manager.registerDisposer(browserExecutors.dispose);
  }

  if (toolProfile === "full" && !disabledTools.has("delete_file")) {
    manager.register(createDeleteFileTool(config.workspaceRoot));
  }

  if (toolProfile === "full" && !disabledTools.has("bash")) {
    manager.register(
      createBashTool(config.workspaceRoot, {
        tmpRoot: config.tmpRoot,
        sessionId: config.sessionId,
        inlineThreshold: config.bashInlineThreshold,
        diskCap: config.bashDiskCap,
      }),
    );
    // 后台任务配套工具与 bash 同进退
    manager.register(bashOutputTool);
    manager.register(bashKillTool);
  }

  if (toolProfile === "full" && !disabledTools.has("agent") && config.llm) {
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
  if (toolProfile === "full" && !disabledTools.has("explore") && exploreLlm) {
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

const READ_ONLY_TOOL_NAMES = new Set([
  "read_file",
  "grep",
  "glob",
  "list_directory",
  "web_search",
  "web_fetch",
]);

function isToolAllowedByProfile(name: string, profile: NonNullable<ToolManagerConfig["toolProfile"]>): boolean {
  return profile === "full" || (profile === "read-only" && READ_ONLY_TOOL_NAMES.has(name));
}

function isBrowserToolDisabled(name: string, disabledTools: ReadonlySet<string>): boolean {
  if (disabledTools.has(name)) return true;
  const category = name.replace(/^browser_/, "");
  return Object.entries(browserLegacyAliases).some(([alias, target]) => (
    disabledTools.has(alias) && target.category === category
  ));
}
