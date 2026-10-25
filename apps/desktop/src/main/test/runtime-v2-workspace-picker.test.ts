import { mkdtemp, mkdir, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readWorkspaceRegistry, resolveRegisteredWorkspaceSelection, resolveWorkspaceSelection } from "../workspace-registry-service";
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
import { trustedWindow } from "./ipc-sender-fixture";

const trusted = trustedWindow();

afterEach(() => { handlers.clear(); vi.clearAllMocks(); });

describe("workspace directory picker IPC contract", () => {
  it.each([
    [{ canceled: false, filePaths: ["/work/commerce-agent"] }, { canceled: false, workspaceRoot: "/work/commerce-agent" }],
    [{ canceled: true, filePaths: [] }, { canceled: true }],
    [{ canceled: false, filePaths: [] }, { canceled: true }],
  ])("returns the renderer contract for %j", async (dialogResult, expected) => {
    const mainWindow = trusted.window;
    const registration = registerFixedRendererIpc({
      roots: { dataRoot: "/tmp/picker-test", workspaceRoot: "/work", defaultWorkspaceRoot: "/work" },
      registry: { subscribe: () => () => undefined, subscribeRendererStream: () => () => undefined },
      settings: { subscribeV4Changes: () => () => undefined },
      getMainWindow: () => mainWindow,
    } as unknown as FixedRendererIpcOptions);
    try {
      showOpenDialog.mockResolvedValueOnce(dialogResult);
      const result = await handlers.get(RUNTIME_V2_FIXED_RENDERER_CHANNELS.selectWorkspaceDirectory)!(
        trusted.event,
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
    const mainWindow = trusted.window;
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
        trusted.event, { registerWorkspace },
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
        trusted.event, { registerWorkspace: true },
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

describe("renderer-supplied workspace roots", () => {
  it("reads a local session worktree environment without admitting it to Recents and rejects unrelated roots", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "workspace-environment-ipc-"));
    const source = join(dataRoot, "source");
    const worktree = join(dataRoot, "worktree");
    const outside = join(dataRoot, "outside");
    for (const path of [source, worktree, outside]) await mkdir(path);
    await promisify(execFile)("git", ["init", "-b", "actspace/test", worktree]);
    const roots = { dataRoot, workspaceRoot: source, defaultWorkspaceRoot: source };
    const registration = registerFixedRendererIpc({ roots, registry: {
      subscribe: () => () => {}, subscribeRendererStream: () => () => {},
      listSessions: async () => [{ sessionId: "tree", workspaceRoot: worktree }],
    }, settings: { subscribeV4Changes: () => () => {} }, getMainWindow: () => trusted.window } as unknown as FixedRendererIpcOptions);
    const call = (workspaceRoot?: string) => handlers.get(RUNTIME_V2_FIXED_RENDERER_CHANNELS.getWorkspaceEnvironment)!(trusted.event, { workspaceRoot });
    try {
      await expect(call(worktree)).resolves.toMatchObject({ workspaceRoot: await realpath(worktree), git: { branch: "actspace/test" } });
      await expect(call()).resolves.toMatchObject({ workspaceRoot: await realpath(source) });
      await expect(call(outside)).rejects.toThrow("workspace_not_registered");
      const registry = await readWorkspaceRegistry({ ...roots, fallbackWorkspaceRoot: source });
      expect(registry.items.map(item => item.path)).toEqual([source]);
    } finally { registration.dispose(); await rm(dataRoot, { recursive: true, force: true }); }
  });
  it('resolves setWorkspace IDs and rejects conflicting, unknown or empty selections without updating', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'workspace-id-ipc-'));
    const roots = { dataRoot, workspaceRoot: join(dataRoot, 'default'), defaultWorkspaceRoot: join(dataRoot, 'default') };
    const options = { ...roots, fallbackWorkspaceRoot: roots.workspaceRoot };
    const target = await resolveWorkspaceSelection(options, { workspaceRoot: join(dataRoot, 'target') });
    if (!target.ok) throw new Error(target.error);
    const updateSessionWorkspace = vi.fn(async () => undefined);
    const registration = registerFixedRendererIpc({ roots, registry: {
      subscribe: () => () => {}, subscribeRendererStream: () => () => {},
      inspectSession: async () => ({ workspaceRoot: roots.workspaceRoot }), updateSessionWorkspace,
    }, settings: { subscribeV4Changes: () => () => {} }, getMainWindow: () => trusted.window } as unknown as FixedRendererIpcOptions);
    const call = (input: object) => handlers.get(RUNTIME_V2_FIXED_RENDERER_CHANNELS.setSessionWorkspace)!(trusted.event, { sessionId: 's1', ...input });
    try {
      for (const selection of [{ workspaceId: target.workspaceId }, { workspaceRoot: target.workspaceRoot }, { workspaceId: target.workspaceId, workspaceRoot: target.workspaceRoot }]) {
        await expect(call(selection)).resolves.toEqual({ ok: true });
        expect(updateSessionWorkspace).toHaveBeenLastCalledWith('s1', target.workspaceRoot);
      }
      updateSessionWorkspace.mockClear();
      for (const selection of [{ workspaceId: 'missing' }, { workspaceId: target.workspaceId, workspaceRoot: roots.workspaceRoot }, {}]) {
        await expect(call(selection)).rejects.toThrow();
      }
      expect(updateSessionWorkspace).not.toHaveBeenCalled();
      updateSessionWorkspace.mockRejectedValueOnce(new Error('session is busy'));
      await expect(call({ workspaceId: target.workspaceId })).rejects.toThrow('session is busy');
    } finally { registration.dispose(); await rm(dataRoot, { recursive: true, force: true }); }
  });
  async function setup() {
    const dataRoot = await mkdtemp(join(tmpdir(), "workspace-access-ipc-"));
    const defaultRoot = join(dataRoot, "default");
    const outside = join(dataRoot, "outside");
    await mkdir(defaultRoot);
    await mkdir(outside);
    const roots = { dataRoot, workspaceRoot: defaultRoot, defaultWorkspaceRoot: defaultRoot };
    const createSession = vi.fn(async (_id: unknown, workspaceRoot: string) => ({ sessionId: "s1", workspaceRoot }));
    const registration = registerFixedRendererIpc({
      roots,
      registry: {
        subscribe: () => () => undefined,
        subscribeRendererStream: () => () => undefined,
        listSessions: async () => [],
        createSession,
        readSessionProjection: async () => ({ meta: { id: "s1" } }),
      },
      settings: { subscribeV4Changes: () => () => undefined },
      getMainWindow: () => trusted.window,
    } as unknown as FixedRendererIpcOptions);
    const call = (channel: string, input: unknown) => handlers.get(channel)!(trusted.event, input);
    return { dataRoot, defaultRoot, outside, createSession, registration, call };
  }

  it("createSession only accepts registered workspace roots", async () => {
    const { dataRoot, defaultRoot, outside, createSession, registration, call } = await setup();
    try {
      await expect(call(RUNTIME_V2_FIXED_RENDERER_CHANNELS.createSession, { workspaceRoot: outside })).rejects.toThrow("not registered");
      expect(createSession).not.toHaveBeenCalled();
      await call(RUNTIME_V2_FIXED_RENDERER_CHANNELS.createSession, { workspaceRoot: defaultRoot });
      expect(createSession).toHaveBeenCalledWith(undefined, defaultRoot, undefined, undefined);
    } finally {
      registration.dispose();
      await rm(dataRoot, { recursive: true, force: true });
    }
  });

  it("createWorkspaceFolder needs a registered parent or one the user just picked", async () => {
    const { dataRoot, outside, registration, call } = await setup();
    try {
      const rejected = await call(RUNTIME_V2_FIXED_RENDERER_CHANNELS.createWorkspaceFolder, { parentRoot: outside, name: "made" });
      expect(rejected).toEqual({ ok: false, error: "workspace_not_registered" });
      expect(await readdir(outside)).toEqual([]);

      showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [outside] });
      await call(RUNTIME_V2_FIXED_RENDERER_CHANNELS.selectWorkspaceDirectory, {});
      const created = await call(RUNTIME_V2_FIXED_RENDERER_CHANNELS.createWorkspaceFolder, { parentRoot: outside, name: "made" });
      expect(created).toMatchObject({ ok: true, workspaceRoot: join(outside, "made") });

      // 选过的目录建成功后作废。
      const again = await call(RUNTIME_V2_FIXED_RENDERER_CHANNELS.createWorkspaceFolder, { parentRoot: outside, name: "second" });
      expect(again).toEqual({ ok: false, error: "workspace_not_registered" });
      expect(await readdir(outside)).toEqual(["made"]);
    } finally {
      registration.dispose();
      await rm(dataRoot, { recursive: true, force: true });
    }
  });

  it("keeps the picked parent after a failed create and only honours the latest pick", async () => {
    const { dataRoot, outside, registration, call } = await setup();
    const other = join(dataRoot, "other");
    await mkdir(other);
    try {
      showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [outside] });
      await call(RUNTIME_V2_FIXED_RENDERER_CHANNELS.selectWorkspaceDirectory, {});
      const badName = await call(RUNTIME_V2_FIXED_RENDERER_CHANNELS.createWorkspaceFolder, { parentRoot: outside, name: "a/b" });
      expect(badName).toMatchObject({ ok: false });
      expect(badName).not.toEqual({ ok: false, error: "workspace_not_registered" });
      // 名字不合法不会作废这次选择，换个名字可以重试。
      expect(await call(RUNTIME_V2_FIXED_RENDERER_CHANNELS.createWorkspaceFolder, { parentRoot: outside, name: "made" }))
        .toMatchObject({ ok: true, workspaceRoot: join(outside, "made") });

      // 后一次选择覆盖前一次。
      showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [outside] });
      await call(RUNTIME_V2_FIXED_RENDERER_CHANNELS.selectWorkspaceDirectory, {});
      showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [other] });
      await call(RUNTIME_V2_FIXED_RENDERER_CHANNELS.selectWorkspaceDirectory, {});
      expect(await call(RUNTIME_V2_FIXED_RENDERER_CHANNELS.createWorkspaceFolder, { parentRoot: outside, name: "second" }))
        .toEqual({ ok: false, error: "workspace_not_registered" });
      expect(await call(RUNTIME_V2_FIXED_RENDERER_CHANNELS.createWorkspaceFolder, { parentRoot: other, name: "made" }))
        .toMatchObject({ ok: true, workspaceRoot: join(other, "made") });
      expect(await readdir(outside)).toEqual(["made"]);
    } finally {
      registration.dispose();
      await rm(dataRoot, { recursive: true, force: true });
    }
  });

  it("rejects git context, skills and context menus for unregistered roots", async () => {
    const { dataRoot, outside, registration, call } = await setup();
    try {
      await expect(call(RUNTIME_V2_FIXED_RENDERER_CHANNELS.getWorkspaceGitContext, { workspaceRoot: "/" })).rejects.toThrow("workspace_not_registered");
      await expect(call(RUNTIME_V2_FIXED_RENDERER_CHANNELS.listSkills, { workspaceRoot: outside })).rejects.toThrow("workspace_not_registered");
      await writeFile(join(outside, "a.txt"), "a");
      expect(await call(RUNTIME_V2_FIXED_RENDERER_CHANNELS.showArtifactContextMenu, {
        kind: "workspace_file", workspaceRoot: outside, relativePath: "a.txt",
      })).toEqual({ shown: false, error: "invalid_target" });
    } finally {
      registration.dispose();
      await rm(dataRoot, { recursive: true, force: true });
    }
  });
});
