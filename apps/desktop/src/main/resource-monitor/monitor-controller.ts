/**
 * 资源监控的主进程装配：一个采集器，两类订阅者（设置「资源占用」页、悬浮窗）。
 * 悬浮窗开关跟着 `general.performanceMonitoring` 走；页面订阅跟着 `resourceMonitor.watch` 走。
 * 规范：docs/design-docs/frontend/front-资源监控规范.md。
 */
import { execFile } from "node:child_process";
import { cpus } from "node:os";
import { join } from "node:path";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { app, BrowserWindow, nativeTheme, screen } from "electron";
import { desktopBridgeContract as contract } from "@actspace/shared/desktop-bridge";
import {
  RESOURCE_MONITOR_CHANNELS,
  type ResourceFloatLayout,
  type ResourceSampleNotice,
  type SettingsV4Snapshot,
  type SettingsV4UpdateInput,
} from "@actspace/shared";
import { createIpcRegistrar, type IpcRegistrar } from "../ipc/registry";
import { attachNavigationGuards, createAppUrlMatcher } from "../window-security";
import {
  FLOAT_HEIGHT_COLLAPSED,
  FLOAT_WIDTH_COLLAPSED,
  FLOAT_WIDTH_EXPANDED,
  readFloatWindowState,
  resolveFloatPosition,
  writeFloatWindowState,
} from "./float-bounds";
import { ResourceCollector } from "./resource-collector";
import { formatResourceSnapshot, parseFootprint } from "./snapshot-text";

export interface ResourceMonitorSettings {
  getV4(): SettingsV4Snapshot;
  subscribeV4Changes(listener: () => void): () => void;
  updateNamespaceV4(input: SettingsV4UpdateInput): Promise<SettingsV4Snapshot>;
}

export interface ResourceMonitorOptions {
  readonly settings: ResourceMonitorSettings;
  readonly getMainWindow: () => BrowserWindow | undefined;
  readonly dataRoot: string;
  readonly preloadPath: string;
  readonly devServerUrl: string | undefined;
  /** 打包后的 `dist` 目录；悬浮窗页面在 `dist/monitor/index.html`（来自 `apps/desktop/public/monitor/`）。 */
  readonly distRoot: string;
  readonly log: (message: string, details?: Record<string, unknown>) => void;
}

const FLOAT_MAX_HEIGHT = 640;
const SAVE_POSITION_DELAY_MS = 400;
const FOOTPRINT_TIMEOUT_MS = 15_000;

function runPs(): { pid: number | undefined; output: Promise<string> } {
  let pid: number | undefined;
  const output = new Promise<string>((resolve, reject) => {
    // 只取可执行文件路径（comm），不取命令行参数：参数里可能有路径和密钥。
    const child = execFile(
      "ps",
      ["-A", "-o", "pid=,ppid=,rss=,time=,comm="],
      { maxBuffer: 8 << 20, timeout: 5_000 },
      (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout);
      },
    );
    pid = child.pid;
  });
  return { pid, output };
}

function runFootprint(pids: readonly number[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "/usr/bin/footprint",
      pids.flatMap((pid) => ["-p", String(pid)]),
      { maxBuffer: 8 << 20, timeout: FOOTPRINT_TIMEOUT_MS },
      (error, stdout) => {
        if (error && !stdout) reject(error);
        else resolve(stdout);
      },
    );
  });
}

export class ResourceMonitorController {
  private readonly collector: ResourceCollector;
  private readonly mainIpc: IpcRegistrar;
  private readonly floatIpc: IpcRegistrar;
  private readonly unsubscribeSettings: () => void;
  private readonly floatStatePath: string;
  private floatWindow: BrowserWindow | null = null;
  private floatUnsubscribe: (() => void) | null = null;
  private floatOpening = false;
  private floatExpanded = false;
  private saveTimer: NodeJS.Timeout | null = null;
  private pageUnsubscribe: (() => void) | null = null;
  private disposed = false;

