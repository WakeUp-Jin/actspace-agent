/**
 * Electron Main 进程入口
 *
 * 职责：
 * - Electron 应用生命周期（app.whenReady / window-all-closed）
 * - 窗口创建与管理
 * - IPC 路由注册（把请求分发给对应模块）
 *
 * Agent turn 执行逻辑在 ./agent-turn.ts。
 */

import { app, BrowserWindow, dialog, ipcMain, nativeTheme, safeStorage } from "electron";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { access, mkdir } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import type {
  AbortTurnInput,
  ApprovalDecideInput,
  ApprovalListPendingInput,
  ClearProviderKeyInput,
  CompactContextInput,
  ComposerAttachment,
  DeepSeekBalanceSnapshot,
  KimiBalanceSnapshot,
  ProviderId,
  RunTurnInput,
  SelectFilesResult,
  SelectWorkspaceDirectoryResult,
  SessionArchiveInput,
  SessionCreateInput,
  SessionGetInput,
  SessionListInput,
  SessionPinInput,
  SessionPreviewInput,
  SessionRenameInput,
  SessionWorkspaceInput,
  SubAgentTranscriptGetInput,
  SetProviderKeyInput,
  SettingsUpdateInput,
  TestConnectionInput,
  TestConnectionResult,
  UsageStatisticsGetInput,
  ListVisualizationsInput,
  VisualizeReplyInput,
  DescribeContextInput,
  ReviewGetWorkspaceChangesInput,
  ReviewInitGitInput,
  WorkspaceListDirInput,
  WorkspaceListResult,
  WorkspaceReadFileInput,
} from "@actspace/shared";
import {
  createBootstrapState,
  createGlobalUsageStatisticsSnapshot,
  createUsageStatisticsSnapshot,
  getEnv,
  loadEnv,
  createSessionRecord,
  createSessionStorePaths,
  listSessionRecords,
  readSubAgentTranscript,
  readSessionRecord,
  setSessionArchived,
  setSessionPinned,
  setSessionTitle,
  setSessionWorkspace,
  createKairos,
  ShortMemoryStore,
  bashTaskRegistry,
  type KairosConfig,
  type KairosController,
} from "@actspace/agent-core";
import type { SessionEvent, SessionRecord } from "@actspace/shared";
import { runAndPersistTurn, abortTurn, type AgentRuntimeContextLoader, type AppDataRoots } from "./agent-turn";
import { compactAndPersistContext } from "./context-compact";
import { listVisualizations, visualizeReply } from "./visualize-service";
import { describeSessionContext } from "./context-describe-service";
import { loadMainAgentRuntimeContext } from "./agent-runtime-context";
import { listWorkspaceDir, readWorkspaceFile } from "./workspace-fs-service";
import { getWorkspaceGitChanges, initializeGitRepository } from "./review-git-service";
import { readWorkspaceRegistry, resolveWorkspaceSelection } from "./workspace-registry-service";
import { getSessionPreview } from "./session-preview-service";
import { LocalUpdateService } from "./local-update-service";
import { PendingApprovalRegistry } from "./approval-registry";
import {
  createKairosLlm,
  createKairosToolManagerFactory,
  getKairosWorkspaceRoot,
  resolveKairosContextWindow,
  resolveKairosModelId,
  resolveKairosThinkingEnabled,
  ensureKairosScaffolding,
} from "./kairos-bootstrap";
import { registerKairosIpc, type KairosIpcHandle } from "./kairos-ipc";
import { SettingsService, type SecretCrypto } from "./settings-service";
import { resolveAppDataRoots } from "./app-paths";

const APP_ID = "com.actspace.desktop";
const APP_NAME = "actspace";
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const PREVIEW_LIMIT = 160;
const DEEPSEEK_BALANCE_TIMEOUT_MS = 8_000;
const PROVIDER_TEST_TIMEOUT_MS = 8_000;

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

type DeepSeekBalanceApiInfo = {
  currency?: unknown;
  total_balance?: unknown;
};

type DeepSeekBalanceApiResponse = {
  is_available?: unknown;
  balance_infos?: unknown;
};

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
    isPackaged: app.isPackaged,
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

