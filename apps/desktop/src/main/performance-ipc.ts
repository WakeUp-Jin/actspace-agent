import { app, type BrowserWindow } from "electron";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { desktopBridgeContract as contract } from "@actspace/shared/desktop-bridge";
import { createIpcRegistrar } from "./ipc/registry";

export function registerPerformanceIpc(getWindow: () => BrowserWindow | null): () => void {
  let histogram: ReturnType<typeof monitorEventLoopDelay> | undefined;
  let owner: BrowserWindow | null = null;
  const stop = () => { histogram?.disable(); histogram = undefined; };
  // 注册器已校验 sender 就是这个窗口，所以 handler 里 getWindow() 一定非空。
  const ipc = createIpcRegistrar({ getWindow, untrustedMessage: "Invalid performance request." });
  const unbind = () => {
    owner?.removeListener("hide", stop);
    owner?.removeListener("minimize", stop);
    owner?.webContents.removeListener("destroyed", stop);
    owner?.webContents.removeListener("did-start-loading", stop);
    owner?.webContents.removeListener("render-process-gone", stop);
  };
  ipc.handle(contract.performance.setActive, (active: unknown) => {
    const window = getWindow()!;
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
  ipc.handle(contract.performance.sample, () => {
    const window = getWindow()!;
    if (!histogram || !window.isVisible() || window.isMinimized()) throw new Error("Performance monitoring paused.");
    const mainDelayMs = Math.max(0, histogram.max / 1e6 - 100);
    histogram.reset();
    return { sampledAt: Date.now(), mainDelayMs, processes: app.getAppMetrics().map(row => ({
      pid: row.pid, type: row.type, cpuPercent: row.cpu.percentCPUUsage, workingSetKiB: row.memory.workingSetSize,
    })) };
  });
  return () => {
    stop(); unbind();
    ipc.dispose();
  };
}
