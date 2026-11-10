/** `pythonRuntime.getStatus` / `installExtension`: the 脚本运行时 panel under the 命令行 plugin row. */
import type { BrowserWindow } from "electron";
import { desktopBridgeContract as contract } from "@actspace/shared/desktop-bridge";
import { createIpcRegistrar } from "../ipc/registry";
import type { PythonRuntimeService } from "./python-runtime-service";

export function registerPythonRuntimeIpc(options: { readonly getMainWindow: () => BrowserWindow | undefined; readonly service: PythonRuntimeService }): () => void {
  const ipc = createIpcRegistrar({ getWindow: () => options.getMainWindow() ?? null, untrustedMessage: "无效的脚本运行时请求来源。" });
  ipc.handle(contract.pythonRuntime.getStatus, async () => options.service.getStatus());
  ipc.handle(contract.pythonRuntime.installExtension, async () => options.service.installExtension());
  return () => ipc.dispose();
}
