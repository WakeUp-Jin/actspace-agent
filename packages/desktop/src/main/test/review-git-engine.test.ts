import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ReviewGitEngine } from "../review-git-engine";

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

async function makeRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "actspace-review-engine-"));
  created.push(root);
  if (!gitAvailable) return root;
  await git(root, ["init", "-b", "main"]);
  await git(root, ["config", "user.email", "test@example.com"]);
  await git(root, ["config", "user.name", "Actspace Test"]);
  return root;
}

async function git(cwd: string, args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, { cwd });
  return String(result.stdout).trim();
}

async function commitAll(cwd: string, message: string): Promise<string> {
  await git(cwd, ["add", "."]);
  await git(cwd, ["commit", "-m", message]);
  return git(cwd, ["rev-parse", "HEAD"]);
}

function workspace(root: string) {
  return { workspaceId: "workspace-1", workspaceRoot: root };
}

describe("ReviewGitEngine", () => {
  it("returns a typed notAvailable snapshot outside Git", async () => {
    const root = await mkdtemp(join(tmpdir(), "actspace-review-engine-"));
    created.push(root);
    const snapshot = await new ReviewGitEngine().getSnapshot({
      ...workspace(root),
      selection: { kind: "uncommitted" },
      generation: 1,
    });

    expect(snapshot.status).toBe("notAvailable");
    expect(snapshot.files).toEqual([]);
  });

  it("reports a missing workspace folder instead of claiming Git is unavailable", async () => {
    const root = await mkdtemp(join(tmpdir(), "actspace-review-engine-missing-"));
    await rm(root, { recursive: true, force: true });
    const snapshot = await new ReviewGitEngine().getSnapshot({
      ...workspace(root),
      selection: { kind: "uncommitted" },
      generation: 1,
    });

    expect(snapshot.status).toBe("notAvailable");
    expect(snapshot.warnings).toContainEqual(expect.objectContaining({ message: "Workspace folder is no longer available." }));
  });

  it("separates uncommitted, unstaged, staged, commit and branch scopes", async () => {
    const root = await makeRepo();
    if (!gitAvailable) return;
    await writeFile(join(root, "base.txt"), "base\n", "utf8");
    await writeFile(join(root, "staged.txt"), "before staged\n", "utf8");
    await writeFile(join(root, "unstaged.txt"), "before unstaged\n", "utf8");
    await commitAll(root, "base");
    await git(root, ["switch", "-c", "feature"]);
    await git(root, ["remote", "add", "origin", root]);
    await git(root, ["update-ref", "refs/remotes/origin/main", "main"]);
    await git(root, ["branch", "--set-upstream-to=origin/main", "feature"]);
    await writeFile(join(root, "branch.txt"), "branch\n", "utf8");
    const branchCommit = await commitAll(root, "branch change");
    await writeFile(join(root, "staged.txt"), "after staged\n", "utf8");
    await git(root, ["add", "staged.txt"]);
    await writeFile(join(root, "unstaged.txt"), "after unstaged\n", "utf8");
    await writeFile(join(root, "untracked.txt"), "untracked\n", "utf8");

    const engine = new ReviewGitEngine();
    const uncommitted = await engine.getSnapshot({ ...workspace(root), selection: { kind: "uncommitted" }, generation: 1 });
    const staged = await engine.getSnapshot({ ...workspace(root), selection: { kind: "staged" }, generation: 1 });
    const unstaged = await engine.getSnapshot({ ...workspace(root), selection: { kind: "unstaged" }, generation: 1 });
    const commit = await engine.getSnapshot({ ...workspace(root), selection: { kind: "commit", sha: branchCommit }, generation: 1 });
    const branch = await engine.getSnapshot({ ...workspace(root), selection: { kind: "branch", branch: "feature" }, generation: 1 });

    expect(uncommitted.files.map((file) => file.path).sort()).toEqual(["staged.txt", "unstaged.txt", "untracked.txt"]);
    expect(staged.files.map((file) => file.path)).toEqual(["staged.txt"]);
    expect(unstaged.files.map((file) => file.path)).toEqual(["unstaged.txt"]);
    expect(commit.files.map((file) => file.path)).toEqual(["branch.txt"]);
    expect(branch.files.map((file) => file.path)).toEqual(["branch.txt"]);
    expect(branch.comparison).toEqual({ from: "feature", to: "origin/main" });
    await expect(engine.listBranches(workspace(root))).resolves.toContainEqual({ branch: "feature", upstream: "origin/main", current: true, ahead: 1, behind: 0 });
    await expect(engine.createPatch(workspace(root), branch)).resolves.toContain("branch.txt");
  });

  it("keeps quoted and spaced paths and scopes a repository subdirectory", async () => {
    const root = await makeRepo();
    if (!gitAvailable) return;
    await mkdir(join(root, "app"));
    await mkdir(join(root, "sibling"));
    await writeFile(join(root, "app", "名字 with ' quote.ts"), "const before = 1;\n", "utf8");
    await writeFile(join(root, "sibling", "hidden.ts"), "export const hidden = 1;\n", "utf8");
    await commitAll(root, "base");
    await writeFile(join(root, "app", "名字 with ' quote.ts"), "const after = 2;\n", "utf8");
    await writeFile(join(root, "sibling", "hidden.ts"), "export const hidden = 2;\n", "utf8");

    const engine = new ReviewGitEngine();
    const snapshot = await engine.getSnapshot({
      workspaceId: "workspace-app",
      workspaceRoot: join(root, "app"),
      selection: { kind: "unstaged" },
      generation: 1,
    });

    expect(snapshot.files.map((file) => file.path)).toEqual(["app/名字 with ' quote.ts"]);
    const diff = await engine.getFileDiff({
      workspaceId: "workspace-app",
      workspaceRoot: join(root, "app"),
      snapshot,
      fileId: snapshot.files[0]!.id,
      generation: 1,
    });
    expect(diff.ok).toBe(true);
    if (diff.ok) {
      expect(diff.diff.hunks[0]?.lines.some((line) => line.kind === "addition" && line.text.includes("after"))).toBe(true);
    }
  });

  it("stages and unstages a file through mutation results", async () => {
    const root = await makeRepo();
    if (!gitAvailable) return;
    await writeFile(join(root, "file.txt"), "before\n", "utf8");
    await commitAll(root, "base");
    await writeFile(join(root, "file.txt"), "after\n", "utf8");
    const engine = new ReviewGitEngine();
    const unstaged = await engine.getSnapshot({ ...workspace(root), selection: { kind: "unstaged" }, generation: 1 });

    const stagedResult = await engine.applyMutation({
      ...workspace(root),
      mutation: {
        snapshotId: unstaged.id,
        expectedGeneration: 1,
        action: "stage",
        scope: "file",
        source: "workingTree",
        path: "file.txt",
      },
    });
    expect(stagedResult.status).toBe("success");
    expect(await git(root, ["diff", "--cached", "--name-only"])).toBe("file.txt");

    const staged = await engine.getSnapshot({ ...workspace(root), selection: { kind: "staged" }, generation: 2 });
    const unstagedResult = await engine.applyMutation({
      ...workspace(root),
      mutation: {
        snapshotId: staged.id,
        expectedGeneration: 2,
        action: "unstage",
        scope: "file",
        source: "index",
        path: "file.txt",
      },
    });
    expect(unstagedResult.status).toBe("success");
    expect(await git(root, ["diff", "--cached", "--name-only"])).toBe("");
  });

  it("stages one selected hunk while leaving the other unstaged", async () => {
    const root = await makeRepo();
    if (!gitAvailable) return;
    const before = Array.from({ length: 20 }, (_, index) => `line ${index + 1}`).join("\n") + "\n";
    await writeFile(join(root, "file.txt"), before, "utf8");
    await commitAll(root, "base");
    const lines = before.trimEnd().split("\n");
    lines[1] = "line two changed";
    lines[17] = "line eighteen changed";
    await writeFile(join(root, "file.txt"), `${lines.join("\n")}\n`, "utf8");

    const engine = new ReviewGitEngine();
    const snapshot = await engine.getSnapshot({ ...workspace(root), selection: { kind: "unstaged" }, generation: 1 });
    const diffResult = await engine.getFileDiff({
      ...workspace(root),
      snapshot,
      fileId: snapshot.files[0]!.id,
      generation: 1,
    });
    expect(diffResult.ok).toBe(true);
    if (!diffResult.ok) return;
    expect(diffResult.diff.hunks).toHaveLength(2);
    const contents = await engine.getFileContents({
      ...workspace(root),
      snapshot,
      fileIds: [snapshot.files[0]!.id],
      generation: 1,
      signal: new AbortController().signal,
    });
    expect(contents.ok).toBe(true);
    if (contents.ok && contents.outcomes[0]?.status !== "failed") {
      expect(contents.outcomes[0]?.contents.target.text?.split("\n").length).toBeGreaterThanOrEqual(20);
    }

    const result = await engine.applyMutation({
      ...workspace(root),
      mutation: {
        snapshotId: snapshot.id,
        expectedGeneration: 1,
        action: "stage",
        scope: "hunk",
        source: "workingTree",
        path: "file.txt",
        hunkId: diffResult.diff.hunks[0]!.id,
        patchFingerprint: diffResult.diff.hunks[0]!.patchFingerprint,
      },
    });

    expect(result.status).toBe("success");
    expect(await git(root, ["diff", "--cached", "--numstat"])).toContain("1\t1\tfile.txt");
    expect(await git(root, ["diff", "--numstat"])).toContain("1\t1\tfile.txt");
  });
});
