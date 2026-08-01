/**
 * Agent Run 编排
 *
 * 从 main/index.ts 抽出的 Agent Run 执行逻辑。
 * 职责：构建配置 → 创建实例 → 执行 Agent Run → 持久化结果。
 *
 * main/index.ts 只负责 Electron 生命周期和 IPC 路由，
 * Agent 相关运行逻辑集中在这个文件。
 */

import type { BrowserWindow } from "electron";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentRunResult, ComposerAttachment, RunAgentInput, RuntimeStreamEvent } from "@actspace/shared";
import {
  buildAgentConfig,
  buildAgentConfigFromRuntime,
  createAgentForSession,
  type AgentRuntimeContext,
  type AgentRunLogger,
  type AgentTraceWriter,
  cleanupOldAgentRunLogs,
  cleanupOldToolOutputs,
  createAgentRunLogger,
  createAgentTraceWriter,
  createCacheAuditTracker,
  generateSessionTitle,
  isDefaultSessionTitle,
  appendEvents,
  runAgentWithBridge,
  createSessionStorePaths,
  readMeta,
  updateMeta,
  userMessageToEvents,
  writeSessionResult,
} from "@actspace/agent-core";
import type { SessionMeta } from "@actspace/shared";
import type { PendingApprovalRegistry } from "./approval-registry";
import type { ModelRuntimeService } from "./model-runtime-service";

export type AppDataRoots = {
  dataRoot: string;
  sessionRoot: string;
  logRoot: string;
  tmpRoot: string;
  defaultWorkspaceRoot: string;
  workspaceRoot: string;
};

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".heic": "image/heic",
  ".heif": "image/heif",
};

function extname(value: string): string {
  const match = value.match(/\.[^.\\/]+$/);
  return match?.[0]?.toLowerCase() ?? "";
}

function inferAttachmentMimeType(attachment: ComposerAttachment): string {
  return attachment.mimeType || IMAGE_MIME_BY_EXT[extname(attachment.name)] || "image/png";
}

async function prepareAttachmentsForModel(
  attachments: ComposerAttachment[] | undefined,
  supportsImages: boolean,
): Promise<ComposerAttachment[] | undefined> {
  if (!supportsImages || !attachments?.some((attachment) => attachment.kind === "image" && attachment.path)) {
    return attachments;
  }

  const prepared: ComposerAttachment[] = [];
  for (const attachment of attachments) {
    if (attachment.kind !== "image" || !attachment.path) {
      prepared.push(attachment);
      continue;
    }
    const mimeType = inferAttachmentMimeType(attachment);
    const bytes = await readFile(attachment.path);
    prepared.push({
      ...attachment,
      mimeType,
      path: `data:${mimeType};base64,${bytes.toString("base64")}`,
    });
  }
  return prepared;
}

export type AgentRuntimeContextLoader = (
  workspaceRoot: string,
) => Promise<Pick<AgentRuntimeContext, "systemPrompt" | "systemPromptSegments" | "additionalWritableRoots" | "browserBridgeSocketPath">>;

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

