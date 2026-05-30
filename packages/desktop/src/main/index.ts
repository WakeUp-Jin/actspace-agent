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

import { app, BrowserWindow, ipcMain, nativeTheme, safeStorage } from "electron";
import { access, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  AbortTurnInput,
  ApprovalDecideInput,
  ApprovalListPendingInput,
  ClearProviderKeyInput,
  DeepSeekBalanceSnapshot,
  ProviderId,
  RunTurnInput,
  SessionCreateInput,
  SessionGetInput,
  SessionPinInput,
  SetProviderKeyInput,
  SettingsUpdateInput,
  TestConnectionInput,
  TestConnectionResult,
  UsageStatisticsGetInput,
  ListVisualizationsInput,
  VisualizeReplyInput,
  DescribeContextInput,
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
  readSessionRecord,
  setSessionPinned,
  createKairos,
  ShortMemoryStore,
  type KairosController,
} from "@actspace/agent-core";
import type { SessionEvent, SessionRecord } from "@actspace/shared";
import { runAndPersistTurn, abortTurn, type AppDataRoots } from "./agent-turn";
import { listVisualizations, visualizeReply } from "./visualize-service";
import { describeSessionContext } from "./context-describe-service";
import { PendingApprovalRegistry } from "./approval-registry";
import {
  createKairosLlm,
  createKairosToolManagerFactory,
  getKairosWorkspaceRoot,
  resolveKairosThinkingEnabled,
  ensureKairosScaffolding,
} from "./kairos-bootstrap";
import { registerKairosIpc, type KairosIpcHandle } from "./kairos-ipc";
import { SettingsService, type SecretCrypto } from "./settings-service";

const APP_ID = "com.actspace.desktop";
const APP_NAME = "actspace";
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const PREVIEW_LIMIT = 160;
const DEEPSEEK_BALANCE_TIMEOUT_MS = 8_000;
const PROVIDER_TEST_TIMEOUT_MS = 8_000;

let repoRootCache: string | undefined;
let workspaceRootCache: string | undefined;

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

function logMain(message: string, details?: Record<string, unknown>): void {
  console.log(
    `[main] ${message}`,
    details ? JSON.stringify(details) : "",
  );
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
}

// ─── 数据目录 ───

