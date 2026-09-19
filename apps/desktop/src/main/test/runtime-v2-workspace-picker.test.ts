import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readWorkspaceRegistry, resolveRegisteredWorkspaceSelection } from "../workspace-registry-service";
import { ReviewCoordinator } from "../review-coordinator";
import { ReviewGitEngine } from "../review-git-engine";
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


describe("workspace admission from the native picker", () => {
  it.each([[true, false], [false, false], [true, true]])("registers only explicit workspace selections (registerWorkspace=%s, git=%s)", async (registerWorkspace, git) => {
    const dataRoot = await mkdtemp(join(tmpdir(), "workspace-picker-"));
    const workspaceRoot = join(dataRoot, "plain-folder");
    await mkdir(workspaceRoot);
    if (git) {
      await promisify(execFile)("git", ["init", workspaceRoot]);
      await writeFile(join(workspaceRoot, "change.txt"), "visible change\n");
    }
    const roots = { dataRoot, workspaceRoot: join(dataRoot, "default"), defaultWorkspaceRoot: join(dataRoot, "default") };
    const registryOptions = { ...roots, fallbackWorkspaceRoot: roots.workspaceRoot };
    const mainWindow = { isDestroyed: () => false, webContents: { id: 7 } };
    const registration = registerFixedRendererIpc({
      roots,
      registry: { subscribe: () => () => undefined, subscribeRendererStream: () => () => undefined },
      settings: { subscribeV4Changes: () => () => undefined },
      getMainWindow: () => mainWindow,
    } as unknown as FixedRendererIpcOptions);
    const review = new ReviewCoordinator({
      resolveWorkspace: async (input) => {
        const resolved = await resolveRegisteredWorkspaceSelection(registryOptions, input);
        return resolved.ok ? { ok: true, workspace: resolved } : { ok: false, message: resolved.error };
      },
      queryProvider: new ReviewGitEngine(),
    });
    try {
      showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [workspaceRoot] });
      await handlers.get(RUNTIME_V2_FIXED_RENDERER_CHANNELS.selectWorkspaceDirectory)!(
        { sender: { id: 7 } }, { registerWorkspace },
      );
      const registry = await readWorkspaceRegistry(registryOptions);
      expect(registry.items.some((item) => item.path === workspaceRoot)).toBe(registerWorkspace);
      const result = await review.getSnapshot({ workspaceRoot, selection: { kind: "uncommitted" } });
      if (registerWorkspace) {
        expect(result).toMatchObject({ ok: true, snapshot: { status: git ? "ready" : "notAvailable" } });
        if (git && result.ok) expect(result.snapshot.files).toHaveLength(1);
      } else {
        expect(result).toMatchObject({ ok: false, code: "invalid_workspace" });
      }
      // A plain folder remains empty: registration and Review never initialize Git.
      if (!git) expect(await readdir(workspaceRoot)).toEqual([]);
      expect(await resolveRegisteredWorkspaceSelection(registryOptions, { workspaceRoot: join(dataRoot, "unknown") }))
        .toEqual({ ok: false, error: "workspaceRoot is not registered" });
      showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [join(dataRoot, "canceled")] });
      await handlers.get(RUNTIME_V2_FIXED_RENDERER_CHANNELS.selectWorkspaceDirectory)!(
        { sender: { id: 7 } }, { registerWorkspace: true },
      );
      expect((await readWorkspaceRegistry(registryOptions)).items.map((item) => item.path))
        .toEqual(registry.items.map((item) => item.path));
    } finally {
      review.dispose();
      registration.dispose();
      await rm(dataRoot, { recursive: true, force: true });
    }
  });
});
