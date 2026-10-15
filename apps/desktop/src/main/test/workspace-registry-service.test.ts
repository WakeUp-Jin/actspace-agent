import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  readWorkspaceRegistry,
  resolveRegisteredWorkspaceSelection,
  resolveWorkspaceSelection,
  setWorkspaceHidden,
  workspaceRegistryPath,
} from "../workspace-registry-service";

const created: string[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeDataRoot(): Promise<string> {
  const dataRoot = await mkdtemp(join(tmpdir(), "actspace-workspaces-"));
  created.push(dataRoot);
  return dataRoot;
}

describe("workspace registry service", () => {
  it("creates the default workspace folder on first run and registers it as a normal workspace", async () => {
    const dataRoot = await makeDataRoot();
    const defaultWorkspaceRoot = join(dataRoot, "Documents", "ActSpace", "default-workspace");

    const registry = await readWorkspaceRegistry({
      dataRoot,
      defaultWorkspaceRoot,
      fallbackWorkspaceRoot: defaultWorkspaceRoot,
      sessions: [],
    });

    expect(registry).not.toHaveProperty("defaultWorkspaceId");
    expect(registry.items).toEqual([
      expect.objectContaining({ kind: "folder", label: "默认工作区", path: resolve(defaultWorkspaceRoot) }),
    ]);
    expect((await stat(defaultWorkspaceRoot)).isDirectory()).toBe(true);
    await expect(readFile(workspaceRegistryPath(dataRoot), "utf8")).resolves.toContain("默认工作区");
  });

  it("does not create the default workspace when another workspace exists", async () => {
    const dataRoot = await makeDataRoot();
    const defaultWorkspaceRoot = join(dataRoot, "default-workspace");
    const fallbackWorkspaceRoot = join(dataRoot, "actspace-agent");

    const registry = await readWorkspaceRegistry({ dataRoot, defaultWorkspaceRoot, fallbackWorkspaceRoot, sessions: [] });

    expect(registry.items).toEqual([
      expect.objectContaining({ kind: "folder", label: "actspace-agent", path: resolve(fallbackWorkspaceRoot) }),
    ]);
    await expect(stat(defaultWorkspaceRoot)).rejects.toThrow();
  });

  it("keeps the default workspace removed instead of recreating it", async () => {
    const dataRoot = await makeDataRoot();
    const defaultWorkspaceRoot = join(dataRoot, "default-workspace");
    const options = { dataRoot, defaultWorkspaceRoot, fallbackWorkspaceRoot: defaultWorkspaceRoot, sessions: [] };
    const [entry] = (await readWorkspaceRegistry(options)).items;

    await expect(setWorkspaceHidden(options, entry!.id, true)).resolves.toEqual({ ok: true });
    const after = await readWorkspaceRegistry(options);

    expect(after.items).toEqual([expect.objectContaining({ id: entry!.id, hidden: true })]);
  });

  it("leaves the registry empty when the default workspace folder cannot be created", async () => {
    const dataRoot = await makeDataRoot();
    const blocker = join(dataRoot, "not-a-folder");
    await writeFile(blocker, "", "utf8");
    const defaultWorkspaceRoot = join(blocker, "default-workspace");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const registry = await readWorkspaceRegistry({ dataRoot, defaultWorkspaceRoot, fallbackWorkspaceRoot: defaultWorkspaceRoot, sessions: [] });

    expect(registry.items).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("serializes concurrent startup reads without sharing a temporary file", async () => {
    const dataRoot = await makeDataRoot();
    const defaultWorkspaceRoot = join(dataRoot, "default-workspace");
    const options = { dataRoot, defaultWorkspaceRoot, fallbackWorkspaceRoot: defaultWorkspaceRoot, sessions: [] };

    const registries = await Promise.all(Array.from({ length: 8 }, () => readWorkspaceRegistry(options)));

    expect(registries).toHaveLength(8);
    const persisted = JSON.parse(await readFile(workspaceRegistryPath(dataRoot), "utf8")) as { items?: unknown[] };
    expect(persisted.items).toHaveLength(1);
  });

  it("drops the legacy Downloads default entry and keeps other workspaces", async () => {
    const dataRoot = await makeDataRoot();
    const legacyDownloads = join(dataRoot, "Downloads");
    const projectRoot = join(dataRoot, "project");
    const defaultWorkspaceRoot = join(dataRoot, "default-workspace");
    const timestamps = { createdAt: "2026-06-01T00:00:00.000Z", updatedAt: "2026-06-01T00:00:00.000Z" };

    await writeFile(
      workspaceRegistryPath(dataRoot),
      JSON.stringify({
        version: 1,
        defaultWorkspaceId: "default",
        items: [
          { id: "default", kind: "default", label: "Default workspace", path: legacyDownloads, order: 0, ...timestamps },
          { id: "ws_project", kind: "folder", label: "project", path: projectRoot, order: 1, ...timestamps },
        ],
      }),
      "utf8",
    );

    const registry = await readWorkspaceRegistry({ dataRoot, defaultWorkspaceRoot, fallbackWorkspaceRoot: defaultWorkspaceRoot, sessions: [] });

    expect(registry.items).toEqual([expect.objectContaining({ id: "ws_project", kind: "folder", path: resolve(projectRoot) })]);
    const persisted = await readFile(workspaceRegistryPath(dataRoot), "utf8");
    expect(persisted).not.toContain("defaultWorkspaceId");
    expect(persisted).not.toContain(legacyDownloads);
    await expect(stat(defaultWorkspaceRoot)).rejects.toThrow();
  });

  it("resolves workspace selections by id and rejects unknown ids", async () => {
    const dataRoot = await makeDataRoot();
    const defaultWorkspaceRoot = join(dataRoot, "Downloads");
    const fallbackWorkspaceRoot = join(dataRoot, "actspace-agent");
    const registry = await readWorkspaceRegistry({
      dataRoot,
      defaultWorkspaceRoot,
      fallbackWorkspaceRoot,
      sessions: [],
    });
    const folder = registry.items.find((item) => item.kind === "folder");
    expect(folder).toBeDefined();

    await expect(
      resolveWorkspaceSelection({
        dataRoot,
        defaultWorkspaceRoot,
        fallbackWorkspaceRoot,
        sessions: [],
      }, { workspaceId: folder?.id }),
    ).resolves.toEqual({
      ok: true,
      workspaceId: folder?.id,
      workspaceRoot: resolve(fallbackWorkspaceRoot),
    });

    await expect(
      resolveWorkspaceSelection({
        dataRoot,
        defaultWorkspaceRoot,
        fallbackWorkspaceRoot,
        sessions: [],
      }, { workspaceId: "missing-workspace" }),
    ).resolves.toEqual({
      ok: false,
      error: "workspaceId not found: missing-workspace",
    });
  });

  it("rejects an empty selection and registers path-only workspace selections", async () => {
    const dataRoot = await makeDataRoot();
    const defaultWorkspaceRoot = join(dataRoot, "Downloads");
    const fallbackWorkspaceRoot = join(dataRoot, "actspace-agent");
    const newWorkspaceRoot = join(dataRoot, "new-project");

    await expect(
      resolveWorkspaceSelection({
        dataRoot,
        defaultWorkspaceRoot,
        fallbackWorkspaceRoot,
        sessions: [],
      }),
    ).resolves.toEqual({
      ok: false,
      error: "workspace is required",
    });

    const created = await resolveWorkspaceSelection({
      dataRoot,
      defaultWorkspaceRoot,
      fallbackWorkspaceRoot,
      sessions: [],
    }, { workspaceRoot: newWorkspaceRoot });

    expect(created).toEqual(expect.objectContaining({
      ok: true,
      workspaceRoot: resolve(newWorkspaceRoot),
    }));
    const registry = await readWorkspaceRegistry({
      dataRoot,
      defaultWorkspaceRoot,
      fallbackWorkspaceRoot,
      sessions: [],
    });
    expect(registry.items.some((item) => item.path === resolve(newWorkspaceRoot))).toBe(true);
  });

  it("persists hidden workspaces across session merging and restores them by selecting the same path", async () => {
    const dataRoot = await makeDataRoot();
    const defaultWorkspaceRoot = join(dataRoot, "Downloads");
    const workspaceRoot = join(dataRoot, "hidden-project");
    const options = {
      dataRoot,
      defaultWorkspaceRoot,
      fallbackWorkspaceRoot: defaultWorkspaceRoot,
      sessions: [{
        id: "session-1",
        title: "Hidden project session",
        createdAt: "2026-07-29T00:00:00.000Z",
        updatedAt: "2026-07-29T00:00:00.000Z",
        agentRunCount: 1,
        workspaceRoot,
      }],
    };
    const initial = await readWorkspaceRegistry(options);
    const workspace = initial.items.find((item) => item.path === resolve(workspaceRoot));
    expect(workspace).toBeDefined();

    await expect(setWorkspaceHidden(options, workspace!.id, true)).resolves.toEqual({ ok: true });
    const hidden = await readWorkspaceRegistry(options);
    expect(hidden.items.find((item) => item.id === workspace!.id)?.hidden).toBe(true);

    await expect(resolveWorkspaceSelection(options, { workspaceRoot })).resolves.toEqual({
      ok: true,
      workspaceId: workspace!.id,
      workspaceRoot: resolve(workspaceRoot),
    });
    const restored = await readWorkspaceRegistry(options);
    expect(restored.items.find((item) => item.id === workspace!.id)?.hidden).toBe(false);
  });

  it("rejects unregistered paths for privileged workspace actions", async () => {
    const dataRoot = await makeDataRoot();
    const defaultWorkspaceRoot = join(dataRoot, "Downloads");
    const fallbackWorkspaceRoot = join(dataRoot, "actspace-agent");

    await expect(resolveRegisteredWorkspaceSelection({
      dataRoot,
      defaultWorkspaceRoot,
      fallbackWorkspaceRoot,
      sessions: [],
    }, { workspaceRoot: join(dataRoot, "unregistered") })).resolves.toEqual({
      ok: false,
      error: "workspaceRoot is not registered",
    });

    await expect(resolveRegisteredWorkspaceSelection({
      dataRoot,
      defaultWorkspaceRoot,
      fallbackWorkspaceRoot,
      sessions: [],
    }, { workspaceRoot: fallbackWorkspaceRoot })).resolves.toEqual(expect.objectContaining({
      ok: true,
      workspaceRoot: resolve(fallbackWorkspaceRoot),
    }));
  });

  it("serializes concurrent registry repairs and preserves concurrent path registrations", async () => {
    const dataRoot = await makeDataRoot();
    const options = {
      dataRoot,
      defaultWorkspaceRoot: join(dataRoot, "Downloads"),
      fallbackWorkspaceRoot: join(dataRoot, "actspace-agent"),
      sessions: [],
    };

    await expect(Promise.all(Array.from({ length: 8 }, () => readWorkspaceRegistry(options)))).resolves.toHaveLength(8);

    const roots = Array.from({ length: 6 }, (_, index) => join(dataRoot, `project-${index}`));
    await expect(Promise.all(roots.map((workspaceRoot) => resolveWorkspaceSelection(options, { workspaceRoot })))).resolves.toHaveLength(6);

    const registry = await readWorkspaceRegistry(options);
    expect(roots.every((workspaceRoot) => registry.items.some((item) => item.path === resolve(workspaceRoot)))).toBe(true);
    await expect(readFile(workspaceRegistryPath(dataRoot), "utf8")).resolves.toContain("project-5");
    await expect(readdir(dataRoot)).resolves.not.toEqual(expect.arrayContaining([expect.stringMatching(/\.tmp$/)]));
  });
});
