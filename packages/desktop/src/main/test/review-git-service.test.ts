import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { AppDataRoots } from "../agent-turn";
import { getWorkspaceGitChanges, initializeGitRepository } from "../review-git-service";

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
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeWorkspace(): Promise<AppDataRoots> {
  const dataRoot = await mkdtemp(join(tmpdir(), "actspace-review-"));
  created.push(dataRoot);
  return {
    dataRoot,
    sessionRoot: join(dataRoot, "sessions"),
    logRoot: join(dataRoot, "logs"),
    tmpRoot: join(dataRoot, "tmp"),
    defaultWorkspaceRoot: dataRoot,
    workspaceRoot: dataRoot,
  };
}

async function git(cwd: string, args: string[]) {
  if (!gitAvailable) return;
  await execFileAsync("git", args, { cwd });
}

async function initRepo(roots: AppDataRoots) {
  await git(roots.workspaceRoot, ["init"]);
  await git(roots.workspaceRoot, ["config", "user.email", "test@example.com"]);
  await git(roots.workspaceRoot, ["config", "user.name", "Actspace Test"]);
}

async function commitAll(roots: AppDataRoots, message = "initial") {
  await git(roots.workspaceRoot, ["add", "."]);
  await git(roots.workspaceRoot, ["commit", "-m", message]);
}

