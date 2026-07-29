import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  it("creates a default Downloads workspace and preserves the repo fallback as a folder workspace", async () => {
    const dataRoot = await makeDataRoot();
    const defaultWorkspaceRoot = join(dataRoot, "Downloads");
    const fallbackWorkspaceRoot = join(dataRoot, "actspace-agent");

    const registry = await readWorkspaceRegistry({
      dataRoot,
      defaultWorkspaceRoot,
      fallbackWorkspaceRoot,
      sessions: [],
    });

    expect(registry.defaultWorkspaceId).toBe("default");
    expect(registry.items).toEqual([
      expect.objectContaining({
        id: "default",
        kind: "default",
        label: "Default workspace",
        path: resolve(defaultWorkspaceRoot),
      }),
      expect.objectContaining({
        kind: "folder",
        label: "actspace-agent",
        path: resolve(fallbackWorkspaceRoot),
      }),
    ]);
    await expect(readFile(workspaceRegistryPath(dataRoot), "utf8")).resolves.toContain("Default workspace");
  });

  it("serializes concurrent startup reads without sharing a temporary file", async () => {
    const dataRoot = await makeDataRoot();
    const defaultWorkspaceRoot = join(dataRoot, "Downloads");
    const fallbackWorkspaceRoot = join(dataRoot, "actspace-agent");
    const options = {
      dataRoot,
      defaultWorkspaceRoot,
      fallbackWorkspaceRoot,
      sessions: [],
    };

    const registries = await Promise.all(Array.from({ length: 8 }, () => readWorkspaceRegistry(options)));

    expect(registries).toHaveLength(8);
    expect(registries.every((registry) => registry.defaultWorkspaceId === "default")).toBe(true);
    const persisted = JSON.parse(await readFile(workspaceRegistryPath(dataRoot), "utf8")) as {
      defaultWorkspaceId?: string;
      items?: unknown[];
    };
    expect(persisted.defaultWorkspaceId).toBe("default");
    expect(persisted.items).toHaveLength(2);
  });

  it("repairs an old default workspace path to the current default root", async () => {
    const dataRoot = await makeDataRoot();
    const oldDefaultRoot = join(dataRoot, "old-repo-root");
    const defaultWorkspaceRoot = join(dataRoot, "Downloads");

    await writeFile(
      workspaceRegistryPath(dataRoot),
      JSON.stringify({
        version: 1,
        defaultWorkspaceId: "default",
        items: [
          {
            id: "default",
            kind: "default",
            label: "actspace-agent",
            path: oldDefaultRoot,
            order: 0,
            createdAt: "2026-06-01T00:00:00.000Z",
            updatedAt: "2026-06-01T00:00:00.000Z",
          },
        ],
      }),
      "utf8",
    );

    const registry = await readWorkspaceRegistry({
      dataRoot,
      defaultWorkspaceRoot,
      fallbackWorkspaceRoot: oldDefaultRoot,
      sessions: [],
    });

    expect(registry.items[0]).toEqual(expect.objectContaining({
      id: "default",
      label: "Default workspace",
      path: resolve(defaultWorkspaceRoot),
    }));
    expect(registry.items.some((item) => item.kind === "folder" && item.path === resolve(oldDefaultRoot))).toBe(true);
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

  it("resolves empty selection to default and registers path-only workspace selections", async () => {
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
      ok: true,
      workspaceId: "default",
      workspaceRoot: resolve(defaultWorkspaceRoot),
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
        turnCount: 1,
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

  it("does not allow the default workspace to be hidden", async () => {
    const dataRoot = await makeDataRoot();
    const defaultWorkspaceRoot = join(dataRoot, "Downloads");
    const options = {
      dataRoot,
      defaultWorkspaceRoot,
      fallbackWorkspaceRoot: defaultWorkspaceRoot,
      sessions: [],
    };

    await expect(setWorkspaceHidden(options, "default", true)).resolves.toEqual({
      ok: false,
      error: "default_workspace_required",
    });
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
});
