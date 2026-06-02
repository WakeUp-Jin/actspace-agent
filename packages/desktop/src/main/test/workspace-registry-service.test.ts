import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  readWorkspaceRegistry,
  resolveWorkspaceSelection,
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
});
