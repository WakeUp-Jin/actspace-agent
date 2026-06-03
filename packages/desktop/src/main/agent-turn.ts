/**
 * Agent Turn 编排
 *
 * 从 main/index.ts 抽出的 Agent turn 执行逻辑。
 * 职责：构建配置 → 创建实例 → 执行 turn → 持久化结果。
 *
 * main/index.ts 只负责 Electron 生命周期和 IPC 路由，
 * Agent 相关逻辑集中在这个文件。
 */

import type { BrowserWindow } from "electron";
import { join } from "node:path";
import type { AgentTurnResult, RunTurnInput, RuntimeStreamEvent } from "@actspace/shared";
import {
  buildAgentConfig,
  createAgentForSession,
  type AgentRuntimeContext,
  type AgentRunLogger,
  cleanupOldAgentRunLogs,
  cleanupOldToolOutputs,
  createAgentRunLogger,
  createCacheAuditTracker,
  runTurnWithAgent,
  createSessionStorePaths,
  readMeta,
  writeSessionResult,
} from "@actspace/agent-core";
import type { PendingApprovalRegistry } from "./approval-registry";
import { analyzeImageAttachmentsForTurn } from "./media-analysis";

export type AppDataRoots = {
  dataRoot: string;
  sessionRoot: string;
  logRoot: string;
  tmpRoot: string;
  defaultWorkspaceRoot: string;
  workspaceRoot: string;
};

export type AgentRuntimeContextLoader = (
  workspaceRoot: string,
) => Promise<Pick<AgentRuntimeContext, "systemPrompt" | "systemPromptSegments">>;

const PREVIEW_LIMIT = 160;

