import { app, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from "electron";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { PERFORMANCE_CHANNELS, type DesktopPerformanceSnapshot } from "@actspace/shared";

export function registerPerformanceIpc(getWindow: () => BrowserWindow | null): () => void {
  let histogram: ReturnType<typeof monitorEventLoopDelay> | undefined;
  let owner: BrowserWindow | null = null;
  const stop = () => { histogram?.disable(); histogram = undefined; };
  const authorize = (event: IpcMainInvokeEvent) => {
    const window = getWindow();
    if (!window || event.sender !== window.webContents || event.senderFrame !== event.sender.mainFrame) throw new Error("Invalid performance request.");
    return window;
  };
  const unbind = () => {
    owner?.removeListener("hide", stop);
    owner?.removeListener("minimize", stop);
    owner?.webContents.removeListener("destroyed", stop);
    owner?.webContents.removeListener("did-start-loading", stop);
    owner?.webContents.removeListener("render-process-gone", stop);
  };
  ipcMain.handle(PERFORMANCE_CHANNELS.active, (event, active: unknown) => {
    const window = authorize(event);
    if (typeof active !== "boolean") throw new TypeError("Invalid monitoring state.");
    stop();
    if (!active || !window.isVisible() || window.isMinimized()) return;
    unbind(); owner = window;
    owner.on("hide", stop); owner.on("minimize", stop);
    owner.webContents.on("did-start-loading", stop);
    owner.webContents.on("destroyed", stop); owner.webContents.on("render-process-gone", stop);
    histogram = monitorEventLoopDelay({ resolution: 100 });
    histogram.enable();
    app.getAppMetrics(); // Prime CPU deltas; first sample is not an interval estimate.
  });
  ipcMain.handle(PERFORMANCE_CHANNELS.sample, (event): DesktopPerformanceSnapshot => {
    const window = authorize(event);
    if (!histogram || !window.isVisible() || window.isMinimized()) throw new Error("Performance monitoring paused.");
    const mainDelayMs = Math.max(0, histogram.max / 1e6 - 100);
    histogram.reset();
    return { sampledAt: Date.now(), mainDelayMs, processes: app.getAppMetrics().map(row => ({
      pid: row.pid, type: row.type, cpuPercent: row.cpu.percentCPUUsage, workingSetKiB: row.memory.workingSetSize,
    })) };
  });
  return () => {
    stop(); unbind();
    ipcMain.removeHandler(PERFORMANCE_CHANNELS.active);
    ipcMain.removeHandler(PERFORMANCE_CHANNELS.sample);
  };
}