  constructor(private readonly options: ResourceMonitorOptions) {
    this.floatStatePath = join(options.dataRoot, "resource-monitor-window.json");
    this.collector = new ResourceCollector({
      getAppMetrics: () => app.getAppMetrics(),
      createHistogram: (resolution) => monitorEventLoopDelay({ resolution }),
      runPs: process.platform === "win32" ? null : runPs,
      mainPid: process.pid,
      monitorPids: () => {
        const window = this.floatWindow;
        return window && !window.isDestroyed() ? new Set([window.webContents.getOSProcessId()]) : new Set();
      },
      log: options.log,
    });

    this.mainIpc = createIpcRegistrar({ getWindow: () => options.getMainWindow() ?? null });
    this.mainIpc.handle(contract.resourceMonitor.watch, (active) => {
      if (active) this.watchPage();
      else this.unwatchPage();
      return this.collector.state();
    });
    this.mainIpc.handle(contract.resourceMonitor.copySnapshot, () => this.snapshotText());

    // 悬浮窗只能发这两条；主窗口发来的被注册器按 sender 忽略。
    this.floatIpc = createIpcRegistrar({ getWindow: () => this.floatWindow });
    this.floatIpc.on(contract.resourceMonitor.setFloatLayout, (input) => this.applyFloatLayout(input));
    this.floatIpc.on(contract.resourceMonitor.closeFloat, () => {
      void this.turnFloatOff();
    });

    this.unsubscribeSettings = options.settings.subscribeV4Changes(() => this.syncFloat());
    this.syncFloat();
  }

  /** 主窗口重新加载、崩溃或关闭时，它的页面订阅随之失效。 */
  attachMainWindow(window: BrowserWindow): void {
    const reset = () => this.unwatchPage();
    window.webContents.on("did-start-loading", reset);
    window.webContents.on("render-process-gone", reset);
    window.on("closed", reset);
  }

  /** 非 macOS 关主窗口要退出应用：先关悬浮窗，`window-all-closed` 才会触发。不改开关。 */
  closeFloatWindow(): void {
    this.floatWindow?.destroy();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeSettings();
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.mainIpc.dispose();
    this.floatIpc.dispose();
    this.closeFloatWindow();
    this.collector.dispose();
  }

  private watchPage(): void {
    if (this.pageUnsubscribe) return;
    this.pageUnsubscribe = this.collector.subscribe((sample, point) => {
      const window = this.options.getMainWindow();
      if (window && !window.isDestroyed())
        window.webContents.send(RESOURCE_MONITOR_CHANNELS.sample, { sample, point } satisfies ResourceSampleNotice);
    });
  }

  private unwatchPage(): void {
    this.pageUnsubscribe?.();
    this.pageUnsubscribe = null;
  }

  private floatEnabled(): boolean {
    return this.options.settings.getV4().settings.general.performanceMonitoring === true;
  }

  private syncFloat(): void {
    if (this.disposed) return;
    const enabled = this.floatEnabled();
    if (enabled && !this.floatWindow && !this.floatOpening) void this.openFloat();
    if (!enabled && this.floatWindow) this.closeFloatWindow();
  }

