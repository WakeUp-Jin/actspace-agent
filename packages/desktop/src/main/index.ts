/**
 * Electron Main 进程入口
 *
 * 职责：
 * - Electron 应用生命周期（app.whenReady / window-all-closed）
 * - 窗口创建与管理
 * - IPC 路由注册（把请求分发给对应模块）
 *
 * Agent turn 执行逻辑在 ./agent-run.ts。
 */

import { app, BrowserWindow, dialog, ipcMain, nativeImage, nativeTheme, safeStorage, shell } from "electron";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { access, mkdir, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import type {
  AbortAgentRunInput,
  AgentAnalysisIndexInput,
  AgentTraceClearInput,
  AgentTraceListInput,
  AgentTraceReadInput,
  ApprovalDecideInput,
  ApprovalListPendingInput,
  ClearProviderKeyInput,
  CompactContextInput,
  GenerateEvalCandidateInput,
  ComposerAttachment,
  RunAgentInput,
  SelectFilesResult,
  SelectImagesResult,
  SkillListInput,
  SelectWorkspaceDirectoryResult,
  SessionArchiveInput,
  SessionArchiveManyInput,
  SessionCreateInput,
  SessionForkInput,
  SessionGetInput,
  SessionListInput,
  SessionPinInput,
  SessionPreviewInput,
  SessionRenameInput,
  SessionWorkspaceInput,
  ArtifactContextMenuInput,
  SessionArtifactReadInput,
  SubAgentTranscriptGetInput,
  SetProviderKeyInput,
  SettingsUpdateInput,
  TestConnectionInput,
  TestConnectionResult,
  UpdateImageGenerationSettingsInput,
  UpdateImageGenerationSettingsResult,
  UsageStatisticsGetInput,
  ListVisualizationsInput,
  VisualizeReplyInput,
  DescribeContextInput,
  ReviewInitGitInput,
  ReviewApplyMutationInput,
  ReviewCreatePullRequestInput,
  ReviewCopyApplyCommandInput,
  ReviewGetFileContentsInput,
  ReviewGetFileDiffsInput,
  ReviewGetSnapshotInput,
  ReviewSetFileViewedInput,
  ReviewWorkspaceInput,
  WorkspaceEnvironmentGetInput,
  WorkspaceGitCommitAndPushInput,
  WorkspaceGitCommitInput,
  WorkspaceGitCreateBranchInput,
  WorkspaceGitPushInput,
  WorkspaceOpenInput,
  WorkspaceListDirInput,
  WorkspaceGitContextInput,
  WorkspaceGitContext,
  WorkspaceCreateFolderInput,
  WorkspaceCreateFolderResult,
  WorkspaceListResult,
  WorkspaceIdInput,
  WorkspaceVisibilityInput,
  WorkspaceReadFileInput,
  WorkspaceStatFileInput,
  BrowserBridgeActionResult,
  BrowserBridgeInstallResult,
  FsWatchConfigUpdateInput,
  FsWatchInstallResult,
  FsWatchPickRootResult,
  FsWatchSetEnabledInput,
  SkillInstallResult,
  SkillUninstallInput,
  ProviderConnectInput,
  ProviderUpdateInput,
  ProviderCredentialAddInput,
  ProviderCredentialUpdateInput,
  ProviderCredentialInput,
  ProviderCredentialOperationResult,
  ProviderIdInput,
  ProviderBalanceGetInput,
  ProviderOperationResult,
  ProviderTestResult,
  ProvidersListResult,
  ModelsListInstalledResult,
  ModelsListUsableInput,
  ModelsListUsableResult,
  ModelsCatalogListInput,
  ModelsCatalogListResult,
  ModelsAddInput,
  ModelsUpdateInput,
  ModelsRemoveInput,
  ModelMutationResult,
  TaskModelsUpdateInput,
  TaskModelsUpdateResult,
  KairosModelUpdateInput,
  KairosModelUpdateResult,
} from "@actspace/shared";
import { isProviderId, normalizeModelKey, resolveConfiguredModel } from "@actspace/shared";
import {
  createBootstrapState,
  createGlobalUsageStatisticsSnapshot,
  createUsageStatisticsSnapshot,
  loadEnv,
  createSessionRecord,
  forkSessionRecord,
  createSessionStorePaths,
  listSessionRecords,
  readSubAgentTranscript,
  readSessionRecord,
  setSessionArchived,
  setSessionPinned,
  setSessionTitle,
  setSessionWorkspace,
  createKairos,
  createLLMService,
  ShortMemoryStore,
  bashTaskRegistry,
  closeProviderTransports,
  loadSkillRegistry,
  type KairosConfig,
  type KairosController,
  type KairosSkillCatalogEntry,
} from "@actspace/agent-core";
import type { SessionEvent, SessionRecord } from "@actspace/shared";
import {
  runAndPersistAgentRun,
  abortAgentRun,
  disposeDesktopAgentRuntime,
  isSessionAgentRunActive,
  type AgentRuntimeContextLoader,
  type AppDataRoots,
} from "./agent-run";
import { compactAndPersistContext } from "./context-compact";
import { generateEvalCandidate } from "./eval-candidate-service";
import { listVisualizations, visualizeReply } from "./visualize-service";
import { describeSessionContext } from "./context-describe-service";
import { loadMainAgentRuntimeContext } from "./agent-runtime-context";
import { listWorkspaceDir, readWorkspaceFile, statWorkspaceFile } from "./workspace-fs-service";
import { readSessionArtifact } from "./session-artifact-service";
import { showArtifactContextMenu } from "./artifact-context-menu-service";
import { initializeGitRepository } from "./review-git-service";
import { ReviewCoordinator } from "./review-coordinator";
import { ReviewGitEngine } from "./review-git-engine";
import { ReviewGitWorkerClient } from "./review-git-worker-client";
import { ReviewLastTurnService } from "./review-last-turn-service";
import { ReviewPullRequestService } from "./review-pr-service";
import { ReviewViewStateService } from "./review-view-state-service";
import {
  commitAndPushWorkspaceChanges,
  commitWorkspaceChanges,
  createWorkspaceBranch,
  getWorkspaceEnvironment,
  pushWorkspaceBranch,
} from "./workspace-environment-service";
import { getWorkspaceGitContext } from "./workspace-git-context-service";
import { listWorkspaceOpenTools, openWorkspaceInTool } from "./workspace-open-service";
import {
  createWorkspaceFolder,
  readWorkspaceRegistry,
  resolveRegisteredWorkspaceSelection,
  resolveWorkspaceSelection,
  setWorkspaceHidden,
} from "./workspace-registry-service";
import { openWorkspaceInIde } from "./workspace-ide-service";
import { getSessionPreview } from "./session-preview-service";
import { createNodePtyBackend } from "./terminal/node-pty-terminal-backend";
import { registerTerminalIpc, sendTerminalEvent } from "./terminal/terminal-ipc";
import { TerminalSessionService } from "./terminal/terminal-session-service";
import { clearAgentTraces, enforceAgentTraceRetention, getAgentAnalysisIndex, listAgentTraces, readAgentTrace } from "./agent-trace-service";
import { LocalUpdateService } from "./local-update-service";
import { PendingApprovalRegistry } from "./approval-registry";
import {
  createDynamicKairosToolManagerFactory,
  getKairosWorkspaceRoot,
  resolveDynamicKairosThinking,
  ensureKairosScaffolding,
} from "./kairos-bootstrap";
import { registerKairosConfigIpc, registerKairosIpc, type KairosIpcHandle } from "./kairos-ipc";
import { SettingsService, type SecretCrypto } from "./settings-service";
import { ModelStoreService, type ModelStoreResult } from "./model-store-service";
import { OpenRouterCatalogService } from "./openrouter-catalog-service";
import { ModelRuntimeService } from "./model-runtime-service";
import { testProviderConnection } from "./provider-connection-service";
import {
  getDeepSeekBalanceSnapshot,
  getKimiBalanceSnapshot,
  getProviderBalanceSnapshot,
} from "./provider-balance-service";
import { resolveAppDataRoots } from "./app-paths";
import { BrowserBridgeService } from "./plugins/browser-bridge-service";
import { FsWatchService } from "./plugins/fs-watch-service";
import { installSkillFromDirectory, listSkills, uninstallSkillDirectory } from "./skills-service";

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const APP_ID = process.env.ACTSPACE_DEV_APP_ID?.trim() || "com.actspace.desktop";
const APP_DISPLAY_NAME = process.env.ACTSPACE_DEV_APP_NAME?.trim() || "actspace";
const APP_DATA_DIRECTORY_NAME = "actspace";
const IS_PACKAGED_BUILD = app.isPackaged && !DEV_SERVER_URL;
const PREVIEW_LIMIT = 160;
const workspaceAppIconCache = new Map<string, string>();

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".pdf": "application/pdf",
  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".txt": "text/plain",
  ".json": "application/json",
  ".csv": "text/csv",
  ".ts": "text/typescript",
  ".tsx": "text/typescript",
  ".js": "text/javascript",
  ".jsx": "text/javascript",
  ".html": "text/html",
  ".css": "text/css",
};

let startupLogPath: string | undefined;
let startupRunLogPath: string | undefined;

// ─── 工具函数 ───

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

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify(String(value));
  }
}

function appendStartupLogLine(line: string): void {
  if (!startupLogPath || !startupRunLogPath) return;
  try {
    appendFileSync(startupLogPath, line);
    appendFileSync(startupRunLogPath, line);
  } catch {
    // Startup logging must never block the app from opening.
  }
}

function writeStartupLog(
  source: "main" | "renderer-console",
  message: string,
  details?: Record<string, unknown>,
): void {
  appendStartupLogLine(
    `${safeJson({
      ts: new Date().toISOString(),
      source,
      message,
      details: details ?? {},
    })}\n`,
  );
}

function initializeStartupLogging(): void {
  const logRoot = join(app.getPath("userData"), "logs");
  const runStamp = new Date().toISOString().replace(/[:.]/g, "-");
  startupLogPath = join(logRoot, "main-startup.log");
  startupRunLogPath = join(logRoot, `main-startup-${runStamp}.log`);
  try {
    mkdirSync(logRoot, { recursive: true });
    writeFileSync(startupRunLogPath, "");
  } catch {
    startupLogPath = undefined;
    startupRunLogPath = undefined;
    return;
  }
  writeStartupLog("main", "startup log initialized", {
    logPath: startupLogPath,
    runLogPath: startupRunLogPath,
    isPackaged: IS_PACKAGED_BUILD,
    electronIsPackaged: app.isPackaged,
    version: app.getVersion(),
    execPath: process.execPath,
  });
}

function logMain(message: string, details?: Record<string, unknown>): void {
  console.log(
    `[main] ${message}`,
    details ? JSON.stringify(details) : "",
  );
  writeStartupLog("main", message, details);
}

function logRendererConsole(
  level: "log" | "warn" | "error" | "debug" | "info",
  message: string,
  details?: Record<string, unknown>,
): void {
  const payload = {
    level,
    message: preview(message, 500),
    ...details,
  };
  console.log(`[renderer-console] ${JSON.stringify(payload)}`);
  writeStartupLog("renderer-console", message, { level, ...details });
}

function attachmentMimeType(filePath: string): string | undefined {
  return MIME_BY_EXT[extname(filePath).toLowerCase()];
}

function attachmentKind(filePath: string): ComposerAttachment["kind"] {
  return attachmentMimeType(filePath)?.startsWith("image/") ? "image" : "file";
}

