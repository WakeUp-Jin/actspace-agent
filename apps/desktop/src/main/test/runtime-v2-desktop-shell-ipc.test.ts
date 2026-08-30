import { describe, expect, it, vi } from "vitest";
import { RUNTIME_V2_DESKTOP_SHELL_CHANNELS } from "@actspace/shared/runtime-v2";

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
  it("keeps Workspace and Review active while reporting a missing Terminal dependency", async () => {
    handlers.clear();
    const registration = registerRuntimeV2DesktopShell({
      roots: { dataRoot: "/data", sessionRoot: "/data/sessions-v2", logRoot: "/logs", tmpRoot: "/tmp", defaultWorkspaceRoot: "/workspace", workspaceRoot: "/workspace" },
      terminalAvailable: false,
      terminalUnavailableReason: "node-pty is not installed in this build.",
    });

    const capabilities = await handlers.get(RUNTIME_V2_DESKTOP_SHELL_CHANNELS.capabilities)?.({});
    expect(capabilities).toEqual({ workspace: { available: true }, review: { available: true }, terminal: { available: false, reason: "node-pty is not installed in this build." } });
    expect(handlers.has(RUNTIME_V2_DESKTOP_SHELL_CHANNELS.terminalCreate)).toBe(false);

    registration.dispose();
    expect(removeHandler).toHaveBeenCalledWith(RUNTIME_V2_DESKTOP_SHELL_CHANNELS.capabilities);
  });
});