  private async turnFloatOff(): Promise<void> {
    try {
      const snapshot = this.options.settings.getV4();
      await this.options.settings.updateNamespaceV4({
        expectedRevision: snapshot.revision,
        namespace: "general",
        patch: { performanceMonitoring: false },
      });
    } catch (error) {
      this.options.log("resource monitor float close failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      // 写设置失败也要让 × 生效；下次启动按设置决定。
      this.closeFloatWindow();
    }
  }

  private async openFloat(): Promise<void> {
    this.floatOpening = true;
    try {
      const saved = await readFloatWindowState(this.floatStatePath);
      if (this.disposed || !this.floatEnabled() || this.floatWindow) return;
      this.floatExpanded = saved?.expanded === true;
      const width = this.floatExpanded ? FLOAT_WIDTH_EXPANDED : FLOAT_WIDTH_COLLAPSED;
      const position = resolveFloatPosition(
        saved,
        width,
        screen.getAllDisplays().map((display) => display.workArea),
        screen.getPrimaryDisplay().workArea,
      );
      const window = new BrowserWindow({
        ...position,
        width,
        height: FLOAT_HEIGHT_COLLAPSED,
        title: "ActSpace 资源监控",
        show: false,
        frame: false,
        resizable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        skipTaskbar: true,
        hiddenInMissionControl: true,
        acceptFirstMouse: true,
        // macOS 的 panel 点击时不激活应用，不会把主窗口一起带到前面。
        ...(process.platform === "darwin" ? { type: "panel" } : {}),
        backgroundColor: nativeTheme.shouldUseDarkColors ? "#30312d" : "#ffffff",
        webPreferences: {
          preload: this.options.preloadPath,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webviewTag: false,
          spellcheck: false,
        },
      });
      this.floatWindow = window;
      window.setAlwaysOnTop(true, "floating");
      window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
      const indexHtmlPath = join(this.options.distRoot, "monitor", "index.html");
      attachNavigationGuards(window, createAppUrlMatcher({ devServerUrl: this.options.devServerUrl, indexHtmlPath }));
      window.on("moved", () => this.schedulePositionSave());
      window.on("closed", () => {
        this.floatUnsubscribe?.();
        this.floatUnsubscribe = null;
        if (this.floatWindow === window) this.floatWindow = null;
        // 关闭期间开关又被打开了（例如快速开关）：重新打开。
        if (!this.disposed) this.syncFloat();
      });
      window.webContents.on("did-finish-load", () => {
        if (window.isDestroyed()) return;
        window.webContents.send(RESOURCE_MONITOR_CHANNELS.floatState, {
          ...this.collector.state(),
          expanded: this.floatExpanded,
        });
        if (!this.floatUnsubscribe) {
          this.floatUnsubscribe = this.collector.subscribe((sample, point) => {
            if (!window.isDestroyed())
              window.webContents.send(RESOURCE_MONITOR_CHANNELS.sample, {
                sample,
                point,
              } satisfies ResourceSampleNotice);
          });
        }
        if (!window.isVisible()) window.showInactive();
      });
      if (this.options.devServerUrl)
        await window.loadURL(new URL("monitor/index.html", this.options.devServerUrl).href);
      else await window.loadFile(indexHtmlPath);
    } catch (error) {
      this.options.log("resource monitor float open failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.floatOpening = false;
    }
  }

  private applyFloatLayout(input: unknown): void {
    const window = this.floatWindow;
    if (!window || window.isDestroyed() || !input || typeof input !== "object") return;
    const { expanded, height } = input as Partial<ResourceFloatLayout>;
    if (typeof expanded !== "boolean" || typeof height !== "number" || !Number.isFinite(height)) return;
    const nextHeight = Math.min(FLOAT_MAX_HEIGHT, Math.max(FLOAT_HEIGHT_COLLAPSED, Math.ceil(height)));
    const nextWidth = expanded ? FLOAT_WIDTH_EXPANDED : FLOAT_WIDTH_COLLAPSED;
    const bounds = window.getBounds();
    if (bounds.width !== nextWidth || bounds.height !== nextHeight) {
      // 宽度变化时保持右边缘不动（默认停在屏幕右上角，往左展开）。
      window.setBounds({ x: bounds.x + bounds.width - nextWidth, y: bounds.y, width: nextWidth, height: nextHeight });
    }
    if (expanded !== this.floatExpanded) {
      this.floatExpanded = expanded;
      this.schedulePositionSave();
    }
  }

  private schedulePositionSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      const window = this.floatWindow;
      if (!window || window.isDestroyed()) return;
      const { x, y } = window.getBounds();
      writeFloatWindowState(this.floatStatePath, { x, y, expanded: this.floatExpanded }).catch((error) =>
        this.options.log("resource monitor float state save failed", {
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }, SAVE_POSITION_DELAY_MS);
  }

  private async snapshotText(): Promise<string> {
    const sample = this.collector.state().latest;
    if (!sample) throw new Error("还没有读数，请稍等 2 秒再复制。");
    let footprint: Map<number, string> | Error | null = null;
    if (process.platform === "darwin") {
      const pids = sample.groups
        .filter((group) => group.id !== "agent")
        .flatMap((group) => group.processes.map((row) => row.pid))
        .filter((pid) => pid > 0);
      footprint = await runFootprint([...new Set(pids)]).then(parseFootprint, (error: unknown) =>
        error instanceof Error ? error : new Error(String(error)),
      );
    }
    return formatResourceSnapshot({
      sample,
      platform: `${process.platform} ${process.arch}`,
      cores: cpus().length,
      appVersion: app.getVersion(),
      footprint,
    });
  }
}