function attachmentFromPath(filePath: string, index: number): ComposerAttachment {
  const mimeType = attachmentMimeType(filePath);
  const kind = attachmentKind(filePath);
  return {
    id: `att_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`,
    kind,
    name: basename(filePath),
    path: filePath,
    mimeType,
    previewUrl: kind === "image" ? pathToFileURL(filePath).toString() : undefined,
  };
}

// ─── 数据目录 ───

let dataDirectoriesPromise: Promise<AppDataRoots> | undefined;

async function initializeDataDirectories(): Promise<AppDataRoots> {
  const roots = await resolveAppDataRoots({
    dataRoot: app.getPath("userData"),
    defaultWorkspaceRoot: app.getPath("downloads"),
    cwd: process.cwd(),
    env: process.env,
  });
  const kairosInboxRoot = join(roots.dataRoot, "kairos", "inbox");

  await mkdir(roots.sessionRoot, { recursive: true });
  await mkdir(roots.logRoot, { recursive: true });
  await mkdir(roots.tmpRoot, { recursive: true });
  await mkdir(kairosInboxRoot, { recursive: true });

  logMain("data directories ensured", {
    dataRoot: roots.dataRoot,
    sessionRoot: roots.sessionRoot,
    logRoot: roots.logRoot,
    tmpRoot: roots.tmpRoot,
    kairosInboxRoot,
    defaultWorkspaceRoot: roots.defaultWorkspaceRoot,
    workspaceRoot: roots.workspaceRoot,
  });

  return roots;
}

function ensureDataDirectories(): Promise<AppDataRoots> {
  dataDirectoriesPromise ??= initializeDataDirectories().catch((error) => {
    dataDirectoriesPromise = undefined;
    throw error;
  });
  return dataDirectoriesPromise;
}

/**
 * 读取 sessionRoot 下**所有** session 的完整 record（含 events）。供 Usage 全局聚合使用。
 *
 * 实现细节：
 * - 先 `listSessionRecords` 只读 meta，再对每条并行 `readSessionRecord`，避免重复 IO；
 * - 读失败的 session（损坏/缺文件）静默跳过，不让单个坏点炸掉整张账单；
 * - **不**做时间窗过滤——窗口截断由 `createGlobalUsageStatisticsSnapshot` 内部统一负责，
 *   这里保持职责单一。
 */
async function loadAllSessionRecords(sessionRoot: string): Promise<SessionRecord[]> {
  const summaries = await listAllSessionSummaries(sessionRoot);
  const records = await Promise.all(
    summaries.map(async (item) => {
      try {
        return await readSessionRecord(createSessionStorePaths(join(sessionRoot, item.id)));
      } catch (error) {
        logMain("usage-statistics: failed to read session record", {
          sessionId: item.id,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    }),
  );
  return records.filter((record): record is SessionRecord => record !== null);
}

async function listAllSessionSummaries(sessionRoot: string) {
  const [activeSummaries, archivedSummaries] = await Promise.all([
    listSessionRecords(sessionRoot),
    listSessionRecords(sessionRoot, { archived: true }),
  ]);
  return [...activeSummaries, ...archivedSummaries];
}

async function readWorkspaceRegistryForRoots(roots: AppDataRoots): Promise<WorkspaceListResult> {
  const sessions = await listAllSessionSummaries(roots.sessionRoot);
  return readWorkspaceRegistry({
    dataRoot: roots.dataRoot,
    defaultWorkspaceRoot: roots.defaultWorkspaceRoot,
    fallbackWorkspaceRoot: roots.workspaceRoot,
    sessions,
  });
}

async function resolveWorkspaceForRoots(
  roots: AppDataRoots,
  input: { workspaceId?: string; workspaceRoot?: string },
) {
  const sessions = await listAllSessionSummaries(roots.sessionRoot);
  return resolveWorkspaceSelection({
    dataRoot: roots.dataRoot,
    defaultWorkspaceRoot: roots.defaultWorkspaceRoot,
    fallbackWorkspaceRoot: roots.workspaceRoot,
    sessions,
  }, input);
}

async function workspaceRegistryOptionsForRoots(roots: AppDataRoots) {
  const sessions = await listAllSessionSummaries(roots.sessionRoot);
  return {
    dataRoot: roots.dataRoot,
    defaultWorkspaceRoot: roots.defaultWorkspaceRoot,
    fallbackWorkspaceRoot: roots.workspaceRoot,
    sessions,
  };
}

async function resolveRegisteredWorkspaceForRoots(
  roots: AppDataRoots,
  input: { workspaceId?: string; workspaceRoot?: string },
) {
  const sessions = await listAllSessionSummaries(roots.sessionRoot);
  return resolveRegisteredWorkspaceSelection({
    dataRoot: roots.dataRoot,
    defaultWorkspaceRoot: roots.defaultWorkspaceRoot,
    fallbackWorkspaceRoot: roots.workspaceRoot,
    sessions,
  }, input);
}

async function requireRegisteredWorkspaceRoot(roots: AppDataRoots, workspaceRoot?: string): Promise<string> {
  const resolved = await resolveRegisteredWorkspaceForRoots(roots, { workspaceRoot });
  if (resolved.ok === false) throw new Error(resolved.error);
  return resolved.workspaceRoot;
}

/**
 * 读取 Kairos 短期记忆下**全部历史段**的 SessionEvent。
 *
 * - 走 `ShortMemoryStore.loadAll()`，已覆盖跨月、跨 `reset_today` 切段的情形；
 * - 目录不存在/读失败时返回空数组（首启 / 未启用 Kairos 都是正常路径）；
 * - 返回未过滤的全部事件——`createGlobalUsageStatisticsSnapshot` 只会聚合 `llm_usage`/`tool_call`/
 *   `tool_result`/`user_message` 等已知类型，其余事件会被忽略。
 */
async function loadAllKairosEvents(shortMemoryRoot: string): Promise<SessionEvent[]> {
  try {
    await access(shortMemoryRoot);
  } catch {
    return [];
  }
  try {
    const store = new ShortMemoryStore(shortMemoryRoot);
    return await store.loadAll();
  } catch (error) {
    logMain("usage-statistics: failed to load kairos events", {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

// ─── 设置（Settings） ───

/** 生产环境用 Electron safeStorage 为供应商 API Key 加解密。 */
const electronSecretCrypto: SecretCrypto = {
  isAvailable: () => safeStorage.isEncryptionAvailable(),
  encrypt: (plain) => safeStorage.encryptString(plain),
  decrypt: (cipher) => safeStorage.decryptString(cipher),
};

let settingsService: SettingsService | undefined;
let modelStoreService: ModelStoreService | undefined;
let openRouterCatalogService: OpenRouterCatalogService | undefined;
let modelRuntimeService: ModelRuntimeService | undefined;
let localUpdateService: LocalUpdateService | undefined;
let localUpdateQuitRequested = false;
let browserBridgeService: BrowserBridgeService | undefined;
let fsWatchService: FsWatchService | undefined;
let reviewCoordinator: ReviewCoordinator | undefined;
let reviewCoordinatorDataRoot: string | undefined;
let reviewGitEngine: ReviewGitEngine | undefined;
let reviewGitWorkerClient: ReviewGitWorkerClient | undefined;
let reviewPullRequestService: ReviewPullRequestService | undefined;

function getReviewPullRequestService(): ReviewPullRequestService {
  reviewPullRequestService ??= new ReviewPullRequestService();
  return reviewPullRequestService;
}

function isSafeSessionId(value: string): boolean {
  return value.length > 0 && value !== "." && value !== ".." && !value.includes("/") && !value.includes("\\");
}

async function resolveReviewWorkspace(roots: AppDataRoots, input: ReviewWorkspaceInput) {
  let workspaceId = input.workspaceId;
  let workspaceRoot = input.workspaceRoot;
  if ((!workspaceId && !workspaceRoot) && input.sessionId && isSafeSessionId(input.sessionId)) {
    const record = await readSessionRecord(createSessionStorePaths(join(roots.sessionRoot, input.sessionId)));
    workspaceId = record?.meta.workspaceId;
    workspaceRoot = record?.meta.workspaceRoot;
  }
  const resolved = await resolveRegisteredWorkspaceForRoots(roots, { workspaceId, workspaceRoot });
  return resolved.ok === true
    ? { ok: true as const, workspace: { workspaceId: resolved.workspaceId, workspaceRoot: resolved.workspaceRoot } }
    : { ok: false as const, message: resolved.error };
}

function getReviewCoordinator(roots: AppDataRoots): ReviewCoordinator {
  if (reviewCoordinator && reviewCoordinatorDataRoot === roots.dataRoot) return reviewCoordinator;
  reviewCoordinator?.dispose();
  reviewGitWorkerClient?.dispose();
  const lastTurn = new ReviewLastTurnService(roots.sessionRoot);
  const worker = new ReviewGitWorkerClient();
  const engine = new ReviewGitEngine({
    runner: worker.runGit,
    patchParser: worker.parsePatches,
    objectLoader: worker.loadGitObjects,
    trashFile: (absolutePath) => shell.trashItem(absolutePath),
    loadLastTurn: (input) => lastTurn.getSnapshot(input),
    loadLastTurnFileDiff: (input) => lastTurn.getFileDiff(input),
  });
  reviewGitWorkerClient = worker;
  reviewGitEngine = engine;
  reviewCoordinator = new ReviewCoordinator({
    resolveWorkspace: (input) => resolveReviewWorkspace(roots, input),
    queryProvider: engine,
    mutationProvider: engine,
    viewState: new ReviewViewStateService({ filePath: join(roots.dataRoot, "review", "view-state.json") }),
  });
  reviewCoordinator.subscribe((notification) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send("review:changed", notification);
    }
  });
  reviewCoordinatorDataRoot = roots.dataRoot;
  return reviewCoordinator;
}

function getReviewGitEngine(roots: AppDataRoots): ReviewGitEngine {
  getReviewCoordinator(roots);
  if (!reviewGitEngine) throw new Error("Review Git engine is unavailable.");
  return reviewGitEngine;
}

function quoteShellArgument(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function getSettingsService(): SettingsService {
  if (!settingsService) {
    throw new Error("SettingsService 尚未初始化（应在 app.whenReady 内 load 之后再调用）。");
  }
  return settingsService;
}

function getModelStoreService(): ModelStoreService {
  if (!modelStoreService) throw new Error("ModelStoreService 尚未初始化。");
  return modelStoreService;
}

function getOpenRouterCatalogService(): OpenRouterCatalogService {
  if (!openRouterCatalogService) throw new Error("OpenRouterCatalogService 尚未初始化。");
  return openRouterCatalogService;
}

function getModelRuntimeService(): ModelRuntimeService {
  if (!modelRuntimeService) throw new Error("ModelRuntimeService 尚未初始化。");
  return modelRuntimeService;
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 300) : "操作失败，请重试。";
}

function providerErrorCode(error: unknown): "invalid_api_key" | "invalid_base_url" | "invalid_proxy_url" | "secret_storage_unavailable" | "write_failed" {
  const code = (error as { code?: string } | null)?.code;
  return code === "invalid_api_key" || code === "invalid_base_url" || code === "invalid_proxy_url" || code === "secret_storage_unavailable"
    ? code
    : "write_failed";
}

function providerOperationFailure(code: "invalid_provider" | "invalid_api_key" | "invalid_base_url" | "invalid_proxy_url" | "secret_storage_unavailable" | "write_failed", message: string): ProviderOperationResult {
  return { ok: false, error: { code, message } };
}

function emptyProviderView() {
  return { hasApiKey: false, enabled: false, baseUrl: null, proxy: { enabled: false, url: null }, lastConnection: { status: "untested" as const }, installedModelCount: 0, enabledModelCount: 0, defaultPricingMultiplier: 1, additionalCredentials: [] };
}

function toModelMutationResult(result: ModelStoreResult): ModelMutationResult {
  if (!("code" in result)) return { ok: true, ...(result.model && { model: result.model }) };
  const code = result.code === "model_in_use"
    ? "model_in_use"
    : result.code === "model_not_removable"
      ? "model_not_removable"
      : result.code === "model_not_found" || result.code === "model_not_installed"
        ? "model_missing"
        : result.code === "credential_missing"
          ? "credential_missing"
        : "invalid_model";
  return { ok: false, error: { code, message: result.message, ...(result.references && { references: result.references as any }) } };
}

function getFsWatchService(roots: AppDataRoots): FsWatchService {
  if (!fsWatchService) {
    fsWatchService = new FsWatchService({
      dataRoot: roots.dataRoot,
      // 首次生成 config.json 的默认监听目录：Kairos 自己的 workspace（开箱即用且无隐私风险）
      defaultWatchRoot: getKairosWorkspaceRoot(join(roots.dataRoot, "kairos")),
      isEnabled: () => getSettingsService().get().plugins.fsWatch.enabled,
      log: logMain,
    });
  }
  return fsWatchService;
}

function getBrowserBridgeService(roots: AppDataRoots): BrowserBridgeService {
  if (!browserBridgeService) {
    browserBridgeService = new BrowserBridgeService({
      dataRoot: roots.dataRoot,
      log: logMain,
    });
  }
  return browserBridgeService;
}

function sameStringSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((item) => setA.has(item));
}

/**
 * 读取 Kairos 的 Skill 白名单 catalog：loadSkillRegistry（与主 Agent 同一套发现）
 * → 按 settings.kairos.enabledSkills 过滤 → 映射为 controller 需要的 catalog 条目。
 */
async function loadKairosSkillCatalog(roots: AppDataRoots): Promise<KairosSkillCatalogEntry[]> {
  const enabled = new Set(getSettingsService().get().kairos.enabledSkills);
  if (enabled.size === 0) return [];
  const registry = await loadSkillRegistry({
    dataRoot: roots.dataRoot,
    workspaceRoot: roots.workspaceRoot,
    warn: logMain,
  });
  return registry.skills
    .filter((skill) => enabled.has(skill.name))
    .map((skill) => ({
      name: skill.name,
      description: skill.description,
      location: skill.location,
      directory: skill.directory,
    }));
}

function getLocalUpdateService(): LocalUpdateService {
  if (!localUpdateService) {
    throw new Error("LocalUpdateService is not initialized");
  }
  return localUpdateService;
}

// ─── Electron 配置 ───

function configureAppPaths() {
  app.setName(APP_DISPLAY_NAME);
  const userDataRoot = join(app.getPath("appData"), APP_DATA_DIRECTORY_NAME);
  app.setPath("userData", userDataRoot);
  initializeStartupLogging();
  logMain("app paths configured", { appId: APP_ID, appName: APP_DISPLAY_NAME, userDataRoot });
}

function mapConsoleLevel(level: number): "log" | "warn" | "error" | "debug" | "info" {
  switch (level) {
    case 1:
      return "warn";
    case 2:
      return "error";
    case 3:
      return "debug";
    case 4:
      return "info";
    default:
      return "log";
  }
}

function getMainWindow(): BrowserWindow | undefined {
  return BrowserWindow.getAllWindows()[0];
}

let terminalSessionService: TerminalSessionService | undefined;
let disposeTerminalIpc: (() => void) | undefined;

function initializeTerminalService(roots: AppDataRoots): void {
  if (terminalSessionService) return;
  terminalSessionService = new TerminalSessionService({
    readSession: async (sessionId) => {
      const record = await readSessionRecord(createSessionStorePaths(join(roots.sessionRoot, sessionId)));
      return record ? { workspaceRoot: record.meta.workspaceRoot } : null;
    },
    resolveWorkspaceRoot: (workspaceRoot) => requireRegisteredWorkspaceRoot(roots, workspaceRoot),
    createBackend: createNodePtyBackend,
    sendEvent: sendTerminalEvent,
    log: (message, detail) => logMain(message, detail),
  });
  disposeTerminalIpc = registerTerminalIpc(terminalSessionService);
}

async function createMainWindow() {
  const preloadPath = join(__dirname, "..", "preload", "index.js");
  logMain("create main window start", { preloadPath });
  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 480,
    minHeight: 760,
    title: "actspace",
    titleBarStyle: "hidden",
    // 红绿灯每个圆约 12px，y=16 → 圆心 Y = 22，对齐窗口顶部 chrome bar
    // 的按钮中心（chrome bar height 44 / align-items: center → 中心 Y = 22）。
    // 调整 y 时也要同步看 renderer styles/tokens.css 里 --window-chrome-strip-height。
    trafficLightPosition: {
      x: 16,
      y: 16
    },
    backgroundColor: "#f7f9ff",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const ownerId = win.webContents.id;
  win.webContents.once("destroyed", () => {
    void terminalSessionService?.closeOwner(ownerId);
  });

  win.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    const levelName = mapConsoleLevel(level);
    logRendererConsole(levelName, message, { line, sourceId: preview(sourceId, 240) });
  });

  win.webContents.on("did-finish-load", () => {
    logMain("renderer did finish load", { url: win.webContents.getURL() });
  });

  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    logMain("renderer did fail load", {
      errorCode,
      errorDescription,
      validatedURL,
      isMainFrame,
    });
  });

  win.webContents.on("dom-ready", () => {
    logMain("renderer dom ready", { url: win.webContents.getURL() });
  });

  win.webContents.on("render-process-gone", (_event, details) => {
    logMain("renderer process gone", {
      reason: details.reason,
      exitCode: details.exitCode,
    });
  });

  if (DEV_SERVER_URL) {
    try {
      logMain("loading dev server", { url: DEV_SERVER_URL });
      await win.loadURL(DEV_SERVER_URL);
    } catch (error) {
      console.error(`Failed to load dev server URL: ${DEV_SERVER_URL}`, error);
      throw error;
    }
    if (process.env.ACTSPACE_OPEN_DEVTOOLS === "1") {
      win.webContents.openDevTools({ mode: "detach" });
    }
  } else {
    const filePath = join(__dirname, "..", "..", "dist", "index.html");
    logMain("loading packaged renderer", { filePath });
    await win.loadFile(filePath);
  }
  logMain("create main window loaded", { url: win.webContents.getURL() });
}

