import { expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ReviewWorkspaceWatcher } from "../review-workspace-watcher";

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
