import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { AppDataRoots } from "../agent-turn";
import {
  commitAndPushWorkspaceChanges,
  commitWorkspaceChanges,
  createWorkspaceBranch,
  getWorkspaceEnvironment,
  pushWorkspaceBranch,
} from "../workspace-environment-service";

const execFileAsync = promisify(execFile);
const created: string[] = [];
let gitAvailable = true;

beforeAll(async () => {
  try {
    await execFileAsync("git", ["--version"]);
  } catch {
    gitAvailable = false;
  }
});

afterEach(async () => {
  await Promise.all(created.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function makeRoots(prefix = "actspace-environment-"): Promise<AppDataRoots> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), prefix));
  created.push(workspaceRoot);
  return {
    dataRoot: workspaceRoot,
    sessionRoot: join(workspaceRoot, "sessions"),
    logRoot: join(workspaceRoot, "logs"),
    tmpRoot: join(workspaceRoot, "tmp"),
    defaultWorkspaceRoot: workspaceRoot,
    workspaceRoot,
  };
}

async function git(cwd: string, args: string[]) {
  if (!gitAvailable) return { stdout: "" };
  return execFileAsync("git", args, { cwd });
}

async function initRepo(roots: AppDataRoots) {
  await git(roots.workspaceRoot, ["init", "-b", "main"]);
  await git(roots.workspaceRoot, ["config", "user.email", "test@example.com"]);
  await git(roots.workspaceRoot, ["config", "user.name", "Actspace Test"]);
}

async function commitAll(roots: AppDataRoots, message = "initial") {
  await git(roots.workspaceRoot, ["add", "-A"]);
  await git(roots.workspaceRoot, ["commit", "-m", message]);
}

