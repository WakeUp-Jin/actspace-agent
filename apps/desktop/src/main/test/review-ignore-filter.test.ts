import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createReviewIgnoredPathFilter } from "../review-ignore-filter";
import { runReviewGitCommand } from "../review-git-engine";

describe("createReviewIgnoredPathFilter", () => {
  const filter = createReviewIgnoredPathFilter(runReviewGitCommand);
  let root = "";
  let repo = "";

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "review-ignore-filter-"));
    repo = join(root, "repo");
    await mkdir(join(repo, "dist"), { recursive: true });
    await mkdir(join(repo, "node_modules", "pkg"), { recursive: true });
    await mkdir(join(repo, "src"));
    const git = (args: string[]) => promisify(execFile)("git", args, { cwd: repo });
    await git(["init", "-b", "main"]);
    await writeFile(join(repo, ".gitignore"), "dist/\nnode_modules\n*.log\n");
    await writeFile(join(repo, "dist", "out.js"), "built\n");
    await writeFile(join(repo, "dist", "tracked.js"), "tracked despite ignore\n");
    await writeFile(join(repo, "node_modules", "pkg", "index.js"), "dep\n");
    await writeFile(join(repo, "src", "a.ts"), "source\n");
    await git(["add", ".gitignore", "src"]);
    await git(["add", "-f", "dist/tracked.js"]);
    await git(["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "fixture"]);
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("skips a batch that only touches ignored build output and dependencies", async () => {
    await expect(filter({ workspaceRoot: repo, paths: ["dist/out.js", "node_modules/pkg/index.js", "app.log", "dist/sub/new.js"] })).resolves.toBe(false);
  });

  it("keeps tracked files inside ignored directories", async () => {
    await expect(filter({ workspaceRoot: repo, paths: ["dist/out.js", "dist/tracked.js"] })).resolves.toBe(true);
  });

  it("keeps source edits and new untracked files", async () => {
    await expect(filter({ workspaceRoot: repo, paths: ["src/a.ts"] })).resolves.toBe(true);
    await expect(filter({ workspaceRoot: repo, paths: ["dist/out.js", "notes.md"] })).resolves.toBe(true);
  });

  it("treats paths it cannot classify as changes", async () => {
    await expect(filter({ workspaceRoot: root, paths: ["anything.txt"] })).resolves.toBe(true);
    await expect(filter({ workspaceRoot: join(root, "missing"), paths: ["dist/out.js"] })).resolves.toBe(true);
  });

  it("does not run Git for an empty batch", async () => {
    await expect(filter({ workspaceRoot: join(root, "missing"), paths: [] })).resolves.toBe(false);
  });
});
