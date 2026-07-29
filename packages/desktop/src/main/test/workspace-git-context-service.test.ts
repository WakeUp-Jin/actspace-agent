import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { AppDataRoots } from "../agent-turn";
import {
  getWorkspaceGitContext,
  prepareExecutionContext,
  rollbackPreparedExecution,
} from "../workspace-git-context-service";

const execFileAsync = promisify(execFile);
const createdRoots: string[] = [];
let gitAvailable = true;

beforeAll(async () => {
  try {
    await execFileAsync("git", ["--version"]);
  } catch {
    gitAvailable = false;
  }
});

afterEach(async () => {
  await Promise.all(createdRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function createRoots(): Promise<AppDataRoots> {
  const dataRoot = await mkdtemp(join(tmpdir(), "actspace-worktree-"));
  createdRoots.push(dataRoot);
  const workspaceRoot = join(dataRoot, "source-repo");
  await mkdir(workspaceRoot, { recursive: true });
  return {
    dataRoot,
    sessionRoot: join(dataRoot, "sessions"),
    logRoot: join(dataRoot, "logs"),
    tmpRoot: join(dataRoot, "tmp"),
    defaultWorkspaceRoot: workspaceRoot,
    workspaceRoot,
  };
}

async function git(cwd: string, args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, { cwd });
  return result.stdout.trim();
}

async function initRepository(roots: AppDataRoots): Promise<string> {
  await git(roots.workspaceRoot, ["init", "-b", "main"]);
  await git(roots.workspaceRoot, ["config", "user.email", "test@example.com"]);
  await git(roots.workspaceRoot, ["config", "user.name", "Actspace Test"]);
  await writeFile(join(roots.workspaceRoot, "README.md"), "initial\n", "utf8");
  await git(roots.workspaceRoot, ["add", "README.md"]);
  await git(roots.workspaceRoot, ["commit", "-m", "initial"]);
  return git(roots.workspaceRoot, ["rev-parse", "HEAD"]);
}

describe("workspace Git context service", () => {
  it("hides Git controls for a non-repository workspace", async () => {
    const roots = await createRoots();
    const result = await getWorkspaceGitContext(roots.workspaceRoot);

    if (!gitAvailable) {
      expect(result.status).toBe("git_not_found");
      return;
    }
    expect(result).toMatchObject({ status: "not_repository", branches: [] });
  });

  it("lists local branches and marks the current checkout", async () => {
    if (!gitAvailable) return;
    const roots = await createRoots();
    await initRepository(roots);
    await git(roots.workspaceRoot, ["branch", "feature/ui"]);

    const result = await getWorkspaceGitContext(roots.workspaceRoot);

    expect(result.status).toBe("ready");
    expect(result.currentBranch).toBe("main");
    expect(result.branches.map(({ name, current }) => ({ name, current }))).toEqual([
      { name: "feature/ui", current: false },
      { name: "main", current: true },
    ]);
    expect(result.branches[1].checkedOutPath).toMatch(/source-repo$/);
  });

  it("switches an existing branch for This Mac", async () => {
    if (!gitAvailable) return;
    const roots = await createRoots();
    await initRepository(roots);
    await git(roots.workspaceRoot, ["branch", "feature/ui"]);

    const result = await prepareExecutionContext({
      runLocation: "this_mac",
      sourceWorkspaceRoot: roots.workspaceRoot,
      branch: "feature/ui",
    }, roots);

    expect(result).toMatchObject({ ok: true, workspaceRoot: roots.workspaceRoot, branch: "feature/ui" });
    expect(await git(roots.workspaceRoot, ["branch", "--show-current"])).toBe("feature/ui");
    if (result.ok) await rollbackPreparedExecution(result.rollback);
    expect(await git(roots.workspaceRoot, ["branch", "--show-current"])).toBe("main");
  });

  it("creates and verifies an isolated worktree without copying local files", async () => {
    if (!gitAvailable) return;
    const roots = await createRoots();
    const baseCommit = await initRepository(roots);
    await writeFile(join(roots.workspaceRoot, ".env.local"), "SECRET=not-copied\n", "utf8");

    const result = await prepareExecutionContext({
      runLocation: "worktree",
      sourceWorkspaceRoot: roots.workspaceRoot,
      branch: "main",
    }, roots, {
      createId: () => "12345678",
      now: () => new Date("2026-07-29T06:00:00.000Z"),
    });

    expect(result).toMatchObject({
      ok: true,
      branch: "actspace/12345678",
      workspaceRoot: join(roots.dataRoot, "worktrees", "12345678", "source-repo"),
      worktree: {
        baseBranch: "main",
        baseCommit,
        createdAt: "2026-07-29T06:00:00.000Z",
      },
      preparationEvent: {
        status: "completed",
        environmentSetup: "none",
      },
    });
    if (!result.ok) return;
    expect(await git(result.workspaceRoot, ["branch", "--show-current"])).toBe("actspace/12345678");
    expect(await git(result.workspaceRoot, ["rev-parse", "HEAD"])).toBe(baseCommit);
    await expect(readFile(join(result.workspaceRoot, ".env.local"), "utf8")).rejects.toThrow();
    expect((await stat(result.workspaceRoot)).isDirectory()).toBe(true);
    await rollbackPreparedExecution(result.rollback);
    await expect(stat(result.workspaceRoot)).rejects.toThrow();
    await expect(git(roots.workspaceRoot, ["show-ref", "--verify", "refs/heads/actspace/12345678"])).rejects.toThrow();
  });

  it("rejects an unborn repository before creating a worktree", async () => {
    if (!gitAvailable) return;
    const roots = await createRoots();
    await git(roots.workspaceRoot, ["init", "-b", "main"]);

    const result = await prepareExecutionContext({
      runLocation: "worktree",
      sourceWorkspaceRoot: roots.workspaceRoot,
      branch: "main",
    }, roots, { createId: () => "87654321" });

    expect(result).toEqual({ ok: false, code: "no_head", message: "Git repository has no commits yet." });
  });
});
