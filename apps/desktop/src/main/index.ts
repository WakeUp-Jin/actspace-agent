import { ModelCatalogService } from "./model-catalog-service";
import { DesktopSpeechPlayback } from "./speech-playback";
import { registerEnglishLearningIpc } from "./runtime-v2/english-learning-ipc";
import { app, BrowserWindow, globalShortcut, safeStorage, webContents, net } from "electron";
import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { AppDataRoots } from "./app-paths";
import { homedir } from "node:os";
import { resolveActSpaceDataRoot } from "@actspace/shared";
import { RUNTIME_V2_DESKTOP_CHANNELS, RUNTIME_V2_FIXED_RENDERER_CHANNELS, type RuntimeV2ApprovalRequest } from "@actspace/shared/runtime-v2";
import type { RuntimeStreamEvent } from "@actspace/shared";
import { resolveAppDataRoots } from "./app-paths";
import { PendingApprovalRegistry } from "./approval-registry";
import { BrowserBridgeService } from "./browser-bridge-service";
import { SettingsService, type SecretCrypto } from "./settings-service";
import { ModelStoreService } from "./model-store-service";
import { ModelRuntimeService } from "./model-runtime-service";
import { DesktopRuntimeV2Registry } from "./runtime-v2/runtime-registry";
import { registerRuntimeV2Ipc } from "./runtime-v2/projection-ipc";
import { registerRuntimeV2DesktopShell } from "./runtime-v2/desktop-shell-ipc";
import { TerminalSessionService } from "./terminal/terminal-session-service";
import { createNodePtyBackend } from "./terminal/node-pty-terminal-backend";
import { RUNTIME_V2_DESKTOP_SHELL_CHANNELS } from "@actspace/shared/runtime-v2";
import { ProviderNetworkService } from "./runtime-v2/provider-network-service";
import { QuickOpenShortcutController } from "./quick-open-shortcut-controller";
import { RuntimeV2OpenRouterCatalogService } from "./runtime-v2/openrouter-catalog-service";
import { registerFixedRendererIpc, type FixedRendererIpcRegistration } from "./runtime-v2/fixed-renderer-ipc";
import { LocalUpdateService } from "./local-update-service";

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const APP_ID = process.env.ACTSPACE_DEV_APP_ID?.trim() || "com.actspace.desktop";
const APP_DISPLAY_NAME = process.env.ACTSPACE_DEV_APP_NAME?.trim() || "ActSpace";

let startupLogPath: string | undefined;
let mainWindow: BrowserWindow | undefined;
let runtimeV2Registry: DesktopRuntimeV2Registry | undefined;
let disposeRuntimeV2Ipc: (() => void) | undefined;
let disposeEnglishLearningIpc: (() => void) | undefined;
let speechPlayback: DesktopSpeechPlayback | undefined;
let disposeRuntimeV2DesktopShell: (() => void) | undefined;
let fixedRendererIpc: FixedRendererIpcRegistration | undefined;
let terminalSessionService: TerminalSessionService | undefined;
let settingsService: SettingsService | undefined;
let pricingCatalog: ModelCatalogService | undefined;
let modelRuntimeService: ModelRuntimeService | undefined;
let providerNetworkService: ProviderNetworkService | undefined;
let quickOpenShortcutController: QuickOpenShortcutController | undefined;
let openRouterCatalogService: RuntimeV2OpenRouterCatalogService | undefined;
let deepSeekCatalogService: RuntimeV2OpenRouterCatalogService | undefined;
let browserBridgeService: BrowserBridgeService | undefined;
let localUpdateService: LocalUpdateService | undefined;
let shuttingDown = false;

const approvalRegistry = new PendingApprovalRegistry({
  onApprovalRequired: (request, sessionId, agentRunId) => {
    const dto: RuntimeV2ApprovalRequest = Object.freeze({ requestId: request.id, sessionId, agentRunId, toolName: request.toolName, summary: request.summary, reason: request.reason, risk: request.riskLevel, argumentSummary: request.args, createdAt: request.createdAt });
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(RUNTIME_V2_DESKTOP_CHANNELS.approvalRequired, dto);
      const event: RuntimeStreamEvent = {
        type: "tool_approval_required",
        sessionId,
        agentRunId,
        toolCallId: request.toolCallId ?? request.id,
        toolName: request.toolName,
        requestId: request.id,
        summary: request.summary,
        reason: request.reason,
        command: typeof request.args.command === "string" ? request.args.command : undefined,
        riskLevel: request.riskLevel,
        approvalScope: request.approvalScope,
        executionEnvironment: request.executionEnvironment,
      };
      mainWindow.webContents.send(RUNTIME_V2_FIXED_RENDERER_CHANNELS.agentStream, event);
    }
  },
  onApprovalResolved: (request, decision, sessionId, agentRunId) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const event: RuntimeStreamEvent = {
      type: "tool_approval_resolved",
      sessionId,
      agentRunId,
      toolCallId: request.toolCallId ?? request.id,
      requestId: request.id,
      decision: decision.decision,
      approvalScope: request.approvalScope,
    };
    mainWindow.webContents.send(RUNTIME_V2_FIXED_RENDERER_CHANNELS.agentStream, event);
  },
});