async function ensureDataDirectories(): Promise<AppDataRoots> {
  const dataRoot = app.getPath("userData");
  const sessionRoot = join(dataRoot, "sessions");
  const logRoot = join(await getRepoRoot(), "logs");
  const tmpRoot = join(dataRoot, "tmp");
  const workspaceRoot = await getWorkspaceRoot();

  await mkdir(sessionRoot, { recursive: true });
  await mkdir(logRoot, { recursive: true });
  await mkdir(tmpRoot, { recursive: true });

  logMain("data directories ensured", {
    dataRoot,
    sessionRoot,
    logRoot,
    tmpRoot,
    workspaceRoot,
  });

  return { dataRoot, sessionRoot, logRoot, tmpRoot, workspaceRoot };
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
  const summaries = await listSessionRecords(sessionRoot);
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

async function getRepoRoot(): Promise<string> {
  if (repoRootCache) return repoRootCache;

  const explicit = process.env.ACTSPACE_REPO_ROOT;
  if (explicit) {
    await access(join(explicit, "package.json"));
    repoRootCache = explicit;
    return repoRootCache;
  }

  let current = process.cwd();
  while (true) {
    if (await isActspaceRepoRoot(current)) {
      repoRootCache = current;
      return repoRootCache;
    }

    const parent = dirname(current);
    if (parent === current) {
      repoRootCache = process.cwd();
      return repoRootCache;
    }
    current = parent;
  }
}

async function isActspaceRepoRoot(dir: string): Promise<boolean> {
  try {
    const raw = await readFile(join(dir, "package.json"), "utf-8");
    const pkg = JSON.parse(raw) as { name?: string };
    return pkg.name === "actspace";
  } catch {
    return false;
  }
}

async function getWorkspaceRoot(): Promise<string> {
  if (workspaceRootCache) return workspaceRootCache;

  const explicit = process.env.ACTSPACE_WORKSPACE_ROOT;
  if (explicit) {
    await access(explicit);
    workspaceRootCache = explicit;
    logMain("workspace root resolved from ACTSPACE_WORKSPACE_ROOT", { workspaceRoot: workspaceRootCache });
    return workspaceRootCache;
  }

  workspaceRootCache = await getRepoRoot();
  logMain("workspace root resolved from repo root", { workspaceRoot: workspaceRootCache });
  return workspaceRootCache;
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

// ─── 设置（Settings） ───

/** 生产环境用 Electron safeStorage 为供应商 API Key 加解密。 */
const electronSecretCrypto: SecretCrypto = {
  isAvailable: () => safeStorage.isEncryptionAvailable(),
  encrypt: (plain) => safeStorage.encryptString(plain),
  decrypt: (cipher) => safeStorage.decryptString(cipher),
};

let settingsService: SettingsService | undefined;

function getSettingsService(): SettingsService {
  if (!settingsService) {
    throw new Error("SettingsService 尚未初始化（应在 app.whenReady 内 load 之后再调用）。");
  }
  return settingsService;
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
}

// ─── Kairos 单例（lazy init in app.whenReady） ───

let kairosController: KairosController | undefined;
let kairosIpcHandle: KairosIpcHandle | undefined;

async function ensureKairosController(roots: AppDataRoots): Promise<KairosController> {
  if (kairosController) return kairosController;
  const kairosRoot = join(roots.dataRoot, "kairos");
  await ensureKairosScaffolding(kairosRoot);
  const kairosWorkspaceRoot = getKairosWorkspaceRoot(kairosRoot);
  const llm = createKairosLlm();
  const thinkingEnabled = resolveKairosThinkingEnabled();
  const toolManagerFactory = createKairosToolManagerFactory({ workspaceRoot: kairosWorkspaceRoot });
  kairosController = await createKairos({
    kairosRoot,
    llm,
    toolManagerFactory,
    contextWindow: 32_000,
    thinkingEnabled,
  });
  kairosIpcHandle = registerKairosIpc({
    controller: kairosController,
    kairosRoot,
    getMainWindow,
  });
  logMain("kairos controller ready", { kairosRoot, kairosWorkspaceRoot });
  return kairosController;
}

/**
 * 在 Kairos 模型 / 思考链设置变更后重建 controller，使其用最新 env 重新创建 LLM。
 *
 * - Kairos 的 LLM 在 `createKairos()` 时定型，无法热替换，故采用「停旧 → 释放 IPC → 重建」。
 * - 仅在 controller 处于非 ticking 态时执行；ticking 中直接跳过，变更会在下次重启或
 *   下次空闲重建时生效（env 已更新，重启路径天然带上新模型）。
 * - `start()` 默认尊重 `preferences.enabled`，因此重建后会恢复用户此前的开启/暂停意图。
 */
async function rebuildKairosController(roots: AppDataRoots): Promise<void> {
  if (!kairosController) return;
  const state = kairosController.getState();
  if (state.state === "ticking") {
    logMain("kairos rebuild deferred: controller is ticking");
    return;
  }
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
      workspaceRoot: roots.workspaceRoot
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
      const result = await runAndPersistTurn(input, roots, getMainWindow, approvalRegistry);
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

  ipcMain.handle("context:describe", async (_event, input: DescribeContextInput) => {
    const roots = await ensureDataDirectories();
    try {
      return await describeSessionContext(input, roots);
    } catch (error) {
      logMain("describe context failed", {
        sessionId: input.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  });

  ipcMain.handle("session:list", async () => {
    const roots = await ensureDataDirectories();
    return listSessionRecords(roots.sessionRoot);
  });

  ipcMain.handle("session:get", async (_event, input: SessionGetInput) => {
    const roots = await ensureDataDirectories();
    return readSessionRecord(createSessionStorePaths(join(roots.sessionRoot, input.sessionId)));
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
      return createUsageStatisticsSnapshot(record, range);
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

  ipcMain.handle("session:create", async (_event, input: SessionCreateInput = {}) => {
    const roots = await ensureDataDirectories();
    return createSessionRecord(roots.sessionRoot, {
      ...input,
      workspaceRoot: input.workspaceRoot ?? roots.workspaceRoot,
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

  ipcMain.handle("settings:update", async (_event, input: SettingsUpdateInput) => {
    const service = getSettingsService();
    const beforeKairos = service.get().kairos;
    const next = await service.update(input);
    // Kairos 模型/思考链变更需重建 controller（其 LLM 在创建时定型）；其余 env-backed
    // 设置（Key/工具/温度/bash 审查）由消费方按 turn 读 env proxy，下一轮自动生效。
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
  await registerIpc();
  await createMainWindow();
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

app.on("before-quit", async () => {
  try {
    await kairosController?.stop();
  } catch {
    // 不阻断退出
  }
  kairosIpcHandle?.dispose();
});