function preview(value: unknown, limit = PREVIEW_LIMIT): string {
  let text: string;
  try {
    text = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    text = String(value);
  }
  if (!text) return "";
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function logAgentTurn(message: string, details?: Record<string, unknown>): void {
  console.log(
    `[agent-turn] ${message}`,
    details ? JSON.stringify(details) : "",
  );
}

async function writeAgentRunLog(
  runLogger: AgentRunLogger | undefined,
  type: string,
  payload: unknown,
): Promise<void> {
  if (!runLogger) return;

  try {
    await runLogger.write({ type, payload });
  } catch (error) {
    console.error("[agent-run-log] failed to write main run log", error);
  }
}

const activeTurnAborts = new Map<string, () => void>();

function getTurnKey(input: { sessionId: string; turnId: string }): string {
  return `${input.sessionId}:${input.turnId}`;
}

export function abortTurn(input: { sessionId: string; turnId: string }): boolean {
  const abort = activeTurnAborts.get(getTurnKey(input));
  if (!abort) return false;
  abort();
  return true;
}

export async function runAndPersistTurn(
  input: RunTurnInput,
  roots: AppDataRoots,
  getMainWindow: () => BrowserWindow | undefined,
  approvalRegistry?: PendingApprovalRegistry,
  loadRuntimeContext?: AgentRuntimeContextLoader,
): Promise<AgentTurnResult> {
  logAgentTurn("run turn requested", {
    sessionId: input.sessionId,
    turnId: input.turnId,
    userInputLength: input.userInput.length,
    userInputPreview: preview(input.userInput),
    model: input.model,
    thinkingEnabled: Boolean(input.thinkingEnabled),
  });

  let runLogger: AgentRunLogger | undefined;
  try {
    await cleanupOldAgentRunLogs(roots.logRoot);
    // best-effort 回收 bash 落盘溢出文件，失败不影响 turn
    await cleanupOldToolOutputs(roots.tmpRoot).catch((error) => {
      console.error("[tool-output-cleanup] failed to clean overflow files", error);
    });
    runLogger = await createAgentRunLogger({
      logRoot: roots.logRoot,
      sessionId: input.sessionId,
      turnId: input.turnId,
    });
  } catch (error) {
    console.error("[agent-run-log] failed to prepare run log", error);
  }
  await writeAgentRunLog(runLogger, "main_event", {
    stage: "run_turn_requested",
    sessionId: input.sessionId,
    turnId: input.turnId,
    userInput: input.userInput,
    model: input.model,
    thinkingEnabled: Boolean(input.thinkingEnabled),
    runLogFilePath: runLogger?.filePath,
  });
  if (runLogger) {
    logAgentTurn("run log created", {
      sessionId: input.sessionId,
      turnId: input.turnId,
      filePath: runLogger.filePath,
    });
  }

  approvalRegistry?.setCurrentTurn(input.sessionId, input.turnId);

  const sessionDir = join(roots.sessionRoot, input.sessionId);
  const sessionPaths = createSessionStorePaths(sessionDir);
  const sessionMeta = await readMeta(sessionPaths.metaPath);
  const turnWorkspaceRoot = sessionMeta?.workspaceRoot ?? roots.defaultWorkspaceRoot;
  const runtimeContext = await loadRuntimeContext?.(turnWorkspaceRoot);

  const config = buildAgentConfig(
    { model: input.model, thinkingEnabled: input.thinkingEnabled },
    turnWorkspaceRoot,
    approvalRegistry,
    {
      tmpRoot: roots.tmpRoot,
      sessionId: input.sessionId,
      turnId: input.turnId,
      ...runtimeContext,
    },
  );
  const deps = await createAgentForSession(config, {
    sessionPath: sessionPaths.sessionPath,
  });

  const priorMessageCount = deps.contextManager.getMessageCount();
  logAgentTurn("agent dependencies ready", {
    workspaceRoot: turnWorkspaceRoot,
    modelId: deps.modelSpec.id,
    provider: deps.modelSpec.provider,
    apiModel: deps.modelSpec.apiModel,
    thinkingEnabled: deps.thinkingEnabled,
    priorMessageCount,
  });
  await writeAgentRunLog(runLogger, "main_event", {
    stage: "agent_dependencies_ready",
    workspaceRoot: turnWorkspaceRoot,
    sessionPath: sessionPaths.sessionPath,
    priorMessageCount,
  });

  const win = getMainWindow();
  const turnKey = getTurnKey(input);
  const abortableDeps = {
    ...deps,
    cacheAudit: createCacheAuditTracker({
      rootDir: join(roots.dataRoot, "cache-audit"),
      sessionId: input.sessionId,
      turnId: input.turnId,
      provider: deps.modelSpec.provider,
      model: deps.modelSpec.apiModel,
      modelId: deps.modelSpec.id,
      thinkingEnabled: input.thinkingEnabled ?? deps.thinkingEnabled,
    }),
    abort: undefined as (() => void) | undefined,
  };

  activeTurnAborts.set(turnKey, () => abortableDeps.abort?.());

  const forwardStreamEvent = (event: RuntimeStreamEvent) => {
    logAgentTurn("stream event sent to renderer", {
      sessionId: "sessionId" in event ? event.sessionId : input.sessionId,
      turnId: "turnId" in event ? event.turnId : input.turnId,
      type: event.type,
    });
    win?.webContents.send("agent:stream", event);
  };

  const attachmentAnalyses = await analyzeImageAttachmentsForTurn({
    sessionId: input.sessionId,
    turnId: input.turnId,
    userInput: input.userInput,
    attachments: input.attachments,
    onStreamEvent: forwardStreamEvent,
  });

  const resultPromise = runTurnWithAgent(
    {
      sessionId: input.sessionId,
      turnId: input.turnId,
      userInput: input.userInput,
      attachments: input.attachments,
      attachmentAnalyses,
      thinkingEnabled: input.thinkingEnabled,
    },
    abortableDeps,
    {
      onStreamEvent: forwardStreamEvent,
      runLogger,
    },
  );

  const result = await resultPromise;

  await writeAgentRunLog(runLogger, "main_event", {
    stage: "persisting_turn_result",
    sessionDir,
    status: result.status,
    eventCount: result.events.length,
  });
  logAgentTurn("persisting turn result", {
    sessionId: input.sessionId,
    turnId: input.turnId,
    sessionDir,
    status: result.status,
    eventCount: result.events.length,
  });
  await writeSessionResult(sessionPaths, result);
  await writeAgentRunLog(runLogger, "main_event", {
    stage: "turn_result_persisted",
    status: result.status,
  });
  logAgentTurn("turn result persisted", {
    sessionId: input.sessionId,
    turnId: input.turnId,
    status: result.status,
  });

  activeTurnAborts.delete(turnKey);
  return result;
}
