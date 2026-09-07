import { afterEach, expect, it, vi } from "vitest";
import { ENGLISH_LEARNING_CHANNELS as channels } from "@actspace/shared";
import { registerEnglishLearningIpc } from "../runtime-v2/english-learning-ipc";

const { handlers, removeHandler } = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => any>(), removeHandler: vi.fn() }));
vi.mock("electron", () => ({ ipcMain: { handle: (name: string, action: (...args: any[]) => any) => handlers.set(name, action), removeHandler } }));
afterEach(() => { handlers.clear(); vi.clearAllMocks(); });

it("guards the renderer frame and DTO, honors persistence conflicts, and releases handlers", async () => {
  const frame = {}; const sender = { mainFrame: frame, send: vi.fn() }; const event = { sender, senderFrame: frame };
  const off = vi.fn(); const service = { getState: vi.fn(() => ({ enabled: false })), subscribe: vi.fn(() => off), stop: vi.fn(), preview: vi.fn() };
  const registry = { englishLearning: () => service, setEnglishLearningTarget: vi.fn(async (_input, persist) => { await persist(); return service.getState(); }) };
  const settings = { getV4: () => ({ revision: "one" }), updateNamespaceV4: vi.fn().mockRejectedValue(new Error("设置已更新")) };
  const dispose = registerEnglishLearningIpc({ registry, settings, getMainWindow: () => ({ webContents: sender, isDestroyed: () => false }) } as any);
  await expect(handlers.get(channels.getState)!({ sender: {}, senderFrame: frame })).rejects.toThrow("来源");
  await expect(handlers.get(channels.preview)!({ sender, senderFrame: {} })).rejects.toThrow("来源");
  await expect(handlers.get(channels.setTarget)!(event, { enabled: true, sessionId: null })).rejects.toThrow("会话");
  await expect(handlers.get(channels.setTarget)!(event, { enabled: true, sessionId: "a" })).rejects.toThrow("操作失败");
  settings.updateNamespaceV4.mockResolvedValue({ ok: true });
  await expect(handlers.get(channels.setTarget)!(event, { enabled: false, sessionId: "a" })).resolves.toEqual({ enabled: false });
  expect(settings.updateNamespaceV4).toHaveBeenLastCalledWith({ expectedRevision: "one", namespace: "general", patch: { englishLearning: { lastSessionId: "a" } } });
  dispose(); expect(off).toHaveBeenCalledOnce(); expect(removeHandler).toHaveBeenCalledTimes(4);
});