const electronSecretCrypto: SecretCrypto = {
  isAvailable: () => safeStorage.isEncryptionAvailable(),
  encrypt: (plain) => safeStorage.encryptString(plain),
  decrypt: (cipher) => safeStorage.decryptString(cipher),
};

function configureAppPaths(): void {
  app.setName(APP_DISPLAY_NAME);
  app.setPath("userData", resolveActSpaceDataRoot({ env: process.env, platform: process.platform === "darwin" || process.platform === "linux" || process.platform === "win32" ? process.platform : "other", homeDir: homedir() }));
}

async function ensureDataDirectories(): Promise<AppDataRoots> {
  const roots = await resolveAppDataRoots({
    dataRoot: app.getPath("userData"),
    defaultWorkspaceRoot: app.getPath("downloads"),
    cwd: process.cwd(),
    env: process.env,
  });
  await Promise.all([
    mkdir(roots.sessionRoot, { recursive: true }),
    mkdir(roots.logRoot, { recursive: true }),
    mkdir(roots.tmpRoot, { recursive: true }),
    mkdir(join(roots.dataRoot, "runtime-v2"), { recursive: true }),
  ]);
  startupLogPath = join(roots.logRoot, "desktop-v2.log");
  await logMain("v2 data directories ready", { dataRoot: roots.dataRoot, sessionRoot: roots.sessionRoot });
  return roots;
}

async function logMain(message: string, details?: Record<string, unknown>): Promise<void> {
  const line = `${JSON.stringify({ at: new Date().toISOString(), message, ...(details ? { details } : {}) })}\n`;
  if (startupLogPath) await appendFile(startupLogPath, line, "utf8").catch(() => undefined);
  if (process.env.ACTSPACE_LOG_STDERR === "1") process.stderr.write(line);
}

function getMainWindow(): BrowserWindow | undefined {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
}

