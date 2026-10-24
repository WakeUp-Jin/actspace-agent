import { describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ReviewGitEngine } from "../review-git-engine";
import type { ReviewGetSnapshotResult } from "@actspace/shared";
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
  it.each(["refresh", "mismatched-id"])("preserves the authorized Session root for Review %s", async (operation) => {
    handlers.clear();
    const root = await mkdtemp(join(tmpdir(), "review-session-refresh-"));
    const workspace = join(root, "worktree");
    const registered = join(root, "registered");
    await Promise.all([mkdir(workspace), mkdir(registered)]);
    const git = (args: string[]) => promisify(execFile)("git", args, { cwd: workspace });
    await git(["init", "-b", "main"]);
    await writeFile(join(workspace, "sample.txt"), "before\n");
    await git(["add", "."]);
    await git(["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "fixture"]);
    const engine = new ReviewGitEngine();
    const realSnapshot = engine.getSnapshot.bind(engine);
    const snapshotSpy = vi.spyOn(ReviewGitEngine.prototype, "getSnapshot").mockImplementation(realSnapshot);
    const trusted = trustedWindow();
    const registration = registerRuntimeV2DesktopShell({
      roots: { dataRoot: root, sessionRoot: join(root, "sessions-v2"), logRoot: join(root, "logs"), tmpRoot: join(root, "tmp"), defaultWorkspaceRoot: registered, workspaceRoot: registered },
      getMainWindow: () => trusted.window as never,
      listSessions: async () => [{ workspaceRoot: workspace }],
    });
    const invoke = (channel: string, workspaceId?: string) => handlers.get(channel)!(trusted.event, { workspaceRoot: workspace, workspaceId, selection: { kind: "uncommitted" } }) as Promise<ReviewGetSnapshotResult>;
    try {
      const initial = await invoke(RUNTIME_V2_FIXED_RENDERER_CHANNELS.getReviewSnapshot);
      if (!initial.ok) throw new Error(initial.message);
      if (operation === "refresh") {
        await writeFile(join(workspace, "sample.txt"), "after\n");
        const refreshed = await invoke(RUNTIME_V2_FIXED_RENDERER_CHANNELS.refreshReviewSnapshot);
        expect(refreshed).toMatchObject({ ok: true, snapshot: { workspaceRoot: initial.snapshot.workspaceRoot, files: [expect.objectContaining({ path: "sample.txt" })] } });
        if (refreshed.ok) expect(refreshed.snapshot.generation).toBeGreaterThan(initial.snapshot.generation);
      } else {
        // A valid root must not silently override an unrelated explicit identity.
        expect(await invoke(RUNTIME_V2_FIXED_RENDERER_CHANNELS.getReviewSnapshot, "unknown-workspace")).toMatchObject({ ok: false, code: "invalid_workspace" });
        expect(await invoke(RUNTIME_V2_FIXED_RENDERER_CHANNELS.refreshReviewSnapshot, "session-root:wrong")).toMatchObject({ ok: false, code: "invalid_workspace" });
      }
    } finally {
      registration.dispose();
      snapshotSpy.mockRestore();
      await rm(root, { recursive: true, force: true });
    }
  });
  it.each([false, true])("invalidates real external writes and disposes watches (Session-only root: %s)", async (sessionOnly) => {
    handlers.clear();
    const root = await mkdtemp(join(tmpdir(), "review-external-write-"));
    const workspace = join(root, "workspace");
    await mkdir(workspace);
    const registeredRoot = sessionOnly ? join(root, "registered") : workspace;
    await mkdir(registeredRoot, { recursive: true });
    const git = (args: string[]) => promisify(execFile)("git", args, { cwd: workspace });
    await git(["init", "-b", "main"]);
    await writeFile(join(workspace, "sample.txt"), "before\n");
    await git(["add", "."]);
    await git(["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "fixture"]);
    // Exercise the real Git snapshot below the IPC boundary, without a worker fixture.
    const realEngine = new ReviewGitEngine();
    const realSnapshot = realEngine.getSnapshot.bind(realEngine);
    const snapshotSpy = vi.spyOn(ReviewGitEngine.prototype, "getSnapshot").mockImplementation(realSnapshot);
    const trusted = trustedWindow();
    const send = vi.spyOn(trusted.window.webContents, "send");
    const registration = registerRuntimeV2DesktopShell({
      roots: { dataRoot: root, sessionRoot: join(root, "sessions-v2"), logRoot: join(root, "logs"), tmpRoot: join(root, "tmp"), defaultWorkspaceRoot: registeredRoot, workspaceRoot: registeredRoot },
      getMainWindow: () => trusted.window as never,
      listSessions: async () => sessionOnly ? [{ workspaceRoot: workspace }] : [],
    });
    const snapshot = () => handlers.get(RUNTIME_V2_FIXED_RENDERER_CHANNELS.getReviewSnapshot)!(trusted.event, { workspaceRoot: workspace, selection: { kind: "uncommitted" } }) as Promise<{ ok: boolean; snapshot: { generation: number; files: { path: string }[] } }>;
    try {
      const before = await snapshot();
      expect(before.snapshot.files).toEqual([]);
      await writeFile(join(workspace, "sample.txt"), "before\nafter\n");
      await vi.waitFor(() => expect(send).toHaveBeenCalledWith(RUNTIME_V2_FIXED_RENDERER_CHANNELS.reviewChanged, expect.objectContaining({ reason: "watch" })), { timeout: 2500 });
      const after = await snapshot();
      expect(after.snapshot.generation).toBeGreaterThan(before.snapshot.generation);
      expect(after.snapshot.files.map(file => file.path)).toContain("sample.txt");
      const count = send.mock.calls.length;
      await snapshot();
      await new Promise(resolve => setTimeout(resolve, 250));
      expect(send).toHaveBeenCalledTimes(count);
      registration.dispose();
      await writeFile(join(workspace, "sample.txt"), "after dispose\n");
      await new Promise(resolve => setTimeout(resolve, 250));
      expect(send).toHaveBeenCalledTimes(count);
    } finally {
      registration.dispose();
      snapshotSpy.mockRestore();
      await rm(root, { recursive: true, force: true });
    }
  });
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