describe("review git service", () => {
  it("returns not_a_repository for a non-Git workspace", async () => {
    const roots = await makeWorkspace();

    const result = await getWorkspaceGitChanges({}, roots);

    if (!gitAvailable) {
      expect(result.reason).toBe("git_not_found");
      return;
    }
    expect(result.status).toBe("notAvailable");
    expect(result.reason).toBe("not_a_repository");
  });

  it("returns empty for an initialized repository with no changes", async () => {
    const roots = await makeWorkspace();
    await initRepo(roots);

    const result = await getWorkspaceGitChanges({}, roots);

    if (!gitAvailable) {
      expect(result.reason).toBe("git_not_found");
      return;
    }
    expect(result.status).toBe("empty");
    expect(result.changeSet?.files).toEqual([]);
    expect(result.changeSet?.baseline?.label).toBe("No commits");
  });

  it("parses tracked modified files with additions and deletions", async () => {
    const roots = await makeWorkspace();
    await initRepo(roots);
    await writeFile(join(roots.workspaceRoot, "notes.md"), "one\ntwo\n", "utf8");
    await commitAll(roots);
    await writeFile(join(roots.workspaceRoot, "notes.md"), "one\nthree\nfour\n", "utf8");

    const result = await getWorkspaceGitChanges({}, roots);

    if (!gitAvailable) {
      expect(result.reason).toBe("git_not_found");
      return;
    }
    expect(result.status).toBe("changes");
    expect(result.changeSet?.totalAdditions).toBe(2);
    expect(result.changeSet?.totalDeletions).toBe(1);
    expect(result.changeSet?.files[0]).toMatchObject({
      path: "notes.md",
      status: "modified",
      additions: 2,
      deletions: 1,
    });
    expect(result.changeSet?.files[0].chunks[0].unifiedText).toContain("+three");
  });

  it("includes staged and unstaged changes in uncommitted scope", async () => {
    const roots = await makeWorkspace();
    await initRepo(roots);
    await writeFile(join(roots.workspaceRoot, "a.txt"), "a\n", "utf8");
    await writeFile(join(roots.workspaceRoot, "b.txt"), "b\n", "utf8");
    await commitAll(roots);
    await writeFile(join(roots.workspaceRoot, "a.txt"), "a staged\n", "utf8");
    await git(roots.workspaceRoot, ["add", "a.txt"]);
    await writeFile(join(roots.workspaceRoot, "b.txt"), "b unstaged\n", "utf8");

    const result = await getWorkspaceGitChanges({}, roots);

    if (!gitAvailable) {
      expect(result.reason).toBe("git_not_found");
      return;
    }
    expect(result.status).toBe("changes");
    expect(result.changeSet?.files.map((file) => file.path)).toEqual(["a.txt", "b.txt"]);
  });

  it("creates pseudo diffs for untracked text files", async () => {
    const roots = await makeWorkspace();
    await initRepo(roots);
    await writeFile(join(roots.workspaceRoot, "todo.txt"), "alpha\nbeta\n", "utf8");

    const result = await getWorkspaceGitChanges({}, roots);

    if (!gitAvailable) {
      expect(result.reason).toBe("git_not_found");
      return;
    }
    expect(result.status).toBe("changes");
    expect(result.changeSet?.files[0]).toMatchObject({
      path: "todo.txt",
      status: "added",
      additions: 2,
      deletions: 0,
    });
    expect(result.changeSet?.files[0].chunks[0].unifiedText).toContain("+alpha");
  });

  it("skips binary untracked files with a warning", async () => {
    const roots = await makeWorkspace();
    await initRepo(roots);
    await writeFile(join(roots.workspaceRoot, "blob.bin"), Buffer.from([0x00, 0x01, 0x02]));

    const result = await getWorkspaceGitChanges({}, roots);

    if (!gitAvailable) {
      expect(result.reason).toBe("git_not_found");
      return;
    }
    expect(result.status).toBe("partial");
    expect(result.changeSet?.warnings?.[0]).toMatchObject({
      kind: "binary_skipped",
      filePath: "blob.bin",
    });
    expect(result.changeSet?.files[0]).toMatchObject({
      path: "blob.bin",
      status: "added",
      chunks: [],
    });
  });

  it("marks untracked images for preview instead of warning, even when oversized", async () => {
    const roots = await makeWorkspace();
    await initRepo(roots);
    // 超过 UNTRACKED_MAX_TEXT_BYTES（256KB）的 PNG：不应再报 "too large" 警告
    const oversized = Buffer.alloc(300 * 1024, 0x42);
    oversized[0] = 0x89; // PNG 魔数首字节，顺带保证含非文本字节
    await writeFile(join(roots.workspaceRoot, "home.png"), oversized);

    const result = await getWorkspaceGitChanges({}, roots);

    if (!gitAvailable) {
      expect(result.reason).toBe("git_not_found");
      return;
    }
    expect(result.status).toBe("changes");
    expect(result.changeSet?.warnings).toBeUndefined();
    expect(result.changeSet?.files[0]).toMatchObject({
      path: "home.png",
      status: "added",
      renderKind: "image",
      chunks: [],
    });
  });

  it("marks tracked modified images for preview", async () => {
    const roots = await makeWorkspace();
    await initRepo(roots);
    await writeFile(join(roots.workspaceRoot, "icon.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    await commitAll(roots);
    await writeFile(join(roots.workspaceRoot, "icon.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d]));

    const result = await getWorkspaceGitChanges({}, roots);

    if (!gitAvailable) {
      expect(result.reason).toBe("git_not_found");
      return;
    }
    expect(result.changeSet?.files[0]).toMatchObject({
      path: "icon.png",
      status: "modified",
      renderKind: "image",
    });
  });

  it("maps renamed and deleted files", async () => {
    const roots = await makeWorkspace();
    await initRepo(roots);
    await writeFile(join(roots.workspaceRoot, "old.txt"), "same\n", "utf8");
    await writeFile(join(roots.workspaceRoot, "gone.txt"), "remove me\n", "utf8");
    await commitAll(roots);
    await git(roots.workspaceRoot, ["mv", "old.txt", "new.txt"]);
    await rm(join(roots.workspaceRoot, "gone.txt"));

    const result = await getWorkspaceGitChanges({}, roots);

    if (!gitAvailable) {
      expect(result.reason).toBe("git_not_found");
      return;
    }
    const renamed = result.changeSet?.files.find((file) => file.path === "new.txt");
    const deleted = result.changeSet?.files.find((file) => file.path === "gone.txt");
    expect(renamed).toMatchObject({
      status: "renamed",
      previousPath: "old.txt",
    });
    expect(deleted).toMatchObject({
      status: "deleted",
      deletions: 1,
    });
  });

  it("initializes Git only when explicitly requested", async () => {
    const roots = await makeWorkspace();
    await mkdir(join(roots.workspaceRoot, "src"));
    await writeFile(join(roots.workspaceRoot, "src", "index.ts"), "export const x = 1;\n", "utf8");

    const result = await initializeGitRepository({}, roots);

    if (!gitAvailable) {
      expect(result.error).toBe("git_not_found");
      return;
    }
    expect(result).toMatchObject({ ok: true, alreadyRepository: false });
    await expect(stat(join(roots.workspaceRoot, ".git"))).resolves.toBeTruthy();
    const gitDir = await stat(join(roots.workspaceRoot, ".git"));
    expect(gitDir.isDirectory()).toBe(true);
    const indexExists = await readFile(join(roots.workspaceRoot, ".git", "index")).then(
      () => true,
      () => false,
    );
    expect(indexExists).toBe(false);
  });
});