async function createMainWindow(): Promise<BrowserWindow> {
  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 480,
    minHeight: 760,
    title: APP_DISPLAY_NAME,
    titleBarStyle: "hidden",
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: join(__dirname, "..", "preload", "index.bundle.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow = win;
  if (DEV_SERVER_URL) await win.loadURL(DEV_SERVER_URL);
  else await win.loadFile(join(__dirname, "..", "..", "dist", "index.html"));
  win.on("closed", () => { if (mainWindow === win) mainWindow = undefined; });
  return win;
}

async function bootRuntime(roots: AppDataRoots): Promise<void> {
  settingsService = new SettingsService({ dataRoot: roots.dataRoot, crypto: electronSecretCrypto });
  await settingsService.load();
  providerNetworkService = new ProviderNetworkService();
  pricingCatalog = new ModelCatalogService({ dataRoot: roots.dataRoot, fetch: net.fetch.bind(net) as typeof fetch });
  await pricingCatalog.load();
  let modelStore: ModelStoreService;
  openRouterCatalogService = new RuntimeV2OpenRouterCatalogService({
    dataRoot: roots.dataRoot,
    pricingCatalog: () => pricingCatalog!.snapshot(),
    fetchCatalog: (runtime) => providerNetworkService!.fetchModelCatalog(runtime),
    isAdded: (apiModel) => modelStore?.isCatalogModelAdded(apiModel) ?? false,
  });
  deepSeekCatalogService = new RuntimeV2OpenRouterCatalogService({
    provider: "deepseek", dataRoot: roots.dataRoot,
    fetchCatalog: (runtime) => providerNetworkService!.fetchModelCatalog(runtime),
    isAdded: (apiModel) => modelStore?.isCatalogModelAdded(apiModel, "deepseek") ?? false,
  });
  await Promise.all([openRouterCatalogService.load(), deepSeekCatalogService.load()]);
  modelStore = new ModelStoreService({ settings: settingsService, findCatalogModel: (apiModel, provider) => (provider === "deepseek" ? deepSeekCatalogService : openRouterCatalogService)?.findModel(apiModel) });
  modelRuntimeService = new ModelRuntimeService(settingsService, modelStore, () => pricingCatalog!.snapshot());
  const quickOpenSettings = settingsService.getV2().shortcuts.quickOpen;
  quickOpenShortcutController = new QuickOpenShortcutController(globalShortcut, () => {
    const window = getMainWindow();
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
    fixedRendererIpc?.requestQuickOpen();
  }, quickOpenSettings.accelerator);
  await logMain("v2 quick open initialized", quickOpenShortcutController.activate(quickOpenSettings));
  browserBridgeService = new BrowserBridgeService({ dataRoot: roots.dataRoot, log: (message, details) => void logMain(message, details) });
  localUpdateService = new LocalUpdateService({
    dataRoot: roots.dataRoot,
    appPath: app.getPath("exe"),
    isPackaged: app.isPackaged,
    onReadyToReplace: () => app.quit(),
  });
  await localUpdateService.load();
  const speech = new DesktopSpeechPlayback(roots.tmpRoot, settingsService);
  speechPlayback = speech;
  runtimeV2Registry = new DesktopRuntimeV2Registry({
    speech,
    roots,
    models: modelRuntimeService,
    approvals: approvalRegistry,
    browser: browserBridgeService,
    log: (message, details) => void logMain(message, details),
  });
  const terminalNativeAvailable = hasNodePty();
  if (terminalNativeAvailable) {
    terminalSessionService = new TerminalSessionService({
      readSession: async (sessionId) => {
        try {
          const snapshot = await runtimeV2Registry!.inspectSession(sessionId);
          return { workspaceRoot: snapshot.workspaceRoot ?? roots.workspaceRoot };
        } catch {
          return null;
        }
      },
      resolveWorkspaceRoot: async (workspaceRoot) => workspaceRoot ?? roots.workspaceRoot,
      createBackend: createNodePtyBackend,
      sendEvent: (ownerId, event) => {
        const owner = webContents.fromId(ownerId);
        if (owner && !owner.isDestroyed()) {
          owner.send(RUNTIME_V2_DESKTOP_SHELL_CHANNELS.terminalEvent, event);
          owner.send(RUNTIME_V2_FIXED_RENDERER_CHANNELS.terminalEvent, event);
        }
      },
      log: (message, details) => void logMain(message, details),
    });
  }
  disposeRuntimeV2Ipc = registerRuntimeV2Ipc({ registry: runtimeV2Registry, settings: settingsService, models: modelStore, providerNetwork: providerNetworkService, quickOpen: quickOpenShortcutController, catalog: openRouterCatalogService, deepSeekCatalog: deepSeekCatalogService, approvals: approvalRegistry, getMainWindow }).dispose;
  disposeRuntimeV2DesktopShell = registerRuntimeV2DesktopShell({
    roots,
    getMainWindow,
    terminal: terminalSessionService,
    terminalAvailable: terminalNativeAvailable,
    terminalUnavailableReason: terminalNativeAvailable ? null : "node-pty is not installed in this build.",
  }).dispose;
  await runtimeV2Registry.boot();
  disposeEnglishLearningIpc = registerEnglishLearningIpc({ registry: runtimeV2Registry, settings: settingsService, getMainWindow });
  fixedRendererIpc = registerFixedRendererIpc({
    registry: runtimeV2Registry,
    roots,
    settings: settingsService,
    models: modelStore,
    modelRuntime: modelRuntimeService,
    pricingCatalog,
    providerNetwork: providerNetworkService,
    catalog: openRouterCatalogService, deepSeekCatalog: deepSeekCatalogService,
    approvals: approvalRegistry,
    browserBridge: browserBridgeService,
    quickOpen: quickOpenShortcutController,
    localUpdate: localUpdateService,
    getMainWindow,
    log: (message, details) => void logMain(message, details),
  });
}

app.whenReady().then(async () => {
  configureAppPaths();
  app.setAppUserModelId(APP_ID);
  const roots = await ensureDataDirectories();
  try {
    await bootRuntime(roots);
  } catch (error) {
    await logMain("v2 boot failed", { error: error instanceof Error ? error.message : String(error) });
  }
  await createMainWindow();
  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createMainWindow();
  });
}).catch((error: unknown) => {
  void logMain("desktop bootstrap failed", { error: error instanceof Error ? error.message : String(error) });
  app.quit();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", (event) => {
  if (shuttingDown) return;
  shuttingDown = true;
  event.preventDefault();
  const timeout = setTimeout(() => app.exit(1), 35_000);
  void (async () => {
    try {
      const window = getMainWindow();
      if (window) window.webContents.send(RUNTIME_V2_FIXED_RENDERER_CHANNELS.appShuttingDown, { reason: "normal" });
      await runtimeV2Registry?.dispose();
      pricingCatalog?.dispose();
      await providerNetworkService?.dispose();
      quickOpenShortcutController?.dispose();
      terminalSessionService?.disposeAll();
    } catch (error) {
      await logMain("v2 shutdown incomplete", { error: error instanceof Error ? error.message : String(error) });
    } finally {
      disposeEnglishLearningIpc?.();
      await speechPlayback?.dispose();
      clearTimeout(timeout);
      disposeRuntimeV2Ipc?.();
      disposeRuntimeV2DesktopShell?.();
      fixedRendererIpc?.dispose();
      app.exit(0);
    }
  })();
});

function hasNodePty(): boolean {
  try {
    require.resolve("node-pty");
    return true;
  } catch {
    return false;
  }
}