async function ensureDataDirectories(): Promise<AppDataRoots> {
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

function resolveDeepSeekBalanceUrl(baseUrl: string): string {
  const normalized = (baseUrl || "https://api.deepseek.com").replace(/\/+$/, "");
  const apiRoot = normalized.endsWith("/v1") ? normalized.slice(0, -3) : normalized;
  return `${apiRoot}/user/balance`;
}

function normalizeBalanceAmount(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return raw;
  return numeric.toFixed(2);
}

function selectDeepSeekDisplayBalance(response: DeepSeekBalanceApiResponse): DeepSeekBalanceSnapshot["displayBalance"] {
  if (!Array.isArray(response.balance_infos)) return null;
  const infos = response.balance_infos.filter((item): item is DeepSeekBalanceApiInfo => {
    return item !== null && typeof item === "object";
  });
  const preferred = infos.find((info) => info.currency === "CNY") ?? infos[0];
  if (!preferred || typeof preferred.currency !== "string") return null;

  const amount = normalizeBalanceAmount(preferred.total_balance);
  if (!amount) return null;
  return {
    amount,
    currency: preferred.currency.toUpperCase(),
  };
}

async function getDeepSeekBalanceSnapshot(): Promise<DeepSeekBalanceSnapshot> {
  const currentEnv = getEnv();
  if (!currentEnv.DEEPSEEK_API_KEY) {
    return {
      provider: "deepseek",
      isConfigured: false,
      isAvailable: null,
      generatedAt: new Date().toISOString(),
      displayBalance: null,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEEPSEEK_BALANCE_TIMEOUT_MS);

  try {
    const response = await fetch(resolveDeepSeekBalanceUrl(currentEnv.DEEPSEEK_BASE_URL), {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${currentEnv.DEEPSEEK_API_KEY}`,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`DeepSeek balance request failed with status ${response.status}.`);
    }

    const payload = (await response.json()) as DeepSeekBalanceApiResponse;
    return {
      provider: "deepseek",
      isConfigured: true,
      isAvailable: typeof payload.is_available === "boolean" ? payload.is_available : null,
      generatedAt: new Date().toISOString(),
      displayBalance: selectDeepSeekDisplayBalance(payload),
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("DeepSeek balance request timed out.");
    }
    throw error instanceof Error ? error : new Error("DeepSeek balance request failed.");
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Kimi（Moonshot）余额 ───

type MoonshotBalanceData = {
  available_balance?: unknown;
};

type MoonshotBalanceApiResponse = {
  code?: unknown;
  status?: unknown;
  data?: unknown;
};

/** Moonshot 余额端点：<root>/v1/users/me/balance（baseUrl 可能已含 /v1）。 */
function resolveKimiBalanceUrl(baseUrl: string): string {
  const normalized = (baseUrl || "https://api.moonshot.cn/v1").replace(/\/+$/, "");
  const root = normalized.endsWith("/v1") ? normalized.slice(0, -3) : normalized;
  return `${root}/v1/users/me/balance`;
}

function selectKimiDisplayBalance(payload: MoonshotBalanceApiResponse): KimiBalanceSnapshot["displayBalance"] {
  const data = payload.data;
  if (data === null || typeof data !== "object") return null;
  const amount = normalizeBalanceAmount((data as MoonshotBalanceData).available_balance);
  if (!amount) return null;
  // Moonshot 账户按人民币结算。
  return { amount, currency: "CNY" };
}

async function getKimiBalanceSnapshot(): Promise<KimiBalanceSnapshot> {
  const currentEnv = getEnv();
  if (!currentEnv.KIMI_API_KEY) {
    return {
      provider: "kimi",
      isConfigured: false,
      isAvailable: null,
      generatedAt: new Date().toISOString(),
      displayBalance: null,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEEPSEEK_BALANCE_TIMEOUT_MS);

  try {
    const response = await fetch(resolveKimiBalanceUrl(currentEnv.KIMI_BASE_URL), {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${currentEnv.KIMI_API_KEY}`,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Kimi balance request failed with status ${response.status}.`);
    }

    const payload = (await response.json()) as MoonshotBalanceApiResponse;
    return {
      provider: "kimi",
      isConfigured: true,
      isAvailable: typeof payload.status === "boolean" ? payload.status : null,
      generatedAt: new Date().toISOString(),
      displayBalance: selectKimiDisplayBalance(payload),
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Kimi balance request timed out.");
    }
    throw error instanceof Error ? error : new Error("Kimi balance request failed.");
  } finally {
    clearTimeout(timeout);
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
let localUpdateService: LocalUpdateService | undefined;
let localUpdateQuitRequested = false;

function getSettingsService(): SettingsService {
  if (!settingsService) {
    throw new Error("SettingsService 尚未初始化（应在 app.whenReady 内 load 之后再调用）。");
  }
  return settingsService;
}

function getLocalUpdateService(): LocalUpdateService {
  if (!localUpdateService) {
    throw new Error("LocalUpdateService is not initialized");
  }
  return localUpdateService;
}

function resolveProviderModelsUrl(baseUrl: string): string {
  const normalized = (baseUrl || "https://api.moonshot.cn/v1").replace(/\/+$/, "");
  return normalized.endsWith("/v1") ? `${normalized}/models` : `${normalized}/v1/models`;
}

/**
 * 轻量探测供应商连通性与 Key 有效性：
 * - DeepSeek 打余额端点，Kimi 打 `/models`，仅看 HTTP 状态码，不解析正文。
 * - 返回文案均为脱敏提示，绝不回传明文 Key。
 */
async function testProviderConnection(provider: ProviderId): Promise<TestConnectionResult> {
  const currentEnv = getEnv();
  const apiKey = provider === "deepseek" ? currentEnv.DEEPSEEK_API_KEY : currentEnv.KIMI_API_KEY;
  if (!apiKey) {
    return { ok: false, message: "尚未配置 API Key，请先填写并保存后再测试。" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TEST_TIMEOUT_MS);
  try {
    const url =
      provider === "deepseek"
        ? resolveDeepSeekBalanceUrl(currentEnv.DEEPSEEK_BASE_URL)
        : resolveProviderModelsUrl(currentEnv.KIMI_BASE_URL);
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (response.ok) {
      return { ok: true, message: "连接成功，API Key 有效。" };
    }
    if (response.status === 401 || response.status === 403) {
      return { ok: false, message: "鉴权失败：API Key 无效或权限不足。" };
    }
    return { ok: false, message: `连接失败：服务返回状态码 ${response.status}。` };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, message: "连接超时，请检查网络或稍后重试。" };
    }
    return {
      ok: false,
      message: "连接失败，请检查网络后重试。",
      detail: error instanceof Error ? error.message : undefined,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Electron 配置 ───

function configureAppPaths() {
  app.setName(APP_NAME);
  const userDataRoot = join(app.getPath("appData"), APP_NAME);
  app.setPath("userData", userDataRoot);
  initializeStartupLogging();
  logMain("app paths configured", { userDataRoot });
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

async function createMainWindow() {
  const preloadPath = join(__dirname, "..", "preload", "index.js");
  logMain("create main window start", { preloadPath });
  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1120,
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
    win.webContents.openDevTools({ mode: "detach" });
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
async function ensureKairosController(roots: AppDataRoots): Promise<KairosController> {
  if (kairosController) return kairosController;
  const kairosRoot = join(roots.dataRoot, "kairos");
  await ensureKairosScaffolding(kairosRoot);
  const kairosWorkspaceRoot = getKairosWorkspaceRoot(kairosRoot);
  // 模型 / 思考链真来源 = settings.json 的 kairos 分区。
  const kairosSettings = getSettingsService().get().kairos;
  const preferredModelId = kairosSettings.modelId;
  const resolvedModelId = resolveKairosModelId(preferredModelId);
  const llm = createKairosLlm(preferredModelId);
  const thinkingEnabled = resolveKairosThinkingEnabled(preferredModelId, kairosSettings.thinking);
  const toolManagerFactory = createKairosToolManagerFactory({
    workspaceRoot: kairosWorkspaceRoot,
    modelId: preferredModelId,
  });
  const contextWindow = resolveKairosContextWindow(preferredModelId);
  kairosController = await createKairos({
    kairosRoot,
    llm,
    modelId: resolvedModelId,
    toolManagerFactory,
    contextWindow,
    thinkingEnabled,
  });
  kairosIpcHandle = registerKairosIpc({
    controller: kairosController,
    kairosRoot,
    getMainWindow,
    onPreferencesWritten: (next) => {
      void reconcileKairosAfterPreferences(roots, next);
    },
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
  if (!kairosController) return;
  try {
    await kairosController.stop();
  } catch (err) {
    logMain("kairos rebuild: stop threw", { error: err instanceof Error ? err.message : String(err) });
  }
  kairosIpcHandle?.dispose();
  kairosController = undefined;
  kairosIpcHandle = undefined;
  const controller = await ensureKairosController(roots);
  await controller.start();
  logMain("kairos controller rebuilt with latest settings");
}

// ─── 审核注册表（单例） ───

const approvalRegistry = new PendingApprovalRegistry({
  onApprovalRequired: (request, sessionId, turnId) => {
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
    });
  },
  onApprovalResolved: (request, decision) => {
    const win = getMainWindow();
    if (!win) return;
    win.webContents.send("agent:stream", {
      type: "tool_approval_resolved",
      toolCallId: request.toolCallId ?? request.id,
      requestId: decision.requestId,
      decision: decision.decision,
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
      workspaceRoot: roots.defaultWorkspaceRoot,
    });
  });

  ipcMain.handle("agent:run-turn", async (_event, input: RunTurnInput) => {
    const roots = await ensureDataDirectories();
    // Kairos 礼让钩子：让正在 sleep 的 Kairos 让位给 user，turn 结束后 5s 才允许 Kairos 重新投 tick。
    // controller 尚未初始化时（用户没开启 Kairos）跳过 hook，避免不必要的副作用。
    try {
      kairosController?.notifyMainAgentTurnStart();
    } catch (err) {
      logMain("kairos notifyMainAgentTurnStart threw", { error: err instanceof Error ? err.message : String(err) });
    }
    try {
      // exploreModelId 是全局设置，不由 renderer 每轮上送；在 main 从 settings 注入到 turn 输入。
      const turnInput: RunTurnInput = {
        ...input,
        exploreModelId: input.exploreModelId ?? getSettingsService().get().agent.exploreModelId,
      };
      const result = await runAndPersistTurn(
        turnInput,
        roots,
        getMainWindow,
        approvalRegistry,
        (workspaceRoot) =>
          loadMainAgentRuntimeContext({
            dataRoot: roots.dataRoot,
            workspaceRoot,
            readPromptFile: () => getSettingsService().readAgentSystemPrompt(),
            warn: logMain,
          }),
      );
      logMain("run turn completed", {
        sessionId: input.sessionId,
        turnId: input.turnId,
        status: result.status,
      });
      return result;
    } catch (error) {
      logMain("run turn failed", {
        sessionId: input.sessionId,
        turnId: input.turnId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      try {
        kairosController?.notifyMainAgentTurnEnd();
      } catch (err) {
        logMain("kairos notifyMainAgentTurnEnd threw", { error: err instanceof Error ? err.message : String(err) });
      }
    }
  });

  ipcMain.handle("agent:abort-turn", async (_event, input: AbortTurnInput) => {
    return abortTurn(input);
  });

  ipcMain.handle("context:compact", async (_event, input: CompactContextInput) => {
    const roots = await ensureDataDirectories();
    return compactAndPersistContext(
      input,
      roots,
      getMainWindow,
      (workspaceRoot) =>
        loadMainAgentRuntimeContext({
          dataRoot: roots.dataRoot,
          workspaceRoot,
          readPromptFile: () => getSettingsService().readAgentSystemPrompt(),
          warn: logMain,
        }),
    );
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

  ipcMain.handle("visualize:convert-reply", async (_event, input: VisualizeReplyInput) => {
    const roots = await ensureDataDirectories();
    try {
      const result = await visualizeReply(input, roots);
      logMain("visualize reply", {
        sessionId: input.sessionId,
        messageId: input.messageId,
        cached: result.cached,
      });
      return result;
    } catch (error) {
      logMain("visualize reply failed", {
        sessionId: input.sessionId,
        messageId: input.messageId,
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

  ipcMain.handle("workspace:list-dir", async (_event, input: WorkspaceListDirInput) => {
    const roots = await ensureDataDirectories();
    return listWorkspaceDir(input, roots);
  });

  ipcMain.handle("workspace:read-file", async (_event, input: WorkspaceReadFileInput) => {
    const roots = await ensureDataDirectories();
    return readWorkspaceFile(input, roots);
  });

  ipcMain.handle("review:get-workspace-changes", async (_event, input: ReviewGetWorkspaceChangesInput = {}) => {
    const roots = await ensureDataDirectories();
    return getWorkspaceGitChanges(input, roots);
  });

  ipcMain.handle("review:init-git", async (_event, input: ReviewInitGitInput = {}) => {
    const roots = await ensureDataDirectories();
    return initializeGitRepository(input, roots);
  });

  ipcMain.handle("context:describe", async (_event, input: DescribeContextInput) => {
    const roots = await ensureDataDirectories();
    try {
      return await describeSessionContext(input, roots, (workspaceRoot) =>
        loadMainAgentRuntimeContext({
          dataRoot: roots.dataRoot,
          workspaceRoot,
          readPromptFile: () => getSettingsService().readAgentSystemPrompt(),
          warn: logMain,
        }),
      );
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
      return await getDeepSeekBalanceSnapshot();
    } catch (error) {
      logMain("deepseek balance fetch failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  });

  ipcMain.handle("kimi:balance:get", async () => {
    try {
      return await getKimiBalanceSnapshot();
    } catch (error) {
      logMain("kimi balance fetch failed", {
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
    const result = await setSessionArchived(roots.sessionRoot, input.sessionId, input.archived);
    if (!result.ok) {
      logMain("session archive failed", { sessionId: input.sessionId, error: result.error });
    }
    return result;
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
    // Kairos 模型 / 思考链来自 settings.json，且 LLM 在 controller 创建时定型；
    // 保存后立即重建，保证下一次 Kairos 调用使用最新设置。其余 env-backed 设置（Key/工具/
    // 温度/bash 审查）由消费方按 turn 读 env proxy，下一轮自动生效。
    if (
      input.kairos &&
      (beforeKairos.modelId !== next.kairos.modelId || beforeKairos.thinking !== next.kairos.thinking)
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

  ipcMain.handle("settings:test-connection", async (_event, input: TestConnectionInput) => {
    const result = await testProviderConnection(input.provider);
    logMain("settings test connection", { provider: input.provider, ok: result.ok });
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
  // 先初始化设置：load() 会把持久化设置覆盖到 process.env 并刷新 env，
  // 这样后续的 Kairos 初始化与首个 agent turn 都能拿到生效后的配置。
  settingsService = new SettingsService({ dataRoot: roots.dataRoot, crypto: electronSecretCrypto });
  try {
    await settingsService.load();
    logMain("settings service ready", { dataRoot: roots.dataRoot });
  } catch (err) {
    logMain("settings service load failed", { error: err instanceof Error ? err.message : String(err) });
  }
  localUpdateService = new LocalUpdateService({
    dataRoot: roots.dataRoot,
    appPath: process.execPath,
    isPackaged: app.isPackaged,
    onReadyToReplace: () => {
      localUpdateQuitRequested = true;
      logMain("local update ready to replace, quitting app");
      app.quit();
    },
  });
  try {
    await localUpdateService.load();
    logMain("local update service ready", { dataRoot: roots.dataRoot, packaged: app.isPackaged });
  } catch (err) {
    logMain("local update service load failed", { error: err instanceof Error ? err.message : String(err) });
  }
  await registerIpc();
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
  if (!kairosController) {
    kairosIpcHandle?.dispose();
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
      await kairosController?.shutdown();
    } catch (err) {
      logMain("kairos shutdown threw", { error: err instanceof Error ? err.message : String(err) });
    } finally {
      clearTimeout(timer);
      kairosIpcHandle?.dispose();
      finish();
    }
  })();
});
