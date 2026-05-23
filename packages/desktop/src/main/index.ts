import { app, BrowserWindow, ipcMain } from "electron";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { AgentTurnResult, RunTurnInput, SessionCreateInput, SessionGetInput } from "@actspace/shared";
import {
  createBootstrapState,
  loadEnv,
  createLLMServiceFromEnv,
  createToolManager,
  ContextManager,
  SystemPromptContext,
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

type AppDataRoots = {
  dataRoot: string;
  sessionRoot: string;
  logRoot: string;
  tmpRoot: string;
};

async function ensureDataDirectories(): Promise<AppDataRoots> {
  const dataRoot = app.getPath("userData");
  const sessionRoot = join(dataRoot, "sessions");
  const logRoot = join(dataRoot, "logs");
  const tmpRoot = join(dataRoot, "tmp");

  await mkdir(sessionRoot, { recursive: true });
  await mkdir(logRoot, { recursive: true });
  await mkdir(tmpRoot, { recursive: true });

  return {
    dataRoot,
    sessionRoot,
    logRoot,
    tmpRoot
  };
}

function configureAppPaths() {
  app.setName(APP_NAME);
  const userDataRoot = join(app.getPath("appData"), APP_NAME);
  app.setPath("userData", userDataRoot);
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

  if (DEV_SERVER_URL) {
    try {
      await win.loadURL(DEV_SERVER_URL);
    } catch (error) {
      console.error(`Failed to load dev server URL: ${DEV_SERVER_URL}`, error);
      throw error;
    }
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    await win.loadFile(join(__dirname, "..", "..", "dist", "index.html"));
  }
}

function createAgentDeps() {
  const llm = createLLMServiceFromEnv();
  const toolManager = createToolManager({ workspaceRoot: app.getPath("userData") });
  const systemPromptModule = new SystemPromptContext(
    "You are actspace, a helpful AI coding assistant.",
  );
  const contextManager = new ContextManager({ systemPromptModule });
  return { llm, toolManager, contextManager };
}

function getMainWindow(): BrowserWindow | undefined {
  return BrowserWindow.getAllWindows()[0];
}

async function runAndPersistTurn(input: RunTurnInput): Promise<AgentTurnResult> {
  const roots = await ensureDataDirectories();
  const deps = createAgentDeps();
  const win = getMainWindow();

  const result = await runTurnWithAgent(
    { sessionId: input.sessionId, turnId: input.turnId, userInput: input.userInput },
    deps,
    {
      onStreamEvent: (event) => {
        win?.webContents.send("agent:stream", event);
      },
    },
  );

  const sessionDir = join(roots.sessionRoot, input.sessionId);
  await writeSessionResult(createSessionStorePaths(sessionDir), result);
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
      tmpRoot: roots.tmpRoot
    });
  });

  ipcMain.handle("agent:run-turn", async (_event, input: RunTurnInput) => {
    return runAndPersistTurn(input);
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
