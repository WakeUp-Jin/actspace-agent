import { ipcMain, type BrowserWindow } from "electron";
import { ENGLISH_LEARNING_CHANNELS, type EnglishLearningTargetInput } from "@actspace/shared";
import type { SettingsService } from "../settings-service";
import type { DesktopRuntimeV2Registry } from "./runtime-registry";

export function registerEnglishLearningIpc(options: { registry: DesktopRuntimeV2Registry; settings: SettingsService; getMainWindow: () => BrowserWindow | null }): () => void {
  const { registry, settings } = options;
  const channels = ENGLISH_LEARNING_CHANNELS;
  const handle = (channel: string, action: (input: unknown) => unknown) => {
    ipcMain.handle(channel, async (event, input) => {
      if (event.sender !== options.getMainWindow()?.webContents || event.senderFrame !== event.sender.mainFrame) throw new Error("无效的英语辅助学习请求来源。");
      try { return await action(input); }
      catch { throw new Error("英语辅助学习操作失败，请检查会话与配置后重试。"); }
    });
  };
  handle(channels.getState, () => registry.englishLearning().getState());
  handle(channels.setTarget, async (value) => {
    if (!value || typeof value !== "object") throw new Error("请选择有效会话。");
    const input = value as EnglishLearningTargetInput;
    if (typeof input.enabled !== "boolean" || (input.sessionId !== null && (typeof input.sessionId !== "string" || input.sessionId.length > 200)) || (input.enabled && !input.sessionId)) throw new Error("请选择有效会话。");
    return registry.setEnglishLearningTarget(input, async () => {
      const snapshot = settings.getV4();
      await settings.updateNamespaceV4({ expectedRevision: snapshot.revision, namespace: "general", patch: { englishLearning: { lastSessionId: input.sessionId } } });
    });
  });
  handle(channels.stop, () => registry.englishLearning().stop());
  handle(channels.preview, () => registry.englishLearning().preview());
  const remove = registry.englishLearning().subscribe((state) => {
    const window = options.getMainWindow();
    if (window && !window.isDestroyed()) window.webContents.send(channels.stateChanged, state);
  });
  return () => {
    remove();
    for (const channel of [channels.getState, channels.setTarget, channels.stop, channels.preview]) ipcMain.removeHandler(channel);
  };
}
