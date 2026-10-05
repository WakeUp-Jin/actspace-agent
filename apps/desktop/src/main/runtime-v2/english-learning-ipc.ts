import type { BrowserWindow } from "electron";
import { ENGLISH_LEARNING_CHANNELS, type EnglishLearningTargetInput } from "@actspace/shared";
import { desktopBridgeContract as contract } from "@actspace/shared/desktop-bridge";
import type { SettingsService } from "../settings-service";
import type { DesktopRuntimeV2Registry } from "./runtime-registry";
import { createIpcRegistrar } from "../ipc/registry";

export function registerEnglishLearningIpc(options: { registry: DesktopRuntimeV2Registry; settings: SettingsService; getMainWindow: () => BrowserWindow | null }): () => void {
  const { registry, settings } = options;
  const ipc = createIpcRegistrar({
    getWindow: options.getMainWindow,
    untrustedMessage: "无效的英语辅助学习请求来源。",
    // 内部错误不透传给 renderer，统一成一句可操作的提示。
    middleware: async (_call, next) => {
      try { return await next(); }
      catch { throw new Error("英语辅助学习操作失败，请检查会话与配置后重试。"); }
    },
  });
  ipc.handle(contract.englishLearning.getState, () => registry.englishLearning().getState());
  ipc.handle(contract.englishLearning.setTarget, async (value: unknown) => {
    if (!value || typeof value !== "object") throw new Error("请选择有效会话。");
    const input = value as EnglishLearningTargetInput;
    if (typeof input.enabled !== "boolean" || (input.sessionId !== null && (typeof input.sessionId !== "string" || input.sessionId.length > 200)) || (input.enabled && !input.sessionId)) throw new Error("请选择有效会话。");
    return registry.setEnglishLearningTarget(input, async () => {
      const snapshot = settings.getV4();
      await settings.updateNamespaceV4({ expectedRevision: snapshot.revision, namespace: "general", patch: { englishLearning: { lastSessionId: input.sessionId } } });
    });
  });
  ipc.handle(contract.englishLearning.stopSpeech, () => registry.englishLearning().stop());
  ipc.handle(contract.englishLearning.previewSpeech, () => registry.englishLearning().preview());
  const remove = registry.subscribeEnglishLearning((state) => {
    const window = options.getMainWindow();
    if (window && !window.isDestroyed()) window.webContents.send(ENGLISH_LEARNING_CHANNELS.stateChanged, state);
  });
  return () => {
    remove();
    ipc.dispose();
  };
}
