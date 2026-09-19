import { mkdtemp, mkdir, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { readWorkspaceRegistry, resolveRegisteredWorkspaceSelection, setWorkspaceHidden } from "../workspace-registry-service";

const { bootDesktopRuntimeV2 } = vi.hoisted(() => ({ bootDesktopRuntimeV2: vi.fn() }));
vi.mock("../runtime-v2/desktop-host-adapter", () => ({ bootDesktopRuntimeV2 }));
import { DesktopRuntimeV2Registry, type DesktopRuntimeV2RegistryOptions } from "../runtime-v2/runtime-registry";

describe("runtime workspace admission", () => {
  it.each([true, false])("restores existing roots and admits new roots without initializing Git (existing=%s)", async (existing) => {
    const dataRoot = await mkdtemp(join(tmpdir(), "runtime-workspaces-"));
    const oldRoot = join(dataRoot, "old");
    const newRoot = join(dataRoot, "new");
    await mkdir(oldRoot);
    await mkdir(newRoot);
    const roots = { dataRoot, workspaceRoot: join(dataRoot, "default"), defaultWorkspaceRoot: join(dataRoot, "default") };
    const registryOptions = { ...roots, fallbackWorkspaceRoot: roots.workspaceRoot };
    const app = {
      listSessions: vi.fn(async () => existing ? [{ sessionId: "old-session", workspaceRoot: oldRoot, metadata: {}, updatedAt: "2026-09-19" }] : []),
      createMainSession: vi.fn(async (_id, workspaceRoot) => {
        expect(await resolveRegisteredWorkspaceSelection(registryOptions, { workspaceRoot })).toMatchObject({ ok: true });
        return { sessionId: "new-session", workspaceRoot, throughJournalSeq: 0 };
      }),
    };
    bootDesktopRuntimeV2.mockResolvedValue({
      profile: { context: { get: (name: string) => name === "desktop.app" ? app : undefined }, getState: () => ({ runtimeInstanceId: "test" }), shutdown: vi.fn() },
    });
    const runtime = new DesktopRuntimeV2Registry({ roots, loadModule: async () => ({}) } as unknown as DesktopRuntimeV2RegistryOptions);
    try {
      await runtime.boot();
      const restored = await resolveRegisteredWorkspaceSelection(registryOptions, { workspaceRoot: oldRoot });
      if (existing) expect(restored).toMatchObject({ ok: true });
      await runtime.createSession(undefined, newRoot);
      expect(app.createMainSession).toHaveBeenCalledWith(undefined, newRoot);
      await runtime.createSession();
      expect(app.createMainSession).toHaveBeenLastCalledWith(undefined, roots.workspaceRoot);
      if (!existing) {
        expect(await readdir(newRoot)).toEqual([]);
        return;
      }
      if (!restored.ok) throw new Error(restored.error);
      await setWorkspaceHidden(registryOptions, restored.workspaceId, true);
      await runtime.dispose();
      const restarted = new DesktopRuntimeV2Registry({ roots, loadModule: async () => ({}) } as unknown as DesktopRuntimeV2RegistryOptions);
      await restarted.boot();
      await restarted.dispose();
      const registry = await readWorkspaceRegistry(registryOptions);
      expect(registry.items.filter((item) => item.path === oldRoot)).toMatchObject([{ id: restored.workspaceId, hidden: true }]);
      expect(await readdir(oldRoot)).toEqual([]);
      expect(await readdir(newRoot)).toEqual([]);
    } finally {
      await runtime.dispose();
      await rm(dataRoot, { recursive: true, force: true });
    }
  });
});
