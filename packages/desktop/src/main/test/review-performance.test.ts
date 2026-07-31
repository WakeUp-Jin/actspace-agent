import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { REVIEW_LOAD_LIMITS } from "@actspace/shared";
import { ReviewGitEngine, reviewLoadPolicy, runReviewGitCommand, type ReviewGitCommandRunner } from "../review-git-engine";

const execFileAsync = promisify(execFile);
const created: string[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("Review performance budgets", () => {
  it("keeps exact thresholds in all-files mode and caps the first exceeded budget", () => {
    expect(reviewLoadPolicy(REVIEW_LOAD_LIMITS.fileCount, 0, 0)).toEqual({ mode: "all-files" });
    expect(reviewLoadPolicy(REVIEW_LOAD_LIMITS.fileCount + 1, 0, 0)).toEqual({ mode: "single-file", reason: "file-count" });
    expect(reviewLoadPolicy(1, REVIEW_LOAD_LIMITS.changedLines, 0)).toEqual({ mode: "all-files" });
    expect(reviewLoadPolicy(1, REVIEW_LOAD_LIMITS.changedLines + 1, 0)).toEqual({ mode: "single-file", reason: "changed-lines" });
    expect(reviewLoadPolicy(1, 1, REVIEW_LOAD_LIMITS.changedBytes)).toEqual({ mode: "all-files" });
    expect(reviewLoadPolicy(1, 1, REVIEW_LOAD_LIMITS.changedBytes + 1)).toEqual({ mode: "single-file", reason: "changed-bytes" });
  });

  it("loads fifty tracked files with one grouped patch command", async () => {
    const root = await makeRepo();
    const commands: string[][] = [];
    const runner: ReviewGitCommandRunner = async (args, options) => {
      commands.push(args);
      return runReviewGitCommand(args, options);
    };
    await Promise.all(Array.from({ length: 50 }, (_, index) => writeFile(join(root, `file-${index}.txt`), `before ${index}\n`, "utf8")));
    await git(root, ["add", "."]);
    await git(root, ["commit", "-m", "base"]);
    await Promise.all(Array.from({ length: 50 }, (_, index) => writeFile(join(root, `file-${index}.txt`), `after ${index}\n`, "utf8")));

    const engine = new ReviewGitEngine({ runner });
    const snapshot = await engine.getSnapshot({
      workspaceId: "performance",
      workspaceRoot: root,
      selection: { kind: "unstaged" },
      generation: 1,
      options: { ignoreWhitespaceChanges: false },
      signal: new AbortController().signal,
    });
    expect(snapshot.loadPolicy).toEqual({ mode: "all-files" });
    commands.length = 0;
    const result = await engine.getFileDiffs({
      workspaceId: "performance",
      workspaceRoot: root,
      snapshot,
      generation: 1,
      requests: snapshot.files.map((file) => ({ fileId: file.id, contextLines: 3 })),
      signal: new AbortController().signal,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.outcomes).toHaveLength(50);
    expect(commands.filter((args) => args.some((arg) => arg.startsWith("--unified=")))).toHaveLength(1);
  });
});

async function makeRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "actspace-review-performance-"));
  created.push(root);
  await git(root, ["init", "-b", "main"]);
  await git(root, ["config", "user.email", "test@example.com"]);
  await git(root, ["config", "user.name", "Actspace Test"]);
  return root;
}

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd });
}
