import { describe, expect, it, vi } from "vitest";
import { RUNTIME_V2_FIXED_RENDERER_CHANNELS } from "@actspace/shared/runtime-v2";

const { handlers, removeHandler } = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  return { handlers, removeHandler: vi.fn((channel: string) => handlers.delete(channel)) };
});

vi.mock("electron", () => ({
  ipcMain: {
    handle: (channel: string, listener: (...args: unknown[]) => unknown) => handlers.set(channel, listener),
    removeHandler,
  },
  BrowserWindow: class {},
}));

vi.mock("../review-git-worker-client", () => ({
  ReviewGitWorkerClient: class {
    runGit = vi.fn();
    parsePatches = vi.fn();
    loadGitObjects = vi.fn();
    dispose = vi.fn();
  },
}));

import { registerRuntimeV2DesktopShell } from "../runtime-v2/desktop-shell-ipc";

describe("runtime v2 desktop shell IPC", () => {
  it("keeps Workspace and Review active while Terminal is unavailable", () => {
    handlers.clear();
    removeHandler.mockClear();
    const registration = registerRuntimeV2DesktopShell({
      roots: { dataRoot: "/data", sessionRoot: "/data/sessions-v2", logRoot: "/logs", tmpRoot: "/tmp", defaultWorkspaceRoot: "/workspace", workspaceRoot: "/workspace" },
      terminalAvailable: false,
    });

    expect(handlers.has(RUNTIME_V2_FIXED_RENDERER_CHANNELS.listWorkspaces)).toBe(true);
    expect(handlers.has(RUNTIME_V2_FIXED_RENDERER_CHANNELS.getReviewSnapshot)).toBe(true);
    expect(handlers.has(RUNTIME_V2_FIXED_RENDERER_CHANNELS.terminalCreate)).toBe(false);
    expect([...handlers.keys()].every((channel) => channel.startsWith("runtime-v2:fixed-renderer:"))).toBe(true);

    registration.dispose();
    expect(removeHandler).toHaveBeenCalledWith(RUNTIME_V2_FIXED_RENDERER_CHANNELS.listWorkspaces);
    expect(handlers.size).toBe(0);
  });
});