function logAgentRun(message: string, details?: Record<string, unknown>): void {
  console.log(
    `[agent-run] ${message}`,
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

/**
 * 首轮对话结束后，用 flash 模型把「用户首条输入 + 助手回复」浓缩成会话标题，替换 "New chat"。
 *
 * 全程 best-effort：缺 key / 非首轮 / 标题已被用户改过 / 生成失败，都静默跳过，绝不阻塞或污染 Agent Run。
 * await 完成后再返回，让 renderer 在 Agent Run 结束后的 listSessions 刷新里直接拿到新标题（无需额外 IPC）。
 */
async function maybeGenerateSessionTitle(input: {
  metaPath: string;
  sessionMeta: SessionMeta | null;
  priorMessageCount: number;
  result: AgentRunResult;
  userInput: string;
  titler: import("@actspace/agent-core").LLMService;
}): Promise<void> {
  // 仅首次 Agent Run（运行前上下文为空）+ 仍是默认标题 + 本次正常完成时才生成。
  if (input.priorMessageCount > 0) return;
  if (!isDefaultSessionTitle(input.sessionMeta?.title)) return;
  if (input.result.status !== "completed") return;

  try {
    const title = await generateSessionTitle(input.titler, {
      userInput: input.userInput,
      replyText: input.result.finalReply?.content ?? "",
    });
    if (!title) return;
    const write = await updateMeta(input.metaPath, { title });
    if (write.ok) {
      logAgentRun("session title generated", { title });
    } else {
      console.error("[agent-run] failed to persist generated title", write.error);
    }
  } catch (error) {
    console.error("[agent-run] session title generation failed", error);
  }
}

const activeAgentRunAborts = new Map<string, () => void>();

function getAgentRunKey(input: { sessionId: string; agentRunId: string }): string {
  return `${input.sessionId}:${input.agentRunId}`;
}

export function abortAgentRun(input: { sessionId: string; agentRunId: string }): boolean {
  const abort = activeAgentRunAborts.get(getAgentRunKey(input));
  if (!abort) return false;
  abort();
  return true;
}

export function isSessionAgentRunActive(sessionId: string): boolean {
  const prefix = `${sessionId}:`;
  return [...activeAgentRunAborts.keys()].some((agentRunKey) => agentRunKey.startsWith(prefix));
}

export async function runAndPersistAgentRun(
  input: RunAgentInput,
  roots: AppDataRoots,
  getMainWindow: () => BrowserWindow | undefined,
  approvalRegistry?: PendingApprovalRegistry,
  loadRuntimeContext?: AgentRuntimeContextLoader,
  modelRuntime?: ModelRuntimeService,
): Promise<AgentRunResult> {
  logAgentRun("run requested", {
    sessionId: input.sessionId,
    agentRunId: input.agentRunId,
    userInputLength: input.userInput.length,
    userInputPreview: preview(input.userInput),
    model: input.modelKey ?? input.model,
    thinkingEnabled: Boolean(input.thinkingEnabled),
    reasoningEffort: input.reasoningEffort,
  });

  let runLogger: AgentRunLogger | undefined;
  try {
    await cleanupOldAgentRunLogs(roots.logRoot);
    // best-effort 回收 bash 落盘溢出文件，失败不影响 Agent Run
    await cleanupOldToolOutputs(roots.tmpRoot).catch((error) => {
      console.error("[tool-output-cleanup] failed to clean overflow files", error);
    });
    runLogger = await createAgentRunLogger({
      logRoot: roots.logRoot,
      sessionId: input.sessionId,
      agentRunId: input.agentRunId,
    });
  } catch (error) {
    console.error("[agent-run-log] failed to prepare run log", error);
  }
  await writeAgentRunLog(runLogger, "main_event", {
    stage: "run_requested",
    sessionId: input.sessionId,
    agentRunId: input.agentRunId,
    userInput: input.userInput,
    model: input.model,
    thinkingEnabled: Boolean(input.thinkingEnabled),
    reasoningEffort: input.reasoningEffort,
    runLogFilePath: runLogger?.filePath,
  });
  if (runLogger) {
    logAgentRun("run log created", {
      sessionId: input.sessionId,
      agentRunId: input.agentRunId,
      filePath: runLogger.filePath,
    });
  }

  approvalRegistry?.setCurrentAgentRun(input.sessionId, input.agentRunId);

  const sessionDir = join(roots.sessionRoot, input.sessionId);
  const sessionPaths = createSessionStorePaths(sessionDir);
  let traceWriter: AgentTraceWriter | undefined;
  try {
    traceWriter = await createAgentTraceWriter({
      sessionDir,
      sessionId: input.sessionId,
      agentRunId: input.agentRunId,
    });
  } catch (error) {
    console.error("[agent-trace] failed to prepare session trace", error);
  }
  const sessionMeta = await readMeta(sessionPaths.metaPath);
  const agentRunWorkspaceRoot = sessionMeta?.workspaceRoot ?? roots.defaultWorkspaceRoot;
  const runtimeContext = await loadRuntimeContext?.(agentRunWorkspaceRoot);

  const runtimeOptions = {
    tmpRoot: roots.tmpRoot,
    artifactRoot: join(sessionDir, "artifacts", "generated-images"),
    sessionId: input.sessionId,
    agentRunId: input.agentRunId,
    ...runtimeContext,
  };
  const config = modelRuntime
    ? (() => {
        const main = modelRuntime.resolveMainModel(input.modelKey ?? input.model);
        if (!("model" in main)) throw createModelUnavailableError(main.message, main.modelKey, main.reason ?? main.code);
        const utility = modelRuntime.resolveUtilityModel(main.model);
        const explore = modelRuntime.resolveExploreModel(main.model);
        if (!("model" in utility) || !("model" in explore)) throw createModelUnavailableError("任务模型无法解析。", undefined, "task_model_unavailable");
        return buildAgentConfigFromRuntime({
          main: { definition: main.model.definition, runtime: main.model.providerRuntime },
          utility: { definition: utility.model.definition, runtime: utility.model.providerRuntime },
          explore: { definition: explore.model.definition, runtime: explore.model.providerRuntime },
          thinkingEnabled: input.thinkingEnabled,
          reasoningEffort: input.reasoningEffort,
          toolEnvironment: modelRuntime.getToolEnvironment(),
        }, agentRunWorkspaceRoot, approvalRegistry, runtimeOptions);
      })()
    : buildAgentConfig(
        {
          model: input.model,
          thinkingEnabled: input.thinkingEnabled,
          reasoningEffort: input.reasoningEffort,
          exploreModelId: input.exploreModelId,
        },
        agentRunWorkspaceRoot,
        approvalRegistry,
        runtimeOptions,
      );
  const deps = await createAgentForSession(config, {
    sessionPath: sessionPaths.sessionPath,
  });

  const priorMessageCount = deps.contextManager.getMessageCount();
  logAgentRun("agent dependencies ready", {
    workspaceRoot: agentRunWorkspaceRoot,
    modelId: deps.modelKey,
    provider: deps.modelDefinition.provider,
    apiModel: deps.modelDefinition.apiModel,
    utilityModelKey: deps.utilityModelKey,
    exploreModelKey: deps.exploreModelKey,
    thinkingEnabled: deps.thinkingEnabled,
    reasoningEffort: deps.reasoningEffort,
    priorMessageCount,
  });
  await writeAgentRunLog(runLogger, "main_event", {
    stage: "agent_dependencies_ready",
    workspaceRoot: agentRunWorkspaceRoot,
    sessionPath: sessionPaths.sessionPath,
    priorMessageCount,
  });

  const win = getMainWindow();
  const agentRunKey = getAgentRunKey(input);
  const abortableDeps = {
    ...deps,
    cacheAudit: createCacheAuditTracker({
      rootDir: join(roots.dataRoot, "cache-audit"),
      sessionId: input.sessionId,
      agentRunId: input.agentRunId,
      provider: deps.modelDefinition.provider,
      model: deps.modelDefinition.apiModel,
      modelId: deps.modelKey,
      thinkingEnabled: input.thinkingEnabled ?? deps.thinkingEnabled,
    }),
    abort: undefined as (() => void) | undefined,
  };

  let abortRequested = false;
  activeAgentRunAborts.set(agentRunKey, () => {
    abortRequested = true;
    abortableDeps.abort?.();
    approvalRegistry?.abortAgentRun(input.sessionId, input.agentRunId);
  });

  const forwardStreamEvent = (event: RuntimeStreamEvent) => {
    logAgentRun("stream event sent to renderer", {
      sessionId: "sessionId" in event ? event.sessionId : input.sessionId,
      agentRunId: "agentRunId" in event ? event.agentRunId : input.agentRunId,
      type: event.type,
    });
    win?.webContents.send("agent:stream", event);
  };

  try {
    const userEvents = userMessageToEvents({
      role: "user",
      content: input.userInput,
      timestamp: Date.now(),
      source: "user",
    }, input.sessionId, input.agentRunId, { attachments: input.attachments });
    const startWrite = await appendEvents(sessionPaths.sessionPath, userEvents);
    if (!startWrite.ok) {
      throw new Error(startWrite.error);
    }

    const modelAttachments = await prepareAttachmentsForModel(
      input.attachments,
      deps.modelDefinition.capabilities.input.includes("image"),
    );

    const resultPromise = runAgentWithBridge(
      {
        sessionId: input.sessionId,
        agentRunId: input.agentRunId,
        userInput: input.userInput,
        attachments: input.attachments,
        modelAttachments,
        thinkingEnabled: input.thinkingEnabled,
        reasoningEffort: input.reasoningEffort,
      },
      abortableDeps,
      {
        onStreamEvent: forwardStreamEvent,
        runLogger,
        traceWriter,
        includeUserEvent: false,
      },
    );
    if (abortRequested) {
      abortableDeps.abort?.();
    }

    const result = await resultPromise;

    await writeAgentRunLog(runLogger, "main_event", {
      stage: "persisting_agent_run_result",
      sessionDir,
      status: result.status,
      eventCount: result.events.length,
    });
    logAgentRun("persisting agent run result", {
      sessionId: input.sessionId,
      agentRunId: input.agentRunId,
      sessionDir,
      status: result.status,
      eventCount: result.events.length,
    });
    await writeSessionResult(sessionPaths, result);
    await writeAgentRunLog(runLogger, "main_event", {
      stage: "agent_run_result_persisted",
      status: result.status,
    });
    logAgentRun("agent run result persisted", {
      sessionId: input.sessionId,
      agentRunId: input.agentRunId,
      status: result.status,
    });

    await maybeGenerateSessionTitle({
      metaPath: sessionPaths.metaPath,
      sessionMeta,
      priorMessageCount,
      result,
      userInput: input.userInput,
      titler: deps.utilityLlm ?? deps.llm,
    });

    return {
      ...result,
      events: [...userEvents, ...result.events],
    };
  } finally {
    activeAgentRunAborts.delete(agentRunKey);
    approvalRegistry?.abortAgentRun(input.sessionId, input.agentRunId);
    await deps.toolManager.dispose().catch((error) => {
      console.error("[agent-run] failed to dispose tool manager", error);
    });
  }
}

function createModelUnavailableError(message: string, modelKey?: string, reason?: string): Error {
  const error = new Error(message) as Error & { code?: string; modelKey?: string; reason?: string };
  error.name = "ModelUnavailableError";
  error.code = "model_unavailable";
  error.modelKey = modelKey;
  error.reason = reason;
  return error;
}
