import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { WorkspaceRegistry } from "@actspace/shared";
import { isPathInside, resolveWorkspaceAccess, WorkspaceAccessError, type WorkspaceAccessDeps } from "../workspace-access";

const created: string[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  created.push(dir);
  return dir;
}

function registryOf(...paths: string[]): WorkspaceRegistry {
  return {
    version: 1,
    defaultWorkspaceId: "default",
    items: paths.map((path, index) => ({
      id: index === 0 ? "default" : `ws-${index}`,
      kind: index === 0 ? "default" : "folder",
      label: path,
      path,
      order: index,
      createdAt: "2026-10-06T00:00:00.000Z",
      updatedAt: "2026-10-06T00:00:00.000Z",
    })),
  };
}

function deps(registry: WorkspaceRegistry, sessionRoots: (string | null)[] = []): WorkspaceAccessDeps {
  return {
    readRegistry: async () => registry,
    listSessionWorkspaceRoots: async () => sessionRoots,
  };
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(() => undefined, (error: unknown) => error);
}

describe("resolveWorkspaceAccess", () => {
  it("allows a registered root, returning the realpath, but not its subdirectories", async () => {
    const root = await tempDir("actspace-access-root-");
    await mkdir(join(root, "src"));
    const access = deps(registryOf(root));

    expect(await resolveWorkspaceAccess({ workspaceRoot: root }, access)).toBe(await realpath(root));
    expect(await rejection(resolveWorkspaceAccess({ workspaceRoot: join(root, "src") }, access))).toBeInstanceOf(WorkspaceAccessError);
  });

  it("falls back to the registry default workspace when no root is given", async () => {
    const root = await tempDir("actspace-access-default-");
    expect(await resolveWorkspaceAccess({}, deps(registryOf(root)))).toBe(await realpath(root));
  });

  it("rejects /, the home directory and unregistered directories", async () => {
    const root = await tempDir("actspace-access-root-");
    const other = await tempDir("actspace-access-other-");
    const access = deps(registryOf(root));

    for (const workspaceRoot of ["/", homedir(), other, join(root, "..")]) {
      const error = await rejection(resolveWorkspaceAccess({ workspaceRoot }, access));
      expect(error).toBeInstanceOf(WorkspaceAccessError);
      expect((error as WorkspaceAccessError).code).toBe("workspace_not_registered");
    }
  });

  it("rejects a symlink inside a registered root that points outside it", async () => {
    const root = await tempDir("actspace-access-root-");
    const outside = await tempDir("actspace-access-outside-");
    await symlink(outside, join(root, "escape"));

    const error = await rejection(resolveWorkspaceAccess({ workspaceRoot: join(root, "escape") }, deps(registryOf(root))));

    expect(error).toBeInstanceOf(WorkspaceAccessError);
  });

  it("matches a registered root through a symlinked alias of the same directory", async () => {
    const root = await tempDir("actspace-access-root-");
    const aliasParent = await tempDir("actspace-access-alias-");
    const alias = join(aliasParent, "alias");
    await symlink(root, alias);

    expect(await resolveWorkspaceAccess({ workspaceRoot: alias }, deps(registryOf(root)))).toBe(await realpath(root));
  });

  it("allows a local session's worktree root that is not in the registry", async () => {
    const root = await tempDir("actspace-access-root-");
    const worktree = await tempDir("actspace-access-worktree-");

    const resolved = await resolveWorkspaceAccess({ workspaceRoot: worktree }, deps(registryOf(root), [null, worktree]));

    expect(resolved).toBe(await realpath(worktree));
  });

  it("only reads the session list when the registry does not match", async () => {
    const root = await tempDir("actspace-access-root-");
    let sessionReads = 0;
    const access: WorkspaceAccessDeps = {
      readRegistry: async () => registryOf(root),
      listSessionWorkspaceRoots: async () => {
        sessionReads += 1;
        return [];
      },
    };

    await resolveWorkspaceAccess({ workspaceRoot: root }, access);
    expect(sessionReads).toBe(0);
    await rejection(resolveWorkspaceAccess({ workspaceRoot: "/" }, access));
    expect(sessionReads).toBe(1);
  });

  it("rejects paths that do not exist", async () => {
    const root = await tempDir("actspace-access-root-");
    const error = await rejection(resolveWorkspaceAccess({ workspaceRoot: join(root, "missing") }, deps(registryOf(root))));
    expect(error).toBeInstanceOf(WorkspaceAccessError);
  });
});

describe("isPathInside", () => {
  it("treats ..foo as inside and .. as outside", () => {
    expect(isPathInside("/w", "/w")).toBe(true);
    expect(isPathInside("/w", "/w/..foo")).toBe(true);
    expect(isPathInside("/w", "/w/a/b")).toBe(true);
    expect(isPathInside("/w", "/w/..")).toBe(false);
    expect(isPathInside("/w", "/wx")).toBe(false);
    expect(isPathInside("/w", "/other")).toBe(false);
  });
});