// ─── Kairos 单例（lazy init in app.whenReady） ───

let kairosController: KairosController | undefined;
let kairosIpcHandle: KairosIpcHandle | undefined;
let kairosConfigIpcHandle: KairosIpcHandle | undefined;

async function ensureKairosConfigIpc(roots: AppDataRoots): Promise<void> {
  if (kairosConfigIpcHandle) return;
  const kairosRoot = join(roots.dataRoot, "kairos");
  await ensureKairosScaffolding(kairosRoot);
  kairosConfigIpcHandle = registerKairosConfigIpc({
    kairosRoot,
    getController: () => kairosController,
    onPreferencesWritten: (next) => {
      void reconcileKairosAfterPreferences(roots, next);
    },
  });
}

async function ensureKairosController(roots: AppDataRoots): Promise<KairosController> {
  if (kairosController) return kairosController;
  const kairosRoot = join(roots.dataRoot, "kairos");
  await ensureKairosScaffolding(kairosRoot);
  const kairosWorkspaceRoot = getKairosWorkspaceRoot(kairosRoot);
  // 模型 / 思考链真来源 = settings.json 的 kairos 分区。
  const kairosSettings = getSettingsService().getV2().kairos;
  const resolved = getModelRuntimeService().resolveKairosModel();
  if (!("model" in resolved)) {
    const error = new Error(resolved.message) as Error & { code?: string; modelKey?: string };
    error.code = "model_unavailable";
    error.modelKey = resolved.modelKey;
    throw error;
  }
  const llm = createLLMService(resolved.model.llmConfig);
  const resolvedModelId = resolved.model.key;
  const thinkingEnabled = resolveDynamicKairosThinking(resolved.model.definition, kairosSettings.thinking);
  const toolManagerFactory = createDynamicKairosToolManagerFactory({
    workspaceRoot: kairosWorkspaceRoot,
    definition: resolved.model.definition,
    llmConfig: resolved.model.llmConfig,
    toolEnvironment: getModelRuntimeService().getToolEnvironment(),
  });
  const contextWindow = resolved.model.definition.contextWindow ?? 128_000;
  // Skill 白名单 catalog：加载失败不阻塞 Kairos 启动（回落为不加载任何 Skill）
  let skillCatalog: KairosSkillCatalogEntry[] = [];
  try {
    skillCatalog = await loadKairosSkillCatalog(roots);
  } catch (err) {
    logMain("kairos skill catalog load failed", { error: err instanceof Error ? err.message : String(err) });
  }
  // fs-watch 监听目录并入 Kairos 只读授权：用户把目录加进文件监听即代表允许 Kairos
  // 阅读其中内容（写仍限 paths.json）。读取失败回落空数组，不阻塞启动。
  let fsWatchReadOnlyRoots: string[] = [];
  try {
    fsWatchReadOnlyRoots = (await getFsWatchService(roots).getConfig()).roots;
  } catch (err) {
    logMain("kairos fs-watch roots load failed", { error: err instanceof Error ? err.message : String(err) });
  }
  kairosController = await createKairos({
    kairosRoot,
    llm,
    modelId: resolvedModelId,
    toolManagerFactory,
    contextWindow,
    thinkingEnabled,
    skillCatalog,
    readOnlyRoots: fsWatchReadOnlyRoots,
  });
  kairosIpcHandle = registerKairosIpc({
    controller: kairosController,
    kairosRoot,
    getMainWindow,
  });
  logMain("kairos controller ready", { kairosRoot, kairosWorkspaceRoot, modelId: resolvedModelId });
  return kairosController;
}

/**
 * 用户保存 `preferences.json` 后的副作用调和（由 kairos:write-config 经 setImmediate 异步触发）：
 * preferences.json 只保留 enabled / sleep / rhythm 等运行偏好；模型 / 思考链已迁到 settings.json。
 * 这里仅按 `enabled` 调和运行态：开启且未跑 → start()；关闭且在跑 → stop()。
 *
 * 失败只记日志、不抛（写盘已成功，UI 已收到 ok）。
 */
