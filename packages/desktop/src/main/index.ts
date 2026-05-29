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

import { app, BrowserWindow, ipcMain } from "electron";
import { access, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  AbortTurnInput,
  ApprovalDecideInput,
  ApprovalListPendingInput,
  DeepSeekBalanceSnapshot,
  RunTurnInput,
  SessionCreateInput,
  SessionGetInput,
  SessionPinInput,
  UsageStatisticsGetInput,
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
import { PendingApprovalRegistry } from "./approval-registry";
import {
  createKairosLlm,
  createKairosToolManagerFactory,
  getKairosWorkspaceRoot,
  resolveKairosThinkingEnabled,
  ensureKairosScaffolding,
} from "./kairos-bootstrap";
import { registerKairosIpc, type KairosIpcHandle } from "./kairos-ipc";

const APP_ID = "com.actspace.desktop";
const APP_NAME = "actspace";
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const PREVIEW_LIMIT = 160;
const DEEPSEEK_BALANCE_TIMEOUT_MS = 8_000;

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
}

// ─── 启动 ───

configureAppPaths();
loadEnv();

app.whenReady().then(async () => {
  app.setAppUserModelId(APP_ID);
  const roots = await ensureDataDirectories();
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
