import { expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ReviewWorkspaceWatcher } from "../review-workspace-watcher";

/**
 * A macOS recursive watch starts some time after `ensure` resolves and can then deliver the Git
 * setup that preceded it as forced refreshes. Rewrite a probe until its event lands: events arrive
 * in order, so the setup events are behind it.
 */
async function settleWatch(dir: string, changed: ReturnType<typeof vi.fn>) {
  let attempt = 0;
  await vi.waitFor(async () => {
    if (!changed.mock.calls.some(([path]) => path === "watch-probe.txt")) {
      await writeFile(join(dir, "watch-probe.txt"), `probe ${attempt++}\n`);
      throw new Error("probe not observed yet");
    }
  }, { timeout: 5000, interval: 100 });
  await new Promise(resolve => setTimeout(resolve, 150));
  changed.mockClear();
}

it("watches linked-worktree index and common refs, ignores lock noise, and closes pending opens", async () => {
  const root = await mkdtemp(join(tmpdir(), "review-linked-watch-"));
  const repo = join(root, "repo");
  const tree = join(root, "linked");
  const watcher = new ReviewWorkspaceWatcher();
  const changed = vi.fn();
  try {
    await mkdir(repo);
    const git = (args: string[], cwd = repo) => promisify(execFile)("git", args, { cwd });
    await git(["init", "-b", "main"]);
    await writeFile(join(repo, "file.txt"), "before\n");
    await git(["add", "."]);
    await git(["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "fixture"]);
    await git(["worktree", "add", "-b", "linked", tree]);
    await watcher.ensure("linked", tree, changed);
    await settleWatch(tree, changed);
    const gitDir = (await git(["rev-parse", "--absolute-git-dir"], tree)).stdout.trim();
    await writeFile(join(gitDir, "index.lock"), "lock");
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(changed).not.toHaveBeenCalled();
    await rm(join(gitDir, "index.lock"));
    await writeFile(join(tree, "file.txt"), "after\n");
    await vi.waitFor(() => expect(changed).toHaveBeenCalled());
    await new Promise(resolve => setTimeout(resolve, 150));
    changed.mockClear();
    await git(["add", "file.txt"], tree);
    await vi.waitFor(() => expect(changed).toHaveBeenCalled());
    await new Promise(resolve => setTimeout(resolve, 150));
    changed.mockClear();
    await git(["branch", "new-ref"]);
    await vi.waitFor(() => expect(changed).toHaveBeenCalled());
    watcher.dispose();
    const racing = new ReviewWorkspaceWatcher();
    const pending = racing.ensure("repo", repo, changed);
    racing.dispose();
    await pending;
    changed.mockClear();
    await writeFile(join(tree, "file.txt"), "disposed\n");
    await writeFile(join(repo, "file.txt"), "disposed\n");
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(changed).not.toHaveBeenCalled();
  } finally {
    watcher.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

it("reports checkout files as ignore candidates and forces refresh for ignore rules and Git metadata", async () => {
  const repo = await mkdtemp(join(tmpdir(), "review-watch-paths-"));
  const watcher = new ReviewWorkspaceWatcher();
  const changed = vi.fn<(path?: string) => void>();
  try {
    const git = (args: string[]) => promisify(execFile)("git", args, { cwd: repo });
    await git(["init", "-b", "main"]);
    await mkdir(join(repo, "dist"));
    await watcher.ensure("repo", repo, changed);
    await settleWatch(repo, changed);
    await writeFile(join(repo, "dist", "out.js"), "built\n");
    await vi.waitFor(() => expect(changed).toHaveBeenCalledWith("dist/out.js"));
    expect(changed.mock.calls.every(([path]) => typeof path === "string")).toBe(true);
    await new Promise(resolve => setTimeout(resolve, 150));
    changed.mockClear();
    await writeFile(join(repo, ".gitignore"), "dist/\n");
    await vi.waitFor(() => expect(changed).toHaveBeenCalledWith());
    await new Promise(resolve => setTimeout(resolve, 150));
    changed.mockClear();
    await writeFile(join(repo, "dist", ".gitignore"), "*\n");
    await vi.waitFor(() => expect(changed).toHaveBeenCalledWith());
    await new Promise(resolve => setTimeout(resolve, 150));
    changed.mockClear();
    await writeFile(join(repo, "tracked.txt"), "x\n");
    await git(["add", "tracked.txt"]);
    await vi.waitFor(() => expect(changed).toHaveBeenCalledWith());
  } finally {
    watcher.dispose();
    await rm(repo, { recursive: true, force: true });
  }
});