describe("workspace environment service", () => {
  it("reports This Mac for a regular repository", async () => {
    const roots = await makeRoots();
    await initRepo(roots);

    const snapshot = await getWorkspaceEnvironment({}, roots);

    if (!gitAvailable) {
      expect(snapshot.git.available).toBe(false);
      return;
    }
    expect(snapshot.locationKind).toBe("this_mac");
    expect(snapshot.git).toMatchObject({ repository: true, branch: "main", detached: false, hasHead: false });
  });

  it("reports linked Git worktrees", async () => {
    const roots = await makeRoots();
    await initRepo(roots);
    await writeFile(join(roots.workspaceRoot, "README.md"), "main\n", "utf8");
    await commitAll(roots);
    const linkedRoot = await mkdtemp(join(tmpdir(), "actspace-linked-parent-"));
    created.push(linkedRoot);
    const linkedWorkspace = join(linkedRoot, "feature");
    await git(roots.workspaceRoot, ["worktree", "add", "-b", "feature/test", linkedWorkspace]);

    const snapshot = await getWorkspaceEnvironment({ workspaceRoot: linkedWorkspace }, roots);

    if (!gitAvailable) return;
    expect(snapshot.locationKind).toBe("worktree");
    expect(snapshot.git.branch).toBe("feature/test");
  });

  it("creates a valid branch and rejects an invalid branch", async () => {
    const roots = await makeRoots();
    await initRepo(roots);

    const invalid = await createWorkspaceBranch({ branchName: "bad name" }, roots);
    const createdBranch = await createWorkspaceBranch({ branchName: "actspace/environment" }, roots);

    if (!gitAvailable) return;
    expect(invalid).toMatchObject({ ok: false, error: "invalid_branch" });
    expect(createdBranch).toMatchObject({ ok: true, branch: "actspace/environment" });
    expect((await git(roots.workspaceRoot, ["branch", "--show-current"])).stdout.trim()).toBe("actspace/environment");
  });

  it("commits tracked, untracked, and deleted workspace changes", async () => {
    const roots = await makeRoots();
    await initRepo(roots);
    await writeFile(join(roots.workspaceRoot, "tracked.txt"), "before\n", "utf8");
    await writeFile(join(roots.workspaceRoot, "deleted.txt"), "remove\n", "utf8");
    await commitAll(roots);
    await writeFile(join(roots.workspaceRoot, "tracked.txt"), "after\n", "utf8");
    await writeFile(join(roots.workspaceRoot, "new.txt"), "new\n", "utf8");
    await rm(join(roots.workspaceRoot, "deleted.txt"));

    const result = await commitWorkspaceChanges({ message: "commit everything" }, roots);

    if (!gitAvailable) return;
    expect(result).toMatchObject({ ok: true, commitCreated: true, branch: "main" });
    expect((await git(roots.workspaceRoot, ["status", "--porcelain"])).stdout).toBe("");
    expect((await git(roots.workspaceRoot, ["show", "--pretty=", "--name-status", "HEAD"])).stdout).toContain("A\tnew.txt");
    expect(await readFile(join(roots.workspaceRoot, "tracked.txt"), "utf8")).toBe("after\n");
  });

  it("uses a deterministic local message when the commit message is blank", async () => {
    const roots = await makeRoots();
    await initRepo(roots);
    await writeFile(join(roots.workspaceRoot, "draft.txt"), "draft\n", "utf8");

    const result = await commitWorkspaceChanges({}, roots);

    if (!gitAvailable) return;
    expect(result).toMatchObject({ ok: true, commitCreated: true });
    expect((await git(roots.workspaceRoot, ["log", "-1", "--pretty=%s"])).stdout.trim()).toBe("Update workspace changes");
  });

  it("commits only staged files when unstaged changes are excluded", async () => {
    const roots = await makeRoots();
    await initRepo(roots);
    await writeFile(join(roots.workspaceRoot, "staged.txt"), "before\n", "utf8");
    await writeFile(join(roots.workspaceRoot, "unstaged.txt"), "before\n", "utf8");
    await commitAll(roots);
    await writeFile(join(roots.workspaceRoot, "staged.txt"), "after\n", "utf8");
    await writeFile(join(roots.workspaceRoot, "unstaged.txt"), "after\n", "utf8");
    await git(roots.workspaceRoot, ["add", "staged.txt"]);

    const result = await commitWorkspaceChanges({ message: "staged only", includeUnstagedChanges: false }, roots);

    if (!gitAvailable) return;
    expect(result).toMatchObject({ ok: true, commitCreated: true });
    expect((await git(roots.workspaceRoot, ["show", "--pretty=", "--name-only", "HEAD"])).stdout.trim()).toBe("staged.txt");
    expect((await git(roots.workspaceRoot, ["status", "--porcelain"])).stdout).toContain(" M unstaged.txt");
  });

  it("creates a branch inline before committing from detached HEAD", async () => {
    const roots = await makeRoots();
    await initRepo(roots);
    await writeFile(join(roots.workspaceRoot, "README.md"), "initial\n", "utf8");
    await commitAll(roots);
    await git(roots.workspaceRoot, ["checkout", "--detach", "HEAD"]);
    await writeFile(join(roots.workspaceRoot, "README.md"), "updated\n", "utf8");

    const result = await commitWorkspaceChanges({ branchName: "actspace/detached-work" }, roots);

    if (!gitAvailable) return;
    expect(result).toMatchObject({ ok: true, branch: "actspace/detached-work", branchCreated: true, commitCreated: true });
    expect((await git(roots.workspaceRoot, ["branch", "--show-current"])).stdout.trim()).toBe("actspace/detached-work");
  });

  it("returns nothing_to_commit for a clean workspace", async () => {
    const roots = await makeRoots();
    await initRepo(roots);

    const result = await commitWorkspaceChanges({ message: "empty" }, roots);

    if (!gitAvailable) return;
    expect(result).toMatchObject({ ok: false, error: "nothing_to_commit" });
  });

  it("pushes to the only remote and sets upstream", async () => {
    const roots = await makeRoots();
    const remoteRoot = await mkdtemp(join(tmpdir(), "actspace-bare-"));
    created.push(remoteRoot);
    await initRepo(roots);
    await git(remoteRoot, ["init", "--bare"]);
    await git(roots.workspaceRoot, ["remote", "add", "origin", remoteRoot]);
    await writeFile(join(roots.workspaceRoot, "README.md"), "push\n", "utf8");
    await commitAll(roots);

    const result = await pushWorkspaceBranch({}, roots);

    if (!gitAvailable) return;
    expect(result).toMatchObject({ ok: true, pushed: true, remote: "origin", upstreamSet: true });
    expect((await git(roots.workspaceRoot, ["rev-parse", "--abbrev-ref", "@{upstream}"])).stdout.trim()).toBe("origin/main");
  });

  it("creates, commits, and pushes a new branch as one requested action", async () => {
    const roots = await makeRoots();
    const remoteRoot = await mkdtemp(join(tmpdir(), "actspace-new-branch-bare-"));
    created.push(remoteRoot);
    await initRepo(roots);
    await git(remoteRoot, ["init", "--bare"]);
    await git(roots.workspaceRoot, ["remote", "add", "origin", remoteRoot]);
    await writeFile(join(roots.workspaceRoot, "README.md"), "initial\n", "utf8");
    await commitAll(roots);
    await git(roots.workspaceRoot, ["checkout", "--detach", "HEAD"]);
    await writeFile(join(roots.workspaceRoot, "README.md"), "new branch\n", "utf8");

    const result = await commitAndPushWorkspaceChanges({ branchName: "actspace/pushed-work" }, roots);

    if (!gitAvailable) return;
    expect(result).toMatchObject({
      ok: true,
      branch: "actspace/pushed-work",
      branchCreated: true,
      commitCreated: true,
      pushed: true,
      remote: "origin",
    });
    expect((await git(remoteRoot, ["show-ref", "--verify", "refs/heads/actspace/pushed-work"])).stdout).toContain("refs/heads/actspace/pushed-work");
  });

  it("requires an explicit remote when more than one is configured", async () => {
    const roots = await makeRoots();
    const remoteOne = await mkdtemp(join(tmpdir(), "actspace-bare-one-"));
    const remoteTwo = await mkdtemp(join(tmpdir(), "actspace-bare-two-"));
    created.push(remoteOne, remoteTwo);
    await initRepo(roots);
    await git(remoteOne, ["init", "--bare"]);
    await git(remoteTwo, ["init", "--bare"]);
    await git(roots.workspaceRoot, ["remote", "add", "origin", remoteOne]);
    await git(roots.workspaceRoot, ["remote", "add", "backup", remoteTwo]);
    await writeFile(join(roots.workspaceRoot, "README.md"), "push\n", "utf8");
    await commitAll(roots);

    const required = await pushWorkspaceBranch({}, roots);
    const pushed = await pushWorkspaceBranch({ remote: "backup" }, roots);

    if (!gitAvailable) return;
    expect(required).toMatchObject({ ok: false, error: "remote_required", remotes: ["backup", "origin"] });
    expect(pushed).toMatchObject({ ok: true, remote: "backup" });
  });

  it("does not create a commit before a multi-remote choice is supplied", async () => {
    const roots = await makeRoots();
    await initRepo(roots);
    await git(roots.workspaceRoot, ["remote", "add", "origin", "/tmp/origin.git"]);
    await git(roots.workspaceRoot, ["remote", "add", "backup", "/tmp/backup.git"]);
    await writeFile(join(roots.workspaceRoot, "draft.txt"), "draft\n", "utf8");

    const result = await commitAndPushWorkspaceChanges({ message: "should wait" }, roots);

    if (!gitAvailable) return;
    expect(result).toMatchObject({ ok: false, error: "remote_required" });
    expect(result.commitCreated).toBeUndefined();
    expect((await git(roots.workspaceRoot, ["rev-parse", "--verify", "HEAD"]).then(() => true).catch(() => false))).toBe(false);
  });

  it("reports a created commit when the following push fails", async () => {
    const roots = await makeRoots();
    await initRepo(roots);
    await git(roots.workspaceRoot, ["remote", "add", "origin", join(roots.workspaceRoot, "missing-remote.git")]);
    await writeFile(join(roots.workspaceRoot, "draft.txt"), "draft\n", "utf8");

    const result = await commitAndPushWorkspaceChanges({ message: "commit before push" }, roots);

    if (!gitAvailable) return;
    expect(result).toMatchObject({ ok: false, phase: "push", commitCreated: true, branch: "main" });
    expect(result.commitHash).toMatch(/^[0-9a-f]+$/);
    expect((await git(roots.workspaceRoot, ["log", "-1", "--pretty=%s"])).stdout.trim()).toBe("commit before push");
  });

  it("fails push explicitly when no remote is configured", async () => {
    const roots = await makeRoots();
    await initRepo(roots);

    const result = await pushWorkspaceBranch({}, roots);

    if (!gitAvailable) return;
    expect(result).toMatchObject({ ok: false, error: "no_remote", branch: "main" });
  });
});
