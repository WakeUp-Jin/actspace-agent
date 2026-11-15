import { RemoteDesktopAdapter } from "./remote-hosts/desktop-adapter";
import { RemoteHostRegistry } from "./remote-hosts/registry";
import { registerRemoteHostIpc } from "./remote-hosts/ipc";
import { ResourceMonitorController } from "./resource-monitor/monitor-controller";
import { DesktopSpeechPlayback } from "./speech-playback";
import { registerEnglishLearningIpc } from "./runtime-v2/english-learning-ipc";
import { BROWSER_PLUGIN_ID, disabledPluginIds, ENGLISH_LEARNING_PLUGIN_ID, resolvePluginSettings, resolvePluginSwitches } from "./plugins/plugin-switches";
import { registerPluginsIpc } from "./plugins/plugins-ipc";
import { registerPythonRuntimeIpc } from "./python-runtime/python-runtime-ipc";
import { PythonRuntimeService, resolveDesktopPythonRuntime } from "./python-runtime/python-runtime-service";
import { registerDisabledEnglishLearningIpc } from "./plugins/optional-plugin-stubs";
import { loadRuntimeModule } from "./runtime-v2/runtime-loader";
import { app, BrowserWindow, globalShortcut, safeStorage, screen, session } from "electron";
import { presentQuickOpenWindow } from "./quick-open-window";
import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { AppDataRoots } from "./app-paths";
import { homedir } from "node:os";
import { resolveActSpaceDataRoot } from "@actspace/shared";
import { RUNTIME_FIXED_RENDERER_CHANNELS } from "@actspace/shared/runtime-v2";
import type { RuntimeStreamEvent } from "@actspace/shared";
import { resolveAppDataRoots } from "./app-paths";
import { PendingApprovalRegistry } from "./approval-registry";
import { BrowserBridgeService } from "./browser-bridge-service";
import { resolveDesktopNonoPath } from "./sandbox-resources";
import { SettingsService, type SecretCrypto } from "./settings-service";
import { ModelStoreService } from "./model-store-service";
import { ModelRuntimeService } from "./model-runtime-service";
import { DesktopRuntimeRegistry } from "./runtime-v2/runtime-registry";
import { registerRuntimeDesktopShell } from "./runtime-v2/desktop-shell-ipc";
import { ProviderNetworkService } from "./runtime-v2/provider-network-service";
import { QuickOpenShortcutController } from "./quick-open-shortcut-controller";
import { registerFixedRendererIpc, type FixedRendererIpcRegistration } from "./runtime-v2/fixed-renderer-ipc";
import { LocalUpdateService } from "./local-update-service";
import { attachWindowLifecycle, installProcessErrorLogging, runShutdownSteps } from "./main-lifecycle";
import { attachNavigationGuards, blockWebviewAttachment, buildContentSecurityPolicy, createAppUrlMatcher, createMainWindowOptions, installContentSecurityPolicy } from "./window-security";

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const APP_ID = process.env.ACTSPACE_DEV_APP_ID?.trim() || "com.actspace.desktop";
const APP_DISPLAY_NAME = process.env.ACTSPACE_DEV_APP_NAME?.trim() || "ActSpace";

let startupLogPath: string | undefined;
let mainWindow: BrowserWindow | undefined;
let runtimeRegistry: DesktopRuntimeRegistry | undefined;
let resourceMonitor: ResourceMonitorController | undefined;
let disposeEnglishLearningIpc: (() => void) | undefined;
let disposePluginsIpc: (() => void) | undefined;
let disposePythonRuntimeIpc: (() => void) | undefined;
let pythonRuntimeService: PythonRuntimeService | undefined;
let speechPlayback: DesktopSpeechPlayback | undefined;
let disposeRuntimeDesktopShell: (() => void) | undefined;
let remoteDesktop: RemoteDesktopAdapter | undefined;
let remoteHosts: RemoteHostRegistry | undefined;
let disposeRemoteHostIpc: (() => void) | undefined;
let fixedRendererIpc: FixedRendererIpcRegistration | undefined;
let settingsService: SettingsService | undefined;
let modelRuntimeService: ModelRuntimeService | undefined;
let providerNetworkService: ProviderNetworkService | undefined;
let quickOpenShortcutController: QuickOpenShortcutController | undefined;
let browserBridgeService: BrowserBridgeService | undefined;
let browserConnectionTimer: NodeJS.Timeout | undefined;
let localUpdateService: LocalUpdateService | undefined;
let shuttingDown = false;

