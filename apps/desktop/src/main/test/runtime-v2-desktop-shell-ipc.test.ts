import { describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
import { trustedWindow } from "./ipc-sender-fixture";

describe("runtime v2 desktop shell IPC", () => {
  it("keeps Workspace and Review active while Terminal is unavailable", () => {
    handlers.clear();
    removeHandler.mockClear();
    const registration = registerRuntimeV2DesktopShell({
      roots: { dataRoot: "/data", sessionRoot: "/data/sessions-v2", logRoot: "/logs", tmpRoot: "/tmp", defaultWorkspaceRoot: "/workspace", workspaceRoot: "/workspace" },
      terminalAvailable: false,
      getMainWindow: () => undefined,
      listSessions: async () => [],
    });

    expect(handlers.has(RUNTIME_V2_FIXED_RENDERER_CHANNELS.listWorkspaces)).toBe(true);
    expect(handlers.has(RUNTIME_V2_FIXED_RENDERER_CHANNELS.getReviewSnapshot)).toBe(true);
    expect(handlers.has(RUNTIME_V2_FIXED_RENDERER_CHANNELS.terminalCreate)).toBe(false);
    expect([...handlers.keys()].every((channel) => channel.startsWith("runtime-v2:fixed-renderer:"))).toBe(true);

    registration.dispose();
    expect(removeHandler).toHaveBeenCalledWith(RUNTIME_V2_FIXED_RENDERER_CHANNELS.listWorkspaces);
    expect(handlers.size).toBe(0);
  });

  it("rejects calls when the main window is missing", async () => {
    handlers.clear();
    const registration = registerRuntimeV2DesktopShell({
      roots: { dataRoot: "/data", sessionRoot: "/data/sessions-v2", logRoot: "/logs", tmpRoot: "/tmp", defaultWorkspaceRoot: "/workspace", workspaceRoot: "/workspace" },
      terminalAvailable: false,
      getMainWindow: () => undefined,
      listSessions: async () => [],
    });
    const { event } = trustedWindow();
    await expect(Promise.resolve().then(() => handlers.get(RUNTIME_V2_FIXED_RENDERER_CHANNELS.listWorkspaces)!(event))).rejects.toThrow("Untrusted shell sender");
    registration.dispose();
  });

  it("serves workspace files only for registered roots and local session roots", async () => {
    handlers.clear();
    const dataRoot = await mkdtemp(join(tmpdir(), "shell-workspace-access-"));
    const workspace = join(dataRoot, "workspace");
    const worktree = join(dataRoot, "worktree");
    const outside = join(dataRoot, "outside");
    await Promise.all([workspace, worktree, outside].map((dir) => mkdir(dir)));
    await Promise.all([workspace, worktree, outside].map((dir) => writeFile(join(dir, "a.txt"), dir)));
    const trusted = trustedWindow();
    const registration = registerRuntimeV2DesktopShell({
      roots: { dataRoot, sessionRoot: join(dataRoot, "sessions-v2"), logRoot: join(dataRoot, "logs"), tmpRoot: join(dataRoot, "tmp"), defaultWorkspaceRoot: workspace, workspaceRoot: workspace },
      terminalAvailable: false,
      getMainWindow: () => trusted.window as never,
      listSessions: async () => [{ workspaceRoot: worktree }],
    });
    const read = (workspaceRoot?: string) => Promise.resolve().then(() => handlers.get(RUNTIME_V2_FIXED_RENDERER_CHANNELS.readWorkspaceFile)!(trusted.event, { workspaceRoot, relativePath: "a.txt" }));
    try {
      expect(await read(workspace)).toMatchObject({ content: workspace });
      expect(await read()).toMatchObject({ content: workspace });
      expect(await read(worktree)).toMatchObject({ content: worktree });
      await expect(read(outside)).rejects.toThrow("workspace_not_registered");
      await expect(read("/")).rejects.toThrow("workspace_not_registered");
      await expect(Promise.resolve().then(() => handlers.get(RUNTIME_V2_FIXED_RENDERER_CHANNELS.listWorkspaceDir)!(trusted.event, { workspaceRoot: outside }))).rejects.toThrow("workspace_not_registered");
      await expect(Promise.resolve().then(() => handlers.get(RUNTIME_V2_FIXED_RENDERER_CHANNELS.statWorkspaceFile)!(trusted.event, { workspaceRoot: outside, relativePath: "a.txt" }))).rejects.toThrow("workspace_not_registered");
    } finally {
      registration.dispose();
      await rm(dataRoot, { recursive: true, force: true });
    }
  });
});
