/**
 * Stub IPC handlers for plugins that are switched off. The channels and contract stay (the renderer bridge
 * and `check:ipc-channels` keep their shape); only the behavior is replaced: status calls report "not
 * enabled" and everything else fails with a one-line, actionable message.
 */
import type { BrowserWindow } from "electron";
import type { BrowserBridgeStatus, EnglishLearningState } from "@actspace/shared";
import { desktopBridgeContract as contract } from "@actspace/shared/desktop-bridge";
import { createIpcRegistrar, type IpcRegistrar } from "../ipc/registry";

export const PLUGIN_DISABLED_MESSAGE = "插件未开启";

export function disabledBrowserBridgeStatus(): BrowserBridgeStatus {
  return {
    installed: false,
    abbPath: "",
    runState: "disabled",
    doctorChecks: [],
    enabled: false,
    connectionState: "disconnected",
    allowedActions: [],
    lastError: "操控浏览器插件未开启，请在 扩展 › 插件 中开启后重启。",
  };
}

export function disabledEnglishLearningState(): EnglishLearningState {
  return { enabled: false, targetSessionId: null, revision: 0, promptStatus: "off", speechStatus: "unsupported", queuedSegments: 0, hasApiKey: false, notice: "英语学习插件未开启，请在 扩展 › 插件 中开启后重启。", error: null };
}

const reject = (): never => { throw new Error(PLUGIN_DISABLED_MESSAGE); };

export function registerDisabledBrowserBridgeIpc(ipc: IpcRegistrar): void {
  const bridge = contract.browserBridge;
  ipc.handle(bridge.getStatus, () => disabledBrowserBridgeStatus());
  ipc.handle(bridge.connect, reject);
  ipc.handle(bridge.useSourceExtension, reject);
  ipc.handle(bridge.prepareUpdate, reject);
  ipc.handle(bridge.disconnect, reject);
  ipc.handle(bridge.selectInstance, reject);
  ipc.handle(bridge.openExtensions, reject);
  ipc.handle(bridge.revealExtensionDirectory, reject);
  ipc.handle(bridge.installFromRepo, reject);
  ipc.handle(bridge.installNativeHost, reject);
}

export function registerDisabledEnglishLearningIpc(options: { getMainWindow: () => BrowserWindow | null }): () => void {
  const ipc = createIpcRegistrar({ getWindow: options.getMainWindow, untrustedMessage: "无效的英语辅助学习请求来源。" });
  ipc.handle(contract.englishLearning.getState, () => disabledEnglishLearningState());
  ipc.handle(contract.englishLearning.setTarget, reject);
  ipc.handle(contract.englishLearning.stopSpeech, reject);
  ipc.handle(contract.englishLearning.previewSpeech, reject);
  return () => ipc.dispose();
}
