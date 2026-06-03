import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { resolveAppDataRoots, resolveRepoRoot } from "../app-paths";

function makePackageReader(packages: Record<string, unknown>) {
  return async (path: string) => {
    const value = packages[path];
    if (value === undefined) throw new Error(`missing ${path}`);
    return JSON.stringify(value);
  };
}

describe("resolveRepoRoot", () => {
  it("walks up to the actspace repo root in development", async () => {
    const repoRoot = "/Users/me/projects/actspace-agent";
    const result = await resolveRepoRoot({
      dataRoot: "/Users/me/Library/Application Support/actspace",
      defaultWorkspaceRoot: "/Users/me/Downloads",
      cwd: join(repoRoot, "packages", "desktop"),
      env: {},
      readText: makePackageReader({
        [join(repoRoot, "package.json")]: { name: "actspace" },
      }),
    });

    expect(result).toBe(repoRoot);
  });

  it("returns null when an installed app starts outside the repo", async () => {
    const result = await resolveRepoRoot({
      dataRoot: "/Users/me/Library/Application Support/actspace",
      defaultWorkspaceRoot: "/Users/me/Downloads",
      cwd: "/",
      env: {},
      readText: makePackageReader({}),
    });

    expect(result).toBeNull();
  });
});

describe("resolveAppDataRoots", () => {
  it("keeps development logs in the repo logs directory", async () => {
    const repoRoot = "/Users/me/projects/actspace-agent";
    const roots = await resolveAppDataRoots({
      dataRoot: "/Users/me/Library/Application Support/actspace",
      defaultWorkspaceRoot: "/Users/me/Downloads",
      cwd: join(repoRoot, "packages", "desktop"),
      env: {},
      readText: makePackageReader({
        [join(repoRoot, "package.json")]: { name: "actspace" },
      }),
    });

    expect(roots.logRoot).toBe(join(repoRoot, "logs"));
    expect(roots.workspaceRoot).toBe(repoRoot);
  });

  it("falls back to userData logs and Downloads workspace when no repo is found", async () => {
    const dataRoot = "/Users/me/Library/Application Support/actspace";
    const downloads = "/Users/me/Downloads";
    const roots = await resolveAppDataRoots({
      dataRoot,
      defaultWorkspaceRoot: downloads,
      cwd: "/",
      env: {},
      readText: makePackageReader({}),
    });

    expect(roots.logRoot).toBe(join(dataRoot, "logs"));
    expect(roots.workspaceRoot).toBe(downloads);
    expect(roots.logRoot).not.toBe("/logs");
    expect(roots.workspaceRoot).not.toBe("/");
  });

  it("uses an explicit workspace root while still keeping installed logs in userData", async () => {
    const dataRoot = "/Users/me/Library/Application Support/actspace";
    const workspaceRoot = "/Users/me/workspace";
    const roots = await resolveAppDataRoots({
      dataRoot,
      defaultWorkspaceRoot: "/Users/me/Downloads",
      cwd: "/",
      env: { ACTSPACE_WORKSPACE_ROOT: workspaceRoot },
      readText: makePackageReader({}),
    });

    expect(roots.logRoot).toBe(join(dataRoot, "logs"));
    expect(roots.workspaceRoot).toBe(workspaceRoot);
  });
});
