import {
  buildBridge,
  desktopBridgeContract,
  type BridgeTransport,
  type DesktopFileHandle,
} from "@actspace/shared/desktop-bridge";
import { contextBridge, ipcRenderer, webFrame, webUtils } from "electron";

/**
 * Preload 只做转发：成员、channel、默认入参全部来自 `desktopBridgeContract`，
 * 会话投影等 renderer 逻辑在 `renderer/api/` 里完成。
 */
const transport: BridgeTransport = {
  invoke: (channel, input) => ipcRenderer.invoke(channel, input),
  send: (channel, input) => ipcRenderer.send(channel, input),
  on: (channel, listener) => {
    const handler = (_event: unknown, payload: unknown) => listener(payload);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
};

const bridge = buildBridge(desktopBridgeContract, transport, {
  "dialogs.getPathForFile": (file: DesktopFileHandle) => webUtils.getPathForFile(file as File),
  // 整窗缩放：preload 直接调 webFrame，无需 IPC 往返。外观设置的「界面字号」用它实现。
  "appearance.setUiZoom": (factor: number) => webFrame.setZoomFactor(factor),
});

contextBridge.exposeInMainWorld("actspace", bridge);
