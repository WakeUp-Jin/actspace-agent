import { afterEach, describe, expect, it, vi } from "vitest";
import { RUNTIME_V2_FIXED_RENDERER_CHANNELS } from "@actspace/shared/runtime-v2";
import type { SelectWorkspaceDirectoryResult } from "@actspace/shared";

const { handlers, showOpenDialog } = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  showOpenDialog: vi.fn(),
}));

vi.mock("electron", () => ({
  dialog: { showOpenDialog }, nativeImage: {}, nativeTheme: {},
  ipcMain: {
    handle: (channel: string, listener: (...args: unknown[]) => unknown) => handlers.set(channel, listener),
    removeHandler: (channel: string) => handlers.delete(channel),
    on: vi.fn(), removeListener: vi.fn(),
  },
}));

import { registerFixedRendererIpc, type FixedRendererIpcOptions } from "../runtime-v2/fixed-renderer-ipc";

afterEach(() => { handlers.clear(); vi.clearAllMocks(); });

describe("workspace directory picker IPC contract", () => {
  it.each([
    [{ canceled: false, filePaths: ["/work/commerce-agent"] }, { canceled: false, workspaceRoot: "/work/commerce-agent" }],
    [{ canceled: true, filePaths: [] }, { canceled: true }],
    [{ canceled: false, filePaths: [] }, { canceled: true }],
  ])("returns the renderer contract for %j", async (dialogResult, expected) => {
    const mainWindow = { isDestroyed: () => false, webContents: { id: 7 } };
    const registration = registerFixedRendererIpc({
      roots: { dataRoot: "/tmp/picker-test", workspaceRoot: "/work", defaultWorkspaceRoot: "/work" },
      registry: { subscribe: () => () => undefined, subscribeRendererStream: () => () => undefined },
      settings: { subscribeV4Changes: () => () => undefined },
      getMainWindow: () => mainWindow,
    } as unknown as FixedRendererIpcOptions);
    try {
      showOpenDialog.mockResolvedValueOnce(dialogResult);
      const result = await handlers.get(RUNTIME_V2_FIXED_RENDERER_CHANNELS.selectWorkspaceDirectory)!(
        { sender: { id: 7 } },
      ) as SelectWorkspaceDirectoryResult;
      expect(result).toEqual(expected);
      expect(showOpenDialog).toHaveBeenCalledWith(mainWindow, { properties: ["openDirectory"] });
    } finally {
      registration.dispose();
    }
  });
});
