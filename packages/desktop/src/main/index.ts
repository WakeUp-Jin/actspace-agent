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
import type { AbortTurnInput, RunTurnInput, SessionCreateInput, SessionGetInput, ApprovalDecideInput, ApprovalListPendingInput } from "@actspace/shared";
import {
  createBootstrapState,
  loadEnv,
  createSessionRecord,
  createSessionStorePaths,
  listSessionRecords,
  readSessionRecord,
} from "@actspace/agent-core";
import { runAndPersistTurn, abortTurn, type AppDataRoots } from "./agent-turn";
import { PendingApprovalRegistry } from "./approval-registry";

const APP_ID = "com.actspace.desktop";
const APP_NAME = "actspace";
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const PREVIEW_LIMIT = 160;

let repoRootCache: string | undefined;
let workspaceRootCache: string | undefined;

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
    trafficLightPosition: {
      x: 16,
      y: 18
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

  ipcMain.handle("session:create", async (_event, input: SessionCreateInput = {}) => {
    const roots = await ensureDataDirectories();
    return createSessionRecord(roots.sessionRoot, input);
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
  await ensureDataDirectories();
  await registerIpc();
  await createMainWindow();

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