blockWebviewAttachment(app);

installProcessErrorLogging((message, details) => {
  // 日志目录还没准备好时，错误只能写到 stderr。
  if (startupLogPath) void logMain(message, details);
  else process.stderr.write(formatLogLine(message, details));
});

const approvalRegistry = new PendingApprovalRegistry({
  onApprovalRequired: (request, sessionId, agentRunId) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
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
      fixedRendererIpc?.flushLive();
      mainWindow.webContents.send(RUNTIME_FIXED_RENDERER_CHANNELS.agentStream, event);
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
    fixedRendererIpc?.flushLive();
    mainWindow.webContents.send(RUNTIME_FIXED_RENDERER_CHANNELS.agentStream, event);
  },
});

const electronSecretCrypto: SecretCrypto = {
  isAvailable: () => safeStorage.isAsyncEncryptionAvailable(),
  encrypt: (plain) => safeStorage.encryptStringAsync(plain),
  decrypt: async (cipher) => (await safeStorage.decryptStringAsync(cipher)).result,
};

function configureAppPaths(): void {
  app.setName(APP_DISPLAY_NAME);
  app.setPath("userData", resolveActSpaceDataRoot({ env: process.env, platform: process.platform === "darwin" || process.platform === "linux" || process.platform === "win32" ? process.platform : "other", homeDir: homedir() }));
}