async function reconcileKairosAfterPreferences(roots: AppDataRoots, next: KairosConfig): Promise<void> {
  if (!kairosController) return;
  try {
    const state = kairosController.getState();
    if (next.preferences.enabled && !state.enabled) {
      await kairosController.start();
    } else if (!next.preferences.enabled && state.enabled) {
      await kairosController.stop();
    }
  } catch (err) {
    logMain("kairos reconcile after preferences write failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * 在 Kairos 模型 / 思考链（settings.json）变更后重建 controller，
 * 使其用最新配置重新创建 LLM。
 *
 * - Kairos 的 LLM 在 `createKairos()` 时定型，无法热替换，故采用「停旧 → 释放 IPC → 重建」。
 *   重建里 `ensureKairosController` 会重新读 settings.json 拿到最新 modelId / thinking。
 * - 即使正在 ticking，也会 stop 旧 controller；保存设置成功后下一次 Kairos 调用必定使用新模型。
 * - `start()` 默认尊重 `preferences.enabled`，因此重建后会恢复用户此前的开启/暂停意图。
 */
async function rebuildKairosController(roots: AppDataRoots): Promise<void> {
  if (kairosController) {
    try {
      await kairosController.stop();
    } catch (err) {
      logMain("kairos rebuild: stop threw", { error: err instanceof Error ? err.message : String(err) });
    }
  }
  kairosIpcHandle?.dispose();
  kairosController = undefined;
  kairosIpcHandle = undefined;
  const controller = await ensureKairosController(roots);
  await controller.start();
  logMain("kairos controller rebuilt with latest settings");
}

async function reconcileKairosModelChange(roots: AppDataRoots): Promise<void> {
  const resolution = getModelRuntimeService().resolveKairosModel();
  if (!("model" in resolution)) {
    if (kairosController) {
      try {
        await kairosController.stop();
      } finally {
        kairosIpcHandle?.dispose();
        kairosController = undefined;
        kairosIpcHandle = undefined;
      }
    }
    logMain("kairos paused because configured model is unavailable", {
      modelKey: resolution.modelKey,
      reason: resolution.reason ?? resolution.code,
    });
    return;
  }
  await rebuildKairosController(roots);
}

// ─── 审核注册表（单例） ───

const approvalRegistry = new PendingApprovalRegistry({
  onApprovalRequired: (request, sessionId, agentRunId) => {
    const win = getMainWindow();
    if (!win) return;
    win.webContents.send("agent:stream", {
      type: "tool_approval_required",
      toolCallId: request.toolCallId ?? request.id,
      toolName: request.toolName,
      requestId: request.id,
      summary: request.summary,
      reason: request.reason,
      command: typeof request.args.command === "string" ? request.args.command : undefined,
      riskLevel: request.riskLevel,
      approvalScope: request.approvalScope,
      executionEnvironment: request.executionEnvironment,
      sessionId,
      agentRunId,
    });
  },
  onApprovalResolved: (request, decision, sessionId, agentRunId) => {
    const win = getMainWindow();
    if (!win) return;
    win.webContents.send("agent:stream", {
      type: "tool_approval_resolved",
      toolCallId: request.toolCallId ?? request.id,
      requestId: decision.requestId,
      decision: decision.decision,
      approvalScope: request.approvalScope,
      sessionId,
      agentRunId,
    });
  },
});

// ─── IPC 注册 ───

async function registerIpc() {
  ipcMain.handle("app:get-bootstrap-state", async () => {
    const roots = await ensureDataDirectories();
    return createBootstrapState({
      appVersion: app.getVersion(),
      dataRoot: roots.dataRoot,
      sessionRoot: roots.sessionRoot,
      logRoot: roots.logRoot,
      tmpRoot: roots.tmpRoot,
      workspaceRoot: roots.workspaceRoot,
    });
  });

  ipcMain.handle("agent:run", async (_event, input: RunAgentInput) => {
    const roots = await ensureDataDirectories();
    // Kairos 礼让钩子：让正在 sleep 的 Kairos 让位给 user，turn 结束后 5s 才允许 Kairos 重新投 tick。
    // controller 尚未初始化时（用户没开启 Kairos）跳过 hook，避免不必要的副作用。
    try {
      kairosController?.notifyMainAgentRunStart();
    } catch (err) {
      logMain("kairos notifyMainAgentRunStart threw", { error: err instanceof Error ? err.message : String(err) });
    }
    try {
      // exploreModelId 是全局设置，不由 renderer 每轮上送；在 main 从 settings 注入到 turn 输入。
      const turnInput: RunAgentInput = {
        ...input,
        exploreModelId: input.exploreModelId ?? getSettingsService().get().agent.exploreModelId,
      };
      const result = await runAndPersistAgentRun(
        turnInput,
        roots,
        getMainWindow,
        approvalRegistry,
        (workspaceRoot, runtimeOptions) => {
          const browserBridge = getBrowserBridgeService(roots);
          return loadMainAgentRuntimeContext({
            dataRoot: roots.dataRoot,
            workspaceRoot,
            readPromptFile: () => getSettingsService().readAgentSystemPrompt(),
            disabledSkills: getSettingsService().get().skills.disabled,
            disabledTools: getSettingsService().get().agent.disabledTools,
            mode: runtimeOptions.mode,
            selectedSkills: runtimeOptions.selectedSkills,
            browserBridgeAbbPath: browserBridge.binPath,
            browserBridgeSocketPath: browserBridge.socketPath,
            warn: logMain,
          });
        },
        getModelRuntimeService(),
      );
      logMain("agent run completed", {
        sessionId: input.sessionId,
        agentRunId: input.agentRunId,
        status: result.status,
      });
      return result;
    } catch (error) {
      logMain("agent run failed", {
        sessionId: input.sessionId,
        agentRunId: input.agentRunId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      try {
        kairosController?.notifyMainAgentRunEnd();
      } catch (err) {
        logMain("kairos notifyMainAgentRunEnd threw", { error: err instanceof Error ? err.message : String(err) });
      }
    }
  });

  ipcMain.handle("agent:abort-run", async (_event, input: AbortAgentRunInput) => {
    return abortAgentRun(input);
  });

  ipcMain.handle("context:compact", async (_event, input: CompactContextInput) => {
    const roots = await ensureDataDirectories();
    return compactAndPersistContext(
      input,
      roots,
      getMainWindow,
      (workspaceRoot) => {
        const browserBridge = getBrowserBridgeService(roots);
        return loadMainAgentRuntimeContext({
          dataRoot: roots.dataRoot,
          workspaceRoot,
          readPromptFile: () => getSettingsService().readAgentSystemPrompt(),
          disabledSkills: getSettingsService().get().skills.disabled,
          disabledTools: getSettingsService().get().agent.disabledTools,
          browserBridgeAbbPath: browserBridge.binPath,
          browserBridgeSocketPath: browserBridge.socketPath,
          warn: logMain,
        });
      },
      getModelRuntimeService(),
    );
  });

  ipcMain.handle("eval:generate-candidate", async (_event, input: GenerateEvalCandidateInput) => {
    const roots = await ensureDataDirectories();
    return generateEvalCandidate(input, roots, undefined, getModelRuntimeService());
  });

  ipcMain.handle("dialog:select-files", async (): Promise<SelectFilesResult> => {
    const result = await dialog.showOpenDialog({
      title: "Attach files",
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "Supported files", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "heic", "heif", "pdf", "md", "txt", "json", "csv", "ts", "tsx", "js", "jsx", "html", "css"] },
        { name: "All files", extensions: ["*"] },
      ],
    });
    if (result.canceled) {
      return { canceled: true, attachments: [] };
    }

    return {
      canceled: false,
      attachments: result.filePaths.map(attachmentFromPath),
    };
  });

  ipcMain.handle("dialog:select-images", async (): Promise<SelectImagesResult> => {
    const result = await dialog.showOpenDialog({
      title: "Select images",
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "heic", "heif"] },
      ],
    });
    if (result.canceled) {
      return { canceled: true, attachments: [] };
    }
    return {
      canceled: false,
      attachments: result.filePaths.map(attachmentFromPath).filter((attachment) => attachment.kind === "image"),
    };
  });

  ipcMain.handle("dialog:select-workspace-directory", async (): Promise<SelectWorkspaceDirectoryResult> => {
    const result = await dialog.showOpenDialog({
      title: "Add workspace",
      properties: ["openDirectory"],
    });
    if (result.canceled || !result.filePaths[0]) {
      return { canceled: true };
    }

    return {
      canceled: false,
      workspaceRoot: result.filePaths[0],
    };
  });

  ipcMain.handle(
    "workspace:get-git-context",
    async (_event, input: WorkspaceGitContextInput): Promise<WorkspaceGitContext> => {
      const roots = await ensureDataDirectories();
      return getWorkspaceGitContext(input.workspaceRoot ?? roots.defaultWorkspaceRoot);
    },
  );

  ipcMain.handle(
    "workspace:create-folder",
    async (_event, input: WorkspaceCreateFolderInput): Promise<WorkspaceCreateFolderResult> => {
      const roots = await ensureDataDirectories();
      const sessions = await listSessionRecords(roots.sessionRoot);
      return createWorkspaceFolder({
        dataRoot: roots.dataRoot,
        defaultWorkspaceRoot: roots.defaultWorkspaceRoot,
        fallbackWorkspaceRoot: roots.workspaceRoot,
        sessions,
      }, input);
    },
  );

  ipcMain.handle("visualize:convert-reply", async (_event, input: VisualizeReplyInput) => {
    const roots = await ensureDataDirectories();
    try {
      const result = await visualizeReply(input, roots, {
        resolveMainModel: (requestedModel) => {
          const resolution = getModelRuntimeService().resolveMainModel(requestedModel);
          return "model" in resolution
            ? { ok: true, llmConfig: resolution.model.llmConfig }
            : { ok: false, message: resolution.message };
        },
      });
      logMain("visualize reply", {
        sessionId: input.sessionId,
        messageId: input.messageId,
        regenerate: input.regenerate === true,
        cached: result.cached,
        model: result.model,
        provider: result.provider,
        totalTokens: result.usage?.totalTokens,
      });
      return result;
    } catch (error) {
      logMain("visualize reply failed", {
        sessionId: input.sessionId,
        messageId: input.messageId,
        regenerate: input.regenerate === true,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  });

  ipcMain.handle("visualize:list", async (_event, input: ListVisualizationsInput) => {
    const roots = await ensureDataDirectories();
    return listVisualizations(input, roots);
  });

  ipcMain.handle("workspace:list", async (): Promise<WorkspaceListResult> => {
    const roots = await ensureDataDirectories();
    return readWorkspaceRegistryForRoots(roots);
  });

  ipcMain.handle("workspace:open-in-ide", async (_event, input: WorkspaceIdInput) => {
    const roots = await ensureDataDirectories();
    return openWorkspaceInIde(await workspaceRegistryOptionsForRoots(roots), input.workspaceId);
  });

  ipcMain.handle("workspace:set-visibility", async (_event, input: WorkspaceVisibilityInput) => {
    const roots = await ensureDataDirectories();
    return setWorkspaceHidden(await workspaceRegistryOptionsForRoots(roots), input.workspaceId, input.hidden);
  });

  ipcMain.handle("workspace:list-dir", async (_event, input: WorkspaceListDirInput) => {
    const roots = await ensureDataDirectories();
    return listWorkspaceDir(input, roots);
  });

  ipcMain.handle("workspace:read-file", async (_event, input: WorkspaceReadFileInput) => {
    const roots = await ensureDataDirectories();
    return readWorkspaceFile(input, roots);
  });

  ipcMain.handle("workspace:stat-file", async (_event, input: WorkspaceStatFileInput) => {
    const roots = await ensureDataDirectories();
    return statWorkspaceFile(input, roots);
  });

  ipcMain.handle("session:read-artifact", async (_event, input: SessionArtifactReadInput) => {
    const roots = await ensureDataDirectories();
    return readSessionArtifact(input, roots);
  });

  ipcMain.handle("artifact:show-context-menu", async (event, input: ArtifactContextMenuInput) => {
    const roots = await ensureDataDirectories();
    const window = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    return showArtifactContextMenu(input, roots, window);
  });

  ipcMain.handle("review:init-git", async (_event, input: ReviewInitGitInput = {}) => {
    const roots = await ensureDataDirectories();
    return initializeGitRepository(input, roots);
  });

  ipcMain.handle("review:get-snapshot", async (_event, input: ReviewGetSnapshotInput) => {
    const roots = await ensureDataDirectories();
    return getReviewCoordinator(roots).getSnapshot(input);
  });

  ipcMain.handle("review:refresh-snapshot", async (_event, input: ReviewGetSnapshotInput) => {
    const roots = await ensureDataDirectories();
    return getReviewCoordinator(roots).refreshSnapshot(input);
  });

  ipcMain.handle("review:get-file-diffs", async (_event, input: ReviewGetFileDiffsInput) => {
    const roots = await ensureDataDirectories();
    return getReviewCoordinator(roots).getFileDiffs(input);
  });

  ipcMain.handle("review:get-file-contents", async (_event, input: ReviewGetFileContentsInput) => {
    const roots = await ensureDataDirectories();
    return getReviewCoordinator(roots).getFileContents(input);
  });

  ipcMain.handle("review:apply-mutation", async (_event, input: ReviewApplyMutationInput) => {
    const roots = await ensureDataDirectories();
    return getReviewCoordinator(roots).applyMutation(input);
  });

  ipcMain.handle("review:set-file-viewed", async (_event, input: ReviewSetFileViewedInput) => {
    const roots = await ensureDataDirectories();
    return getReviewCoordinator(roots).setFileViewed(input);
  });

  ipcMain.handle("review:list-branches", async (_event, input: ReviewWorkspaceInput) => {
    const roots = await ensureDataDirectories();
    const resolved = await resolveReviewWorkspace(roots, input);
    if (!resolved.ok) return { ok: false, code: "invalid_workspace", message: resolved.message };
    try {
      return { ok: true, branches: await getReviewGitEngine(roots).listBranches(resolved.workspace) };
    } catch (error) {
      return { ok: false, code: "command_failed", message: safeErrorMessage(error) };
    }
  });

  ipcMain.handle("review:copy-apply-command", async (_event, input: ReviewCopyApplyCommandInput) => {
    const roots = await ensureDataDirectories();
    const loaded = await getReviewCoordinator(roots).getLoadedSnapshot(input);
    if (!loaded.ok) return loaded;
    try {
      const patch = await getReviewGitEngine(roots).createPatch(loaded.workspace, loaded.snapshot);
      const directory = join(roots.tmpRoot, "review-patches");
      await mkdir(directory, { recursive: true });
      const patchPath = join(directory, `${loaded.snapshot.id}.patch`);
      await writeFile(patchPath, patch, "utf8");
      return { ok: true, patchPath, command: `git apply -- ${quoteShellArgument(patchPath)}` };
    } catch (error) {
      return { ok: false, code: "command_failed", message: safeErrorMessage(error) };
    }
  });

  ipcMain.handle("review:get-pr-capability", async (_event, input: ReviewWorkspaceInput & { baseBranch?: string }) => {
    const roots = await ensureDataDirectories();
    const resolved = await resolveReviewWorkspace(roots, input);
    if (!resolved.ok) return { ok: false, code: "invalid_workspace", message: resolved.message };
    return getReviewPullRequestService().getCapability(resolved.workspace.workspaceRoot, input.baseBranch);
  });

  ipcMain.handle("review:create-pr", async (_event, input: ReviewCreatePullRequestInput) => {
    const roots = await ensureDataDirectories();
    const resolved = await resolveReviewWorkspace(roots, input);
    if (!resolved.ok) return { ok: false, code: "invalid_workspace", message: resolved.message };
    const result = await getReviewPullRequestService().create({
      workspaceRoot: resolved.workspace.workspaceRoot,
      title: input.title,
      body: input.body,
      baseBranch: input.baseBranch,
      draft: input.draft,
    });
    if (result.ok) await shell.openExternal(result.url);
    return result;
  });

  ipcMain.handle("workspace-environment:get", async (_event, input: WorkspaceEnvironmentGetInput = {}) => {
    const roots = await ensureDataDirectories();
    const workspaceRoot = await requireRegisteredWorkspaceRoot(roots, input.workspaceRoot);
    return getWorkspaceEnvironment({ ...input, workspaceRoot }, roots);
  });

  ipcMain.handle("workspace-environment:create-branch", async (_event, input: WorkspaceGitCreateBranchInput) => {
    const roots = await ensureDataDirectories();
    const workspaceRoot = await requireRegisteredWorkspaceRoot(roots, input.workspaceRoot);
    return createWorkspaceBranch({ ...input, workspaceRoot }, roots);
  });

  ipcMain.handle("workspace-environment:commit", async (_event, input: WorkspaceGitCommitInput) => {
    const roots = await ensureDataDirectories();
    const workspaceRoot = await requireRegisteredWorkspaceRoot(roots, input.workspaceRoot);
    return commitWorkspaceChanges({ ...input, workspaceRoot }, roots);
  });

  ipcMain.handle("workspace-environment:push", async (_event, input: WorkspaceGitPushInput) => {
    const roots = await ensureDataDirectories();
    const workspaceRoot = await requireRegisteredWorkspaceRoot(roots, input.workspaceRoot);
    return pushWorkspaceBranch({ ...input, workspaceRoot }, roots);
  });

  ipcMain.handle("workspace-environment:commit-and-push", async (_event, input: WorkspaceGitCommitAndPushInput) => {
    const roots = await ensureDataDirectories();
    const workspaceRoot = await requireRegisteredWorkspaceRoot(roots, input.workspaceRoot);
    return commitAndPushWorkspaceChanges({ ...input, workspaceRoot }, roots);
  });

  ipcMain.handle("workspace-open:list-tools", async () => listWorkspaceOpenTools(undefined, async ({ bundlePath, iconPath }) => {
    const cacheKey = iconPath ?? bundlePath;
    const cached = workspaceAppIconCache.get(cacheKey);
    if (cached) return cached;
    try {
      const bundleThumbnail = await nativeImage.createThumbnailFromPath(bundlePath, { width: 32, height: 32 });
      const resourceThumbnail = bundleThumbnail.isEmpty() && iconPath
        ? await nativeImage.createThumbnailFromPath(iconPath, { width: 32, height: 32 })
        : undefined;
      const icon = !bundleThumbnail.isEmpty()
        ? bundleThumbnail
        : resourceThumbnail && !resourceThumbnail.isEmpty()
          ? resourceThumbnail
          : await app.getFileIcon(bundlePath, { size: "small" });
      const dataUrl = icon.isEmpty() ? "" : icon.toDataURL();
      if (dataUrl) workspaceAppIconCache.set(cacheKey, dataUrl);
      return dataUrl || undefined;
    } catch (error) {
      console.warn("Failed to load native workspace app icon", { bundlePath, error });
      return undefined;
    }
  }));

  ipcMain.handle("workspace-open:open", async (_event, input: WorkspaceOpenInput) => {
    const roots = await ensureDataDirectories();
    const workspaceRoot = await requireRegisteredWorkspaceRoot(roots, input.workspaceRoot);
    return openWorkspaceInTool({ ...input, workspaceRoot }, roots);
  });

  ipcMain.handle("context:describe", async (_event, input: DescribeContextInput) => {
    const roots = await ensureDataDirectories();
    try {
      return await describeSessionContext(input, roots, (workspaceRoot) => {
        const browserBridge = getBrowserBridgeService(roots);
        return loadMainAgentRuntimeContext({
          dataRoot: roots.dataRoot,
          workspaceRoot,
          readPromptFile: () => getSettingsService().readAgentSystemPrompt(),
          disabledSkills: getSettingsService().get().skills.disabled,
          disabledTools: getSettingsService().get().agent.disabledTools,
          browserBridgeAbbPath: browserBridge.binPath,
          browserBridgeSocketPath: browserBridge.socketPath,
          warn: logMain,
        });
      }, getModelRuntimeService());
    } catch (error) {
      logMain("describe context failed", {
        sessionId: input.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  });

  ipcMain.handle("session:list", async (_event, input: SessionListInput = {}) => {
    const roots = await ensureDataDirectories();
    return listSessionRecords(roots.sessionRoot, input);
  });

  ipcMain.handle("session:get", async (_event, input: SessionGetInput) => {
    const roots = await ensureDataDirectories();
    return readSessionRecord(createSessionStorePaths(join(roots.sessionRoot, input.sessionId)));
  });

  ipcMain.handle("agent-trace:list", async (_event, input: AgentTraceListInput) => {
    const roots = await ensureDataDirectories();
    return listAgentTraces(roots.sessionRoot, input);
  });

  ipcMain.handle("agent-trace:read", async (_event, input: AgentTraceReadInput) => {
    const roots = await ensureDataDirectories();
    return readAgentTrace(roots.sessionRoot, input);
  });

  ipcMain.handle("agent-analysis:index", async (_event, input: AgentAnalysisIndexInput) => {
    const roots = await ensureDataDirectories();
    return getAgentAnalysisIndex(roots.sessionRoot, input);
  });

  ipcMain.handle("agent-trace:clear", async (_event, input: AgentTraceClearInput) => {
    const roots = await ensureDataDirectories();
    return clearAgentTraces(roots.sessionRoot, input);
  });

  ipcMain.handle("session:get-preview", async (_event, input: SessionPreviewInput) => {
    const roots = await ensureDataDirectories();
    return getSessionPreview(input, roots);
  });

  ipcMain.handle("subagent:get-transcript", async (_event, input: SubAgentTranscriptGetInput) => {
    const roots = await ensureDataDirectories();
    const ref = input.transcriptRef;
    return readSubAgentTranscript(
      createSessionStorePaths(join(roots.sessionRoot, ref.sessionId)),
      ref,
    );
  });

  ipcMain.handle("usage-statistics:get", async (_event, input: UsageStatisticsGetInput) => {
    const roots = await ensureDataDirectories();
    const range = input.range ?? "month";
    const scope = input.scope ?? (input.sessionId ? "session" : "global");

    if (scope === "session") {
      if (!input.sessionId) return null;
      const record = await readSessionRecord(
        createSessionStorePaths(join(roots.sessionRoot, input.sessionId)),
      );
      if (!record) return null;
      return createUsageStatisticsSnapshot(record, range, undefined, input.requestRowsPage);
    }

    // scope === "global" —— 跨所有普通对话 session + Kairos 自主模式的全部历史事件聚合。
    const [sessionRecords, kairosEvents] = await Promise.all([
      loadAllSessionRecords(roots.sessionRoot),
      loadAllKairosEvents(join(roots.dataRoot, "kairos", "memory", "short-term")),
    ]);
    return createGlobalUsageStatisticsSnapshot({
      sessionRecords,
      kairosEvents,
      range,
      requestRowsPage: input.requestRowsPage,
    });
  });

  ipcMain.handle("deepseek:balance:get", async () => {
    try {
      const runtime = getSettingsService().getProviderRuntimeConfig("deepseek");
      return await getDeepSeekBalanceSnapshot("code" in runtime ? undefined : runtime);
    } catch (error) {
      logMain("deepseek balance fetch failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  });

  ipcMain.handle("kimi:balance:get", async () => {
    try {
      const runtime = getSettingsService().getProviderRuntimeConfig("kimi");
      return await getKimiBalanceSnapshot("code" in runtime ? undefined : runtime);
    } catch (error) {
      logMain("kimi balance fetch failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  });

  ipcMain.handle("provider:balance:get", async (_event, input: ProviderBalanceGetInput) => {
    if (!isProviderId(input?.provider)) throw new Error("未知服务商。");
    try {
      const runtime = input.provider === "openrouter"
        ? getSettingsService().getOpenRouterManagementRuntimeConfig()
        : getSettingsService().getProviderRuntimeConfig(input.provider);
      if ("code" in runtime) {
        if (runtime.code === "api_key_missing") return getProviderBalanceSnapshot(input.provider, undefined);
        throw new Error(runtime.message);
      }
      return await getProviderBalanceSnapshot(input.provider, runtime);
    } catch (error) {
      logMain("provider balance fetch failed", {
        provider: input.provider,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  });

  ipcMain.handle("session:create", async (_event, input: SessionCreateInput = {}) => {
    const roots = await ensureDataDirectories();
    const workspace = await resolveWorkspaceForRoots(roots, input);
    if (workspace.ok === false) {
      throw new Error(workspace.error);
    }
    return createSessionRecord(roots.sessionRoot, {
      ...input,
      workspaceId: workspace.workspaceId,
      workspaceRoot: workspace.workspaceRoot,
    });
  });

  ipcMain.handle("session:fork", async (_event, input: SessionForkInput) => {
    if (isSessionAgentRunActive(input.sessionId)) {
      throw new Error("Cannot fork a session while its turn is running or waiting for approval.");
    }
    const roots = await ensureDataDirectories();
    return forkSessionRecord(roots.sessionRoot, input.sessionId);
  });

  ipcMain.handle("session:pin", async (_event, input: SessionPinInput) => {
    const roots = await ensureDataDirectories();
    const result = await setSessionPinned(roots.sessionRoot, input.sessionId, input.pinned);
    if (!result.ok) {
      logMain("session pin failed", { sessionId: input.sessionId, error: result.error });
    }
    return result;
  });

  ipcMain.handle("session:rename", async (_event, input: SessionRenameInput) => {
    const roots = await ensureDataDirectories();
    const result = await setSessionTitle(roots.sessionRoot, input.sessionId, input.title);
    if (!result.ok) {
      logMain("session rename failed", { sessionId: input.sessionId, error: result.error });
    }
    return result;
  });

  ipcMain.handle("session:set-workspace", async (_event, input: SessionWorkspaceInput) => {
    const roots = await ensureDataDirectories();
    const workspace = await resolveWorkspaceForRoots(roots, input);
    if (workspace.ok === false) {
      const result = { ok: false, error: workspace.error };
      logMain("session workspace update failed", { sessionId: input.sessionId, error: result.error });
      return result;
    }
    const result = await setSessionWorkspace(
      roots.sessionRoot,
      input.sessionId,
      workspace.workspaceRoot,
      workspace.workspaceId,
    );
    if (!result.ok) {
      logMain("session workspace update failed", { sessionId: input.sessionId, error: result.error });
    }
    return result;
  });

  ipcMain.handle("session:archive", async (_event, input: SessionArchiveInput) => {
    const roots = await ensureDataDirectories();
    if (input.archived) await terminalSessionService?.closeSession(input.sessionId);
    const result = await setSessionArchived(roots.sessionRoot, input.sessionId, input.archived);
    if (!result.ok) {
      logMain("session archive failed", { sessionId: input.sessionId, error: result.error });
    }
    return result;
  });

  ipcMain.handle("session:archive-many", async (_event, input: SessionArchiveManyInput) => {
    const roots = await ensureDataDirectories();
    const sessionIds = [...new Set(input.sessionIds.filter(Boolean))];
    const archivedSessionIds: string[] = [];
    const failedSessionIds: string[] = [];

    for (const sessionId of sessionIds) {
      if (isSessionAgentRunActive(sessionId)) {
        failedSessionIds.push(sessionId);
        continue;
      }
      try {
        await terminalSessionService?.closeSession(sessionId);
        const result = await setSessionArchived(roots.sessionRoot, sessionId, true);
        (result.ok ? archivedSessionIds : failedSessionIds).push(sessionId);
      } catch {
        failedSessionIds.push(sessionId);
      }
    }

    return {
      ok: failedSessionIds.length === 0,
      archivedSessionIds,
      failedSessionIds,
    };
  });

  ipcMain.handle("approval:decide", async (_event, input: ApprovalDecideInput) => {
    logMain("approval decision received", { requestId: input.requestId, decision: input.decision });
    return approvalRegistry.decide(input.requestId, input.decision);
  });

  ipcMain.handle("approval:list-pending", async (_event, input: ApprovalListPendingInput = {}) => {
    return approvalRegistry.listPending(input.sessionId);
  });

  // ─── 设置 ───
  ipcMain.handle("settings:get", async () => {
    return getSettingsService().get();
  });

  ipcMain.handle("providers:list", async (): Promise<ProvidersListResult> => ({
    providers: getSettingsService().getV2().providers,
  }));

  ipcMain.handle("providers:connect", async (_event, input: ProviderConnectInput): Promise<ProviderOperationResult> => {
    if (!isProviderId(input?.provider)) return providerOperationFailure("invalid_provider", "未知服务商。");
    try {
      await getSettingsService().updateProviderConnection({
        provider: input.provider,
        apiKey: input.apiKey,
        managementKey: input.managementKey,
        baseUrl: input.baseUrl,
        proxy: input.proxy,
        defaultPricingMultiplier: input.defaultPricingMultiplier,
        enabled: true,
      });
      return { ok: true, provider: getSettingsService().getV2().providers[input.provider] };
    } catch (error) {
      return providerOperationFailure(providerErrorCode(error), safeErrorMessage(error));
    }
  });

  ipcMain.handle("provider-credentials:add", async (_event, input: ProviderCredentialAddInput): Promise<ProviderCredentialOperationResult> => {
    if (!isProviderId(input?.provider)) return { ok: false, error: { code: "invalid_provider", message: "未知服务商。" } };
    try {
      await getSettingsService().addProviderCredential(input);
      return { ok: true, provider: getSettingsService().getV2().providers[input.provider] };
    } catch (error) {
      return { ok: false, error: { code: providerErrorCode(error), message: safeErrorMessage(error) } };
    }
  });

  ipcMain.handle("provider-credentials:update", async (_event, input: ProviderCredentialUpdateInput): Promise<ProviderCredentialOperationResult> => {
    if (!isProviderId(input?.provider)) return { ok: false, error: { code: "invalid_provider", message: "未知服务商。" } };
    try {
      const result = await getSettingsService().updateProviderCredential(
        input.provider,
        input.credentialId,
        input.label,
        input.pricingMultiplier,
      );
      if ("code" in result) return { ok: false, error: { code: result.code, message: result.message, references: result.references } };
      return { ok: true, provider: getSettingsService().getV2().providers[input.provider] };
    } catch (error) {
      return { ok: false, error: { code: providerErrorCode(error), message: safeErrorMessage(error) } };
    }
  });

  ipcMain.handle("provider-credentials:test", async (_event, input: ProviderCredentialInput): Promise<ProviderCredentialOperationResult> => {
    if (!isProviderId(input?.provider)) return { ok: false, error: { code: "invalid_provider", message: "未知服务商。" } };
    const runtime = getSettingsService().getProviderRuntimeConfigForCredential(input.provider, input.credentialId);
    if ("code" in runtime) return { ok: false, error: { code: "credential_not_found", message: runtime.message } };
    const probe = await testProviderConnection(runtime);
    const marked = await getSettingsService().markProviderCredentialConnectionResult(input.provider, input.credentialId, probe);
    if ("code" in marked) return { ok: false, error: { code: marked.code, message: marked.message } };
    if (!probe.ok) return { ok: false, error: { code: "connection_failed", message: probe.message, errorKind: probe.errorKind } };
    return { ok: true, provider: getSettingsService().getV2().providers[input.provider] };
  });

  ipcMain.handle("provider-credentials:remove", async (_event, input: ProviderCredentialInput): Promise<ProviderCredentialOperationResult> => {
    if (!isProviderId(input?.provider)) return { ok: false, error: { code: "invalid_provider", message: "未知服务商。" } };
    try {
      const result = await getSettingsService().removeProviderCredential(input.provider, input.credentialId);
      if ("code" in result) return { ok: false, error: { code: result.code, message: result.message, references: result.references } };
      await reconcileKairosModelChange(await ensureDataDirectories());
      return { ok: true, provider: getSettingsService().getV2().providers[input.provider] };
    } catch (error) {
      return { ok: false, error: { code: providerErrorCode(error), message: safeErrorMessage(error) } };
    }
  });

  ipcMain.handle("providers:update", async (_event, input: ProviderUpdateInput): Promise<ProviderOperationResult> => {
    if (!isProviderId(input?.provider)) return providerOperationFailure("invalid_provider", "未知服务商。");
    try {
      await getSettingsService().updateProviderConnection(input);
      await reconcileKairosModelChange(await ensureDataDirectories());
      return { ok: true, provider: getSettingsService().getV2().providers[input.provider] };
    } catch (error) {
      return providerOperationFailure(providerErrorCode(error), safeErrorMessage(error));
    }
  });

  ipcMain.handle("providers:test", async (_event, input: ProviderIdInput): Promise<ProviderTestResult> => {
    if (!isProviderId(input?.provider)) {
      return { ok: false, provider: emptyProviderView(), message: "未知服务商。", checkedAt: new Date().toISOString(), errorKind: "invalid_request" };
    }
    const runtime = getSettingsService().getProviderRuntimeConfig(input.provider);
    if ("code" in runtime) {
      return { ok: false, provider: getSettingsService().getV2().providers[input.provider], message: runtime.message, checkedAt: new Date().toISOString(), errorKind: "invalid_request" };
    }
    const result = await testProviderConnection(runtime);
    await getSettingsService().markProviderConnectionResult(input.provider, result);
    if (result.ok && input.provider === "openrouter") await getModelStoreService().ensureCuratedModelsInstalled();
    const provider = getSettingsService().getV2().providers[input.provider];
    return result.ok
      ? { ok: true, provider, message: result.message, checkedAt: result.checkedAt }
      : { ok: false, provider, message: result.message, checkedAt: result.checkedAt, errorKind: result.errorKind ?? "network", ...(result.statusCode && { statusCode: result.statusCode }) };
  });

  ipcMain.handle("providers:disconnect", async (_event, input: ProviderIdInput): Promise<ProviderOperationResult> => {
    if (!isProviderId(input?.provider)) return providerOperationFailure("invalid_provider", "未知服务商。");
    try {
      await getSettingsService().updateProviderConnection({
        provider: input.provider,
        apiKey: null,
        ...(input.provider === "openrouter" && { managementKey: null }),
      });
      await reconcileKairosModelChange(await ensureDataDirectories());
      return { ok: true, provider: getSettingsService().getV2().providers[input.provider] };
    } catch (error) {
      return providerOperationFailure(providerErrorCode(error), safeErrorMessage(error));
    }
  });

  ipcMain.handle("models:list-installed", async (): Promise<ModelsListInstalledResult> => ({ models: getModelStoreService().listInstalledModels() }));
  ipcMain.handle("models:list-usable", async (_event, input: ModelsListUsableInput): Promise<ModelsListUsableResult> => {
    const purpose = ["chat", "utility", "explore", "kairos", "vision"].includes(input?.purpose) ? input.purpose : "chat";
    return { models: getModelRuntimeService().listUsableModels(purpose) };
  });
  ipcMain.handle("models:catalog:list", async (_event, input: ModelsCatalogListInput): Promise<ModelsCatalogListResult> => ({
    provider: "openrouter",
    ...getOpenRouterCatalogService().list(input?.query),
  }));
  ipcMain.handle("models:catalog:reload", async (): Promise<ModelsCatalogListResult> => {
    const runtime = getSettingsService().getProviderRuntimeConfig("openrouter");
    if ("code" in runtime) return { provider: "openrouter", ...getOpenRouterCatalogService().list(), error: { code: runtime.code, message: runtime.message } };
    const result = await getOpenRouterCatalogService().reload(runtime);
    if (!result.error && result.state === "fresh") {
      await getModelStoreService().refreshInstalledCatalogModels();
    }
    return { provider: "openrouter", ...result };
  });
  ipcMain.handle("models:add", async (_event, input: ModelsAddInput): Promise<ModelMutationResult> => {
    if ((input?.provider !== "openrouter" && input?.provider !== "duckcoding") || typeof input.apiModel !== "string") {
      return { ok: false, error: { code: "invalid_model", message: "模型添加参数无效。" } };
    }
    return toModelMutationResult(input.provider === "openrouter"
      ? await getModelStoreService().addCatalogModel(input.provider, input.apiModel)
      : await getModelStoreService().addCustomModel({
        provider: "duckcoding",
        apiModel: input.apiModel,
        label: input.label,
        credentialId: input.credentialId,
        catalogModelId: input.catalogModelId,
        contextWindow: input.contextWindow,
        maxTokens: input.maxTokens,
      }));
  });
  ipcMain.handle("models:update", async (_event, input: ModelsUpdateInput): Promise<ModelMutationResult> => {
    const key = normalizeModelKey(input?.modelKey);
    if (!key || (input.enabled === undefined && input.customLabel === undefined && input.credentialId === undefined)) {
      return { ok: false, error: { code: "invalid_model", message: "模型更新参数无效。" } };
    }
    const result = await getModelStoreService().updateModelSettings(key, input);
    await reconcileKairosModelChange(await ensureDataDirectories());
    return toModelMutationResult(result);
  });
  ipcMain.handle("models:remove", async (_event, input: ModelsRemoveInput): Promise<ModelMutationResult> => {
    const key = normalizeModelKey(input?.modelKey);
    if (!key) return { ok: false, error: { code: "invalid_model", message: "模型标识无效。" } };
    return toModelMutationResult(await getModelStoreService().removeModel(key));
  });
  ipcMain.handle("task-models:update", async (_event, input: TaskModelsUpdateInput): Promise<TaskModelsUpdateResult> => {
    const purposeByField = { defaultChatModel: "chat", utilityModel: "utility", exploreModel: "explore" } as const;
    for (const [field, purpose] of Object.entries(purposeByField) as Array<[keyof typeof purposeByField, typeof purposeByField[keyof typeof purposeByField]]>) {
      const value = input?.[field];
      if (value === undefined || value === null) continue;
      const key = normalizeModelKey(value);
      if (!key || !("model" in resolveConfiguredModel(getModelStoreService().getModelSnapshot(), key, purpose))) throw new Error(`${field} 选择的模型不可用。`);
    }
    const next = await getSettingsService().updateV2({ taskModels: input });
    return { taskModels: next.taskModels };
  });
  ipcMain.handle("kairos-model:update", async (_event, input: KairosModelUpdateInput): Promise<KairosModelUpdateResult> => {
    const value = input?.modelKey;
    const key = value === null ? null : normalizeModelKey(value);
    if (value !== null && (!key || !("model" in resolveConfiguredModel(getModelStoreService().getModelSnapshot(), key, "kairos")))) {
      throw new Error("Kairos 选择的模型不可用。");
    }
    const next = await getSettingsService().updateV2({ kairos: { modelId: key } });
    await reconcileKairosModelChange(await ensureDataDirectories());
    return { modelKey: next.kairos.modelId };
  });

  ipcMain.handle("settings:read-agent-system-prompt", async () => {
    return getSettingsService().readAgentSystemPrompt();
  });

  ipcMain.handle("settings:write-agent-system-prompt", async (_event, input: { content?: unknown }) => {
    return getSettingsService().writeAgentSystemPrompt(typeof input.content === "string" ? input.content : "");
  });

  ipcMain.handle("settings:update", async (_event, input: SettingsUpdateInput) => {
    const service = getSettingsService();
    const beforeKairos = service.get().kairos;
    const next = await service.update(input);
    // Kairos 模型 / 思考链 / Skill 白名单来自 settings.json，且在 controller 创建时定型
    // （LLM 实例、skillCatalog 注入 guard 与 prompt）；保存后立即重建，保证下一次
    // Kairos 调用使用最新设置。其余 env-backed 设置（Key/工具/温度/bash 审查）由
    // 消费方按 turn 读 env proxy，下一轮自动生效。
    if (
      input.kairos &&
      (beforeKairos.modelId !== next.kairos.modelId ||
        beforeKairos.thinking !== next.kairos.thinking ||
        !sameStringSet(beforeKairos.enabledSkills, next.kairos.enabledSkills))
    ) {
      try {
        const roots = await ensureDataDirectories();
        await rebuildKairosController(roots);
      } catch (err) {
        logMain("kairos rebuild after settings update failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return next;
  });

  ipcMain.handle("settings:set-provider-key", async (_event, input: SetProviderKeyInput) => {
    const result = await getSettingsService().setProviderKey(input.provider, input.apiKey);
    logMain("settings set provider key", { provider: input.provider, ok: result.ok });
    return result;
  });

  ipcMain.handle("settings:clear-provider-key", async (_event, input: ClearProviderKeyInput) => {
    const result = await getSettingsService().clearProviderKey(input.provider);
    logMain("settings clear provider key", { provider: input.provider, ok: result.ok });
    return result;
  });

  ipcMain.handle(
    "settings:update-image-generation",
    async (_event, input: UpdateImageGenerationSettingsInput): Promise<UpdateImageGenerationSettingsResult> => {
      try {
        const settings = await getSettingsService().updateImageGeneration(input);
        logMain("settings update image generation", { ok: true, hasApiKey: settings.hasApiKey });
        return { ok: true, settings };
      } catch (error) {
        const message = error instanceof Error ? error.message : "图片生成配置保存失败。";
        logMain("settings update image generation", { ok: false, error: message });
        return { ok: false, error: message };
      }
    },
  );

  ipcMain.handle("settings:test-connection", async (_event, input: TestConnectionInput) => {
    const service = getSettingsService();
    const runtime = service.getProviderRuntimeConfig(input.provider);
    if ("code" in runtime) {
      return { ok: false, message: runtime.message } satisfies TestConnectionResult;
    }
    const result = await testProviderConnection(runtime);
    await service.markProviderConnectionResult(input.provider, result);
    logMain("settings test connection", { provider: input.provider, ok: result.ok });
    return { ok: result.ok, message: result.message } satisfies TestConnectionResult;
  });

  ipcMain.handle("settings:search-usage", async () => {
    const result = await getSettingsService().getSearchUsage();
    logMain("settings search usage", { ok: result.ok });
    return result;
  });

  // ─── 插件：fs-watch 文件监听 ───
  ipcMain.handle("plugins:fs-watch:get-status", async () => {
    const roots = await ensureDataDirectories();
    return getFsWatchService(roots).getStatus();
  });

  ipcMain.handle("plugins:fs-watch:install", async (): Promise<FsWatchInstallResult> => {
    const roots = await ensureDataDirectories();
    const picked = await dialog.showOpenDialog({
      title: "选择 fs-watch 插件二进制",
      properties: ["openFile"],
    });
    if (picked.canceled || !picked.filePaths[0]) {
      return { ok: false, canceled: true };
    }
    const result = await getFsWatchService(roots).installFromFile(picked.filePaths[0]);
    logMain("fs-watch plugin install", { ok: result.ok, error: result.error });
    return result;
  });

  // 一键路径：校验仓库 → cargo build --release → 安装产物（编译可能耗时数分钟，renderer 侧给忙态）
  ipcMain.handle("plugins:fs-watch:install-from-repo", async (): Promise<FsWatchInstallResult> => {
    const roots = await ensureDataDirectories();
    const repoRoot = getSettingsService().get().plugins.repoRoot;
    if (!repoRoot) {
      return { ok: false, error: "尚未设置插件仓库路径，请先在上方选择包含 plugins/ 的仓库根目录。" };
    }
    const result = await getFsWatchService(roots).buildAndInstall(repoRoot);
    logMain("fs-watch plugin build-install", { ok: result.ok, error: result.error });
    return result;
  });

  ipcMain.handle("plugins:pick-repo-root", async (): Promise<FsWatchPickRootResult> => {
    const picked = await dialog.showOpenDialog({
      title: "选择插件仓库目录（actspace-agent 根目录）",
      properties: ["openDirectory"],
    });
    if (picked.canceled || !picked.filePaths[0]) return { canceled: true };
    return { canceled: false, path: picked.filePaths[0] };
  });

  // ─── 插件：browser-bridge / Browser Use 初始化 ───
  ipcMain.handle("plugins:browser-bridge:get-status", async () => {
    const roots = await ensureDataDirectories();
    const repoRoot = getSettingsService().get().plugins.repoRoot;
    return getBrowserBridgeService(roots).getStatus(repoRoot);
  });

  ipcMain.handle("plugins:browser-bridge:install-from-repo", async (): Promise<BrowserBridgeInstallResult> => {
    const roots = await ensureDataDirectories();
    const repoRoot = getSettingsService().get().plugins.repoRoot;
    if (!repoRoot) {
      return { ok: false, error: "尚未设置插件仓库路径，请先在上方选择包含 plugins/ 的仓库根目录。" };
    }
    const service = getBrowserBridgeService(roots);
    const result = await service.buildAndInstall(repoRoot);
    if (result.ok) {
      const host = await service.installNativeHost();
      if (!host.ok) {
        return {
          ...result,
          ok: false,
          error: `abb 已安装，但本机桥接注册失败：${host.error ?? "未知错误"}`,
        };
      }
    }
    logMain("browser-bridge build-install", { ok: result.ok, error: result.error });
    return result;
  });

  ipcMain.handle("plugins:browser-bridge:install-native-host", async (): Promise<BrowserBridgeActionResult> => {
    const roots = await ensureDataDirectories();
    const result = await getBrowserBridgeService(roots).installNativeHost();
    logMain("browser-bridge native host install", { ok: result.ok, error: result.error });
    return result;
  });

  ipcMain.handle("plugins:fs-watch:set-enabled", async (_event, input: FsWatchSetEnabledInput) => {
    const roots = await ensureDataDirectories();
    const service = getFsWatchService(roots);
    const enabled = input.enabled === true;
    // 先持久化用户意图；开启时顺带把 fs-watch Skill 并入 Kairos 白名单（用户可再手动移除）
    const settings = getSettingsService();
    const kairosSkills = settings.get().kairos.enabledSkills;
    const skillNewlyEnabled = enabled && !kairosSkills.includes("fs-watch");
    await settings.update({
      plugins: { fsWatch: { enabled } },
      ...(skillNewlyEnabled
        ? { kairos: { enabledSkills: [...kairosSkills, "fs-watch"] } }
        : {}),
    });
    if (enabled) {
      const result = await service.start();
      logMain("fs-watch plugin enabled", { ok: result.ok, error: result.error });
      if (!result.ok) return { ok: false, error: result.error };
    } else {
      await service.stop();
      logMain("fs-watch plugin disabled");
    }
    // Skill 白名单刚变化 → 重建 Kairos controller，让 catalog 段 + 只读授权立即生效
    // （这里绕过了 settings:update IPC，重建要自己触发）。失败只记日志。
    if (skillNewlyEnabled) {
      try {
        await rebuildKairosController(roots);
      } catch (err) {
        logMain("kairos rebuild after fs-watch enable failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return { ok: true };
  });

  ipcMain.handle("plugins:fs-watch:retry", async () => {
    const roots = await ensureDataDirectories();
    return getFsWatchService(roots).retry();
  });

  ipcMain.handle("plugins:fs-watch:get-config", async () => {
    const roots = await ensureDataDirectories();
    return getFsWatchService(roots).getConfig();
  });

  ipcMain.handle("plugins:fs-watch:update-config", async (_event, input: FsWatchConfigUpdateInput) => {
    const roots = await ensureDataDirectories();
    const service = getFsWatchService(roots);
    const before = (await service.getConfig()).roots;
    const next = await service.updateConfig(input);
    // 监听目录变化 → 重建 Kairos controller，让 guard 的只读授权（readOnlyRoots）跟上。
    // 与模型 / Skill 白名单变更同一套「停旧重建」机制；失败只记日志，不影响配置保存。
    if (!sameStringSet(before, next.roots)) {
      try {
        await rebuildKairosController(roots);
      } catch (err) {
        logMain("kairos rebuild after fs-watch roots update failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return next;
  });

  ipcMain.handle("plugins:fs-watch:pick-root", async (): Promise<FsWatchPickRootResult> => {
    const picked = await dialog.showOpenDialog({
      title: "选择要监听的目录",
      properties: ["openDirectory"],
    });
    if (picked.canceled || !picked.filePaths[0]) return { canceled: true };
    return { canceled: false, path: picked.filePaths[0] };
  });

  // ─── Skills 管理 ───
  ipcMain.handle("skills:list", async (_event, input: SkillListInput = {}) => {
    const roots = await ensureDataDirectories();
    const settings = getSettingsService().get();
    return listSkills({
      dataRoot: roots.dataRoot,
      workspaceRoot: input.workspaceRoot ?? roots.workspaceRoot,
      disabledForAgent: settings.skills.disabled,
      enabledForKairos: settings.kairos.enabledSkills,
      warn: logMain,
    });
  });

  ipcMain.handle("skills:install", async (): Promise<SkillInstallResult> => {
    const roots = await ensureDataDirectories();
    const picked = await dialog.showOpenDialog({
      title: "选择 Skill 目录（需包含 SKILL.md）",
      properties: ["openDirectory"],
    });
    if (picked.canceled || !picked.filePaths[0]) {
      return { ok: false, canceled: true };
    }
    const result = await installSkillFromDirectory(roots.dataRoot, picked.filePaths[0]);
    logMain("skill install", { ok: result.ok, name: result.name, error: result.error });
    return result;
  });

  ipcMain.handle("skills:uninstall", async (_event, input: SkillUninstallInput) => {
    const roots = await ensureDataDirectories();
    const result = await uninstallSkillDirectory(roots.dataRoot, input.directory);
    logMain("skill uninstall", { ok: result.ok, directory: input.directory, error: result.error });
    return result;
  });

  // ─── 本地更新 ───
  ipcMain.handle("local-update:get-state", async () => {
    return getLocalUpdateService().getState();
  });

  ipcMain.handle("local-update:select-source", async () => {
    const result = await dialog.showOpenDialog({
      title: "选择 actspace 源码目录",
      properties: ["openDirectory"],
    });
    if (result.canceled || !result.filePaths[0]) {
      return { canceled: true, state: await getLocalUpdateService().getState() };
    }
    const state = await getLocalUpdateService().setSourceRoot(result.filePaths[0]);
    logMain("local update source selected", { ok: state.sourceValid });
    return { canceled: false, state };
  });

  ipcMain.handle("local-update:start", async () => {
    const result = await getLocalUpdateService().start();
    logMain("local update start requested", { ok: result.ok, error: result.error });
    return result;
  });

  // 主题三态同步原生 chrome（交通灯 / 原生滚动条 / 右键菜单）。
  // fire-and-forget：renderer 的 applyAppearance 在切换与开机重放时各发一次。
  ipcMain.on("appearance:set-theme", (_event, mode: unknown) => {
    if (mode === "light" || mode === "dark" || mode === "system") {
      nativeTheme.themeSource = mode;
    }
  });
}

// ─── 启动 ───

configureAppPaths();
loadEnv();

process.on("uncaughtException", (error) => {
  logMain("process uncaught exception", {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
});

process.on("unhandledRejection", (reason) => {
  logMain("process unhandled rejection", {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

app.whenReady().then(async () => {
  app.setAppUserModelId(APP_ID);
  const roots = await ensureDataDirectories();
  void enforceAgentTraceRetention(roots.sessionRoot).then((result) => {
    if (result.filesDeleted > 0) {
      logMain("agent trace retention cleanup completed", result);
    }
  }).catch((error: unknown) => {
    logMain("agent trace retention cleanup failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  });
  // 先初始化设置：load() 会把持久化设置覆盖到 process.env 并刷新 env，
  // 这样后续的 Kairos 初始化与首个 agent turn 都能拿到生效后的配置。
  settingsService = new SettingsService({ dataRoot: roots.dataRoot, crypto: electronSecretCrypto });
  try {
    await settingsService.load();
    logMain("settings service ready", { dataRoot: roots.dataRoot });
  } catch (err) {
    logMain("settings service load failed", { error: err instanceof Error ? err.message : String(err) });
  }
  modelStoreService = new ModelStoreService({
    settings: settingsService,
    findCatalogModel: (apiModel) => openRouterCatalogService?.findModel(apiModel),
  });
  openRouterCatalogService = new OpenRouterCatalogService({
    dataRoot: roots.dataRoot,
    isAdded: (apiModel) => modelStoreService?.isCatalogModelAdded(apiModel) ?? false,
  });
  await openRouterCatalogService.load();
  modelRuntimeService = new ModelRuntimeService(settingsService, modelStoreService);
  localUpdateService = new LocalUpdateService({
    dataRoot: roots.dataRoot,
    appPath: process.execPath,
    isPackaged: IS_PACKAGED_BUILD,
    onReadyToReplace: () => {
      localUpdateQuitRequested = true;
      logMain("local update ready to replace, quitting app");
      app.quit();
    },
  });
  try {
    await localUpdateService.load();
    logMain("local update service ready", { dataRoot: roots.dataRoot, packaged: IS_PACKAGED_BUILD });
  } catch (err) {
    logMain("local update service load failed", { error: err instanceof Error ? err.message : String(err) });
  }
  initializeTerminalService(roots);
  await registerIpc();
  await ensureKairosConfigIpc(roots);
  await createMainWindow();
  // 后台 bash 任务终态 → 推给 renderer 更新对应块（turn 内外统一走 agent:stream）
  bashTaskRegistry.subscribe((task) => {
    if (task.status === "running") return;
    logMain("background bash task finished", {
      taskId: task.taskId,
      sessionId: task.sessionId,
      status: task.status,
      exitCode: task.exitCode,
    });
    getMainWindow()?.webContents.send("agent:stream", {
      type: "bash_task_update",
      sessionId: task.sessionId,
      taskId: task.taskId,
      status: task.status,
      exitCode: task.exitCode,
    });
  });
  // 看门狗事件：stalled（疑似等待交互输入）/ stall_recovered（输出恢复）→ 前端徽标切换
  bashTaskRegistry.subscribeNotifications((notification) => {
    if (notification.status !== "stalled" && notification.status !== "stall_recovered") return;
    getMainWindow()?.webContents.send("agent:stream", {
      type: "bash_task_update",
      sessionId: notification.sessionId,
      taskId: notification.taskId,
      status: notification.status === "stalled" ? "stalled" : "running",
    });
  });
  // Kairos 现在仅初始化骨架（preferences.enabled 默认 false → controller 进 stopped 状态）；
  // renderer 在 KairosPage 显式按"开启"才真正起 tick 循环。
  try {
    const controller = await ensureKairosController(roots);
    await controller.start();
  } catch (err) {
    logMain("kairos init failed", { error: err instanceof Error ? err.message : String(err) });
  }
  // fs-watch 插件：按持久化开关自动拉起（未安装/启动失败只记日志，不阻塞启动）
  if (getSettingsService().get().plugins.fsWatch.enabled) {
    try {
      const result = await getFsWatchService(roots).start();
      logMain("fs-watch plugin autostart", { ok: result.ok, error: result.error });
    } catch (err) {
      logMain("fs-watch plugin autostart failed", { error: err instanceof Error ? err.message : String(err) });
    }
  }

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// 优雅退出：Electron 的 before-quit 不会 await async 回调，要拦截退出必须
// event.preventDefault()，等 Kairos 收尾（停循环 + abort 正在飞的 LLM 请求 + flush 写盘）
// 再 app.exit(0)。5s 超时兜底强退，保证用户一定能关掉软件、不残留运行态。
let shuttingDown = false;
app.on("before-quit", (event) => {
  if (shuttingDown) return; // 第二次进入（finish 触发的 exit）直接放行
  // 后台 bash 任务收割：子进程是 detached 的，app 退出不会连带杀掉，
  // 必须显式对进程组发信号，绝不留孤儿 dev server。同步发 SIGTERM，best-effort。
  const harvested = bashTaskRegistry.harvestAll();
  if (harvested > 0) {
    logMain("harvested background bash tasks on quit", { count: harvested });
  }
  const terminalHarvested = terminalSessionService?.harvestAllSync() ?? 0;
  if (terminalHarvested > 0) {
    logMain("harvested terminal sessions on quit", { count: terminalHarvested });
  }
  // fs-watch 插件：同步 best-effort SIGTERM；插件自己会 flush 事件并写最后一次心跳
  fsWatchService?.shutdownSync();
  reviewCoordinator?.dispose();
  reviewGitWorkerClient?.dispose();
  if (!kairosController) {
    void disposeDesktopAgentRuntime();
    disposeTerminalIpc?.();
    kairosIpcHandle?.dispose();
    kairosConfigIpcHandle?.dispose();
    void closeProviderTransports();
    return;
  }
  shuttingDown = true;
  event.preventDefault();
  getMainWindow()?.webContents.send("app:shutting-down", {
    reason: localUpdateQuitRequested ? "local_update" : "normal",
  });

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    app.exit(0); // 强退，绕过 before-quit，避免再次拦截
  };
  const timer = setTimeout(() => {
    logMain("kairos shutdown timed out, forcing exit");
    finish();
  }, 5_000);

  void (async () => {
    try {
      await disposeDesktopAgentRuntime();
      await kairosController?.shutdown();
    } catch (err) {
      logMain("kairos shutdown threw", { error: err instanceof Error ? err.message : String(err) });
    } finally {
      clearTimeout(timer);
      kairosIpcHandle?.dispose();
      kairosConfigIpcHandle?.dispose();
      disposeTerminalIpc?.();
      await closeProviderTransports();
      finish();
    }
  })();
});
