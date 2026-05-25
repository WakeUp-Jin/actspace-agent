import { app, BrowserWindow, ipcMain } from "electron";
import { access, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AgentTurnResult, RunTurnInput, SessionCreateInput, SessionGetInput, ModelSpec } from "@actspace/shared";
import { resolveModelSpec } from "@actspace/shared";
import type { LLMConfig } from "@actspace/agent-core";
import {
  createBootstrapState,
  env,
  loadEnv,
  createLLMService,
  createToolManager,
  ContextManager,
  SystemPromptContext,
  MAIN_AGENT_SYSTEM_PROMPT,
  type AgentRunLogger,
  cleanupOldAgentRunLogs,
  createAgentRunLogger,
  runTurnWithAgent,
  createSessionRecord,
  createSessionStorePaths,
  listSessionRecords,
  readSessionRecord,
  writeSessionResult,
} from "@actspace/agent-core";

const APP_ID = "com.actspace.desktop";
const APP_NAME = "actspace";
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const PREVIEW_LIMIT = 160;

type AppDataRoots = {
  dataRoot: string;
  sessionRoot: string;
  logRoot: string;
  tmpRoot: string;
  workspaceRoot: string;
};

let repoRootCache: string | undefined;
let workspaceRootCache: string | undefined;

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

function logAgentIpc(message: string, details?: Record<string, unknown>): void {
  console.log(
    `[agent-ipc] ${message}`,
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

  return {
    dataRoot,
    sessionRoot,
    logRoot,
    tmpRoot,
    workspaceRoot
  };
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


function configureAppPaths() {
  app.setName(APP_NAME);
  const userDataRoot = join(app.getPath("appData"), APP_NAME);
  app.setPath("userData", userDataRoot);
  logMain("app paths configured", { userDataRoot });
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

function createLLMConfigFromSpec(spec: ModelSpec): LLMConfig {
  const apiKeyMap: Record<string, string> = {
    deepseek: env.DEEPSEEK_API_KEY,
    kimi: env.KIMI_API_KEY,
  };
  const baseUrlMap: Record<string, string> = {
    deepseek: env.DEEPSEEK_BASE_URL,
    kimi: env.KIMI_BASE_URL,
  };

  return {
    provider: spec.provider,
    apiKey: apiKeyMap[spec.provider] ?? "",
    baseUrl: baseUrlMap[spec.provider] || undefined,
    model: spec.apiModel,
    temperature: env.LLM_TEMPERATURE,
    maxTokens: env.LLM_MAX_TOKENS,
  };
}

async function createAgentDeps(input?: Pick<RunTurnInput, "model" | "thinkingEnabled">) {
  logAgentIpc("creating agent dependencies");
  const modelSpec = resolveModelSpec(input?.model);
  const thinkingEnabled = input?.thinkingEnabled ?? modelSpec.thinkingDefault;
  const llm = createLLMService(createLLMConfigFromSpec(modelSpec));
  const workspaceRoot = await getWorkspaceRoot();
  const toolManager = createToolManager({
    workspaceRoot,
    primaryProvider: modelSpec.provider,
    hasKimiKey: Boolean(env.KIMI_API_KEY),
  });
  const systemPromptModule = new SystemPromptContext(MAIN_AGENT_SYSTEM_PROMPT);
  const contextManager = new ContextManager({ systemPromptModule });
  logAgentIpc("agent dependencies ready", {
    workspaceRoot,
    modelId: modelSpec.id,
    provider: modelSpec.provider,
    apiModel: modelSpec.apiModel,
    hasKimiKey: Boolean(env.KIMI_API_KEY),
    thinkingEnabled,
  });
  return { llm, toolManager, contextManager, thinkingEnabled };
}

function getMainWindow(): BrowserWindow | undefined {
  return BrowserWindow.getAllWindows()[0];
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

async function runAndPersistTurn(input: RunTurnInput): Promise<AgentTurnResult> {
  logAgentIpc("run turn requested", {
    sessionId: input.sessionId,
    turnId: input.turnId,
    userInputLength: input.userInput.length,
    userInputPreview: preview(input.userInput),
    model: input.model,
    thinkingEnabled: Boolean(input.thinkingEnabled),
  });
  const roots = await ensureDataDirectories();
  let runLogger: AgentRunLogger | undefined;
  try {
    await cleanupOldAgentRunLogs(roots.logRoot);
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
    logAgentIpc("run log created", {
      sessionId: input.sessionId,
      turnId: input.turnId,
      filePath: runLogger.filePath,
    });
  }
  const deps = await createAgentDeps(input);
  await writeAgentRunLog(runLogger, "main_event", {
    stage: "agent_dependencies_ready",
    workspaceRoot: roots.workspaceRoot,
  });
  const win = getMainWindow();

  const result = await runTurnWithAgent(
    {
      sessionId: input.sessionId,
      turnId: input.turnId,
      userInput: input.userInput,
      thinkingEnabled: input.thinkingEnabled,
    },
    deps,
    {
      onStreamEvent: (event) => {
        logAgentIpc("stream event sent to renderer", {
          sessionId: "sessionId" in event ? event.sessionId : input.sessionId,
          turnId: "turnId" in event ? event.turnId : input.turnId,
          type: event.type,
        });
        win?.webContents.send("agent:stream", event);
      },
      runLogger,
    },
  );

  const sessionDir = join(roots.sessionRoot, input.sessionId);
  await writeAgentRunLog(runLogger, "main_event", {
    stage: "persisting_turn_result",
    sessionDir,
    status: result.status,
    eventCount: result.events.length,
  });
  logAgentIpc("persisting turn result", {
    sessionId: input.sessionId,
    turnId: input.turnId,
    sessionDir,
    status: result.status,
    eventCount: result.events.length,
  });
  await writeSessionResult(createSessionStorePaths(sessionDir), result);
  await writeAgentRunLog(runLogger, "main_event", {
    stage: "turn_result_persisted",
    status: result.status,
  });
  logAgentIpc("turn result persisted", {
    sessionId: input.sessionId,
    turnId: input.turnId,
    status: result.status,
  });
  return result;
}

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
    try {
      const result = await runAndPersistTurn(input);
      logAgentIpc("run turn completed", {
        sessionId: input.sessionId,
        turnId: input.turnId,
        status: result.status,
      });
      return result;
    } catch (error) {
      logAgentIpc("run turn failed before response", {
        sessionId: input.sessionId,
        turnId: input.turnId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
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

  ipcMain.handle("session:create", async (_event, input: SessionCreateInput = {}) => {
    const roots = await ensureDataDirectories();
    return createSessionRecord(roots.sessionRoot, input);
  });
}

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