async function ensureDataDirectories(): Promise<AppDataRoots> {
  const roots = await resolveAppDataRoots({
    dataRoot: app.getPath("userData"),
    defaultWorkspaceRoot: join(app.getPath("documents"), "ActSpace", "default-workspace"),
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
  const line = formatLogLine(message, details);
  if (startupLogPath) await appendFile(startupLogPath, line, "utf8").catch(() => undefined);
  if (process.env.ACTSPACE_LOG_STDERR === "1") process.stderr.write(line);
}

function formatLogLine(message: string, details?: Record<string, unknown>): string {
  return `${JSON.stringify({ at: new Date().toISOString(), message, ...(details ? { details } : {}) })}\n`;
}

function getMainWindow(): BrowserWindow | undefined {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
}

function getMainWindowOrNull(): BrowserWindow | null {
  return getMainWindow() ?? null;
}

async function createMainWindow(): Promise<BrowserWindow> {
  const indexHtmlPath = join(__dirname, "..", "..", "dist", "index.html");
  const win = new BrowserWindow(createMainWindowOptions({
    preload: join(__dirname, "..", "preload", "index.bundle.js"),
    title: APP_DISPLAY_NAME,
  }));
  mainWindow = win;
  attachNavigationGuards(win, createAppUrlMatcher({ devServerUrl: DEV_SERVER_URL, indexHtmlPath }));
  attachWindowLifecycle(win, {
    onClosed: () => {
      if (mainWindow === win) mainWindow = undefined;
      // 资源监控悬浮窗不该让应用在 Windows / Linux 上关不掉。
      if (process.platform !== "darwin") resourceMonitor?.closeFloatWindow();
    },
  });
  resourceMonitor?.attachMainWindow(win);
  if (DEV_SERVER_URL) await win.loadURL(DEV_SERVER_URL);
  else await win.loadFile(indexHtmlPath);
  return win;
}

async function bootRuntime(roots: AppDataRoots): Promise<void> {
  settingsService = new SettingsService({ dataRoot: roots.dataRoot, crypto: electronSecretCrypto });
  await settingsService.load();
  providerNetworkService = new ProviderNetworkService();
  const modelStore = new ModelStoreService({ settings: settingsService });
  modelRuntimeService = new ModelRuntimeService(settingsService, modelStore);
  const quickOpenSettings = settingsService.getV2().shortcuts.quickOpen;
  quickOpenShortcutController = new QuickOpenShortcutController(globalShortcut, () => {
    const window = getMainWindow();
    if (!window) return;
    void presentQuickOpenWindow(window, screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea)
      .then((presented) => { if (presented) fixedRendererIpc?.requestQuickOpen(); })
      .catch((error) => void logMain("quick open presentation failed", { error: String(error) }));
  }, quickOpenSettings.accelerator);
  await logMain("v2 quick open initialized", quickOpenShortcutController.activate(quickOpenSettings));
  // Startup switches: fixed for this process. A switched-off plugin is not created, polled or installed;
  // changing the setting only takes effect after a restart (see plugin-switches.ts).
  const runtimeModule = await loadRuntimeModule();
  const startupSwitches = resolvePluginSwitches(settingsService.getV4().settings, runtimeModule.PLUGIN_CATALOG);
  const startupPluginSettings = resolvePluginSettings(settingsService.getV4().settings);
  const browserEnabled = startupSwitches.get(BROWSER_PLUGIN_ID) === true;
  const englishLearningEnabled = startupSwitches.get(ENGLISH_LEARNING_PLUGIN_ID) === true;
  browserBridgeService = browserEnabled ? new BrowserBridgeService({
    dataRoot: roots.dataRoot,
    bundledRoot: app.isPackaged && !process.env.ACTSPACE_DEV_APP_ID
      ? join(process.resourcesPath, "app", "browser-components")
      : join(roots.logRoot, "..", "dist", "browser-components"),
    log: (message, details) => void logMain(message, details),
  }) : undefined;
  localUpdateService = new LocalUpdateService({
    dataRoot: roots.dataRoot,
    appPath: app.getPath("exe"),
    isPackaged: app.isPackaged,
    onReadyToReplace: () => app.quit(),
  });
  await localUpdateService.load();
  const packagedResources = app.isPackaged && !process.env.ACTSPACE_DEV_APP_ID;
  const nonoPath = resolveDesktopNonoPath({ packaged: packagedResources, resourcesPath: process.resourcesPath, repoRoot: join(roots.logRoot, ".."), env: process.env });
  await logMain("sandbox nono resolved", { nonoPath: nonoPath ?? null });
  const pythonRuntime = resolveDesktopPythonRuntime({ packaged: packagedResources, resourcesPath: process.resourcesPath, repoRoot: join(roots.logRoot, ".."), env: process.env });
  await logMain("python runtime resolved", { root: pythonRuntime?.root ?? null });
  pythonRuntimeService = new PythonRuntimeService({ runtime: pythonRuntime, dataRoot: roots.dataRoot, log: (message, details) => void logMain(message, details) });
  const speech = englishLearningEnabled ? new DesktopSpeechPlayback(roots.tmpRoot, settingsService) : undefined;
  speechPlayback = speech;
  runtimeRegistry = new DesktopRuntimeRegistry({
    speech,
    disabledPlugins: disabledPluginIds(startupSwitches),
    pluginConfig: startupPluginSettings,
    roots,
    models: modelRuntimeService,
    approvals: approvalRegistry,
    browser: browserBridgeService,
    nonoPath,
    python: pythonRuntimeService.forBash(),
    disabledSkillIds: () => settingsService?.get().skills.disabled ?? [],
    chatCompactionTriggerRatio: () => settingsService?.getV4().settings.general.taskDefaults.chatCompactionTriggerRatio ?? 0.8,
    log: (message, details) => void logMain(message, details),
  });
  disposeRuntimeDesktopShell = registerRuntimeDesktopShell({
    roots,
    getMainWindow,
    listSessions: async () => runtimeRegistry?.listSessions() ?? [],
  }).dispose;
  await runtimeRegistry.boot();
  const syncBrowser = async () => {
    if (!browserBridgeService || !runtimeRegistry || shuttingDown) return;
    const status = await browserBridgeService.getStatus();
    await runtimeRegistry.refreshBrowser();
    if (status.runState === "error") throw new Error(status.lastError ?? "Chrome connection status probe failed");
  };
  let browserFailures = 0;
  const scheduleBrowserSync = (delay: number) => {
    browserConnectionTimer = setTimeout(() => { void pollBrowser(); }, delay);
    browserConnectionTimer.unref();
  };
  const pollBrowser = async () => {
    if (shuttingDown) return;
    try {
      await syncBrowser();
      browserFailures = 0;
    } catch (error) {
      browserFailures++;
      if (browserFailures === 1) await logMain("Chrome connection refresh failed", { error: error instanceof Error ? error.message : String(error) });
    }
    if (!shuttingDown) {
      const base = browserFailures ? [1_000, 2_000, 5_000, 10_000][Math.min(browserFailures - 1, 3)] : 10_000;
      scheduleBrowserSync(Math.round(base * (0.9 + Math.random() * 0.2)));
    }
  };
  if (browserBridgeService) scheduleBrowserSync(1_000);
  resourceMonitor = new ResourceMonitorController({
    settings: settingsService,
    getMainWindow,
    dataRoot: roots.dataRoot,
    preloadPath: join(__dirname, "..", "preload", "index.bundle.js"),
    devServerUrl: DEV_SERVER_URL,
    distRoot: join(__dirname, "..", "..", "dist"),
    log: (message, details) => void logMain(message, details),
  });
  disposeEnglishLearningIpc = englishLearningEnabled
    ? registerEnglishLearningIpc({ registry: runtimeRegistry, settings: settingsService, getMainWindow: getMainWindowOrNull })
    : registerDisabledEnglishLearningIpc({ getMainWindow: getMainWindowOrNull });
  disposePluginsIpc = registerPluginsIpc({ getMainWindow, catalog: runtimeModule.PLUGIN_CATALOG, startupSwitches, startupPluginSettings, settings: settingsService });
  disposePythonRuntimeIpc = registerPythonRuntimeIpc({ getMainWindow, service: pythonRuntimeService });
  remoteHosts = new RemoteHostRegistry(roots.dataRoot);
  await remoteHosts.open();
  disposeRemoteHostIpc = registerRemoteHostIpc(remoteHosts, getMainWindowOrNull, async sessionId => { await remoteDesktop?.activate(sessionId); });
  remoteDesktop = new RemoteDesktopAdapter(remoteHosts, getMainWindow, roots.dataRoot);
  fixedRendererIpc = registerFixedRendererIpc({
    remote: remoteDesktop,
    registry: runtimeRegistry,
    roots,
    settings: settingsService,
    models: modelStore,
    modelRuntime: modelRuntimeService,
    providerNetwork: providerNetworkService,
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
  installContentSecurityPolicy(session.defaultSession, buildContentSecurityPolicy({ devServerUrl: DEV_SERVER_URL }));
  const roots = await ensureDataDirectories();
  try {
    await bootRuntime(roots);
  } catch (error) {
    await logMain("v2 boot failed", { error: error instanceof Error ? error.message : String(error) });
  }
  await createMainWindow();
  app.on("activate", async () => {
    // 资源监控悬浮窗也是窗口，不能按窗口总数判断主窗口在不在。
    if (!getMainWindow()) await createMainWindow();
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
  if (browserConnectionTimer) clearTimeout(browserConnectionTimer);
  event.preventDefault();
  const timeout = setTimeout(() => app.exit(1), 35_000);
  void (async () => {
    // 每一步单独兜错：任何一步抛错（比如窗口已销毁时解绑监听）都只记日志，后面的步骤照常执行，
    // 最后一定走到 app.exit(0)，不会卡在「正在安全关闭」直到 35 秒兜底。
    await runShutdownSteps([
      ["notify renderer", () => getMainWindow()?.webContents.send(RUNTIME_FIXED_RENDERER_CHANNELS.appShuttingDown, { reason: "normal" })],
      ["remote desktop", () => remoteDesktop?.dispose()],
      ["remote hosts", () => remoteHosts?.dispose()],
      ["remote host ipc", () => disposeRemoteHostIpc?.()],
      ["runtime", () => runtimeRegistry?.dispose()],
      ["provider network", () => providerNetworkService?.dispose()],
      ["quick open", () => quickOpenShortcutController?.dispose()],
      ["browser bridge", () => browserBridgeService?.dispose()],
      ["local update", () => localUpdateService?.dispose()],
      ["resource monitor", () => resourceMonitor?.dispose()],
      ["english learning ipc", () => disposeEnglishLearningIpc?.()],
      ["plugins ipc", () => disposePluginsIpc?.()],
      ["python runtime ipc", () => disposePythonRuntimeIpc?.()],
      ["speech playback", () => speechPlayback?.dispose()],
      ["desktop shell", () => disposeRuntimeDesktopShell?.()],
      ["fixed renderer ipc", () => fixedRendererIpc?.dispose()],
    ], (message, details) => void logMain(message, details));
    clearTimeout(timeout);
    app.exit(0);
  })();
});
