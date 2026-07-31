import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { AppDataRoots } from "../agent-turn";
import { initializeGitRepository } from "../review-git-service";

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
  const dataRoot = await mkdtemp(join(tmpdir(), "actspace-review-init-"));
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

describe("review git initialization", () => {
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
    expect((await stat(join(roots.workspaceRoot, ".git"))).isDirectory()).toBe(true);
    const indexExists = await readFile(join(roots.workspaceRoot, ".git", "index")).then(() => true, () => false);
    expect(indexExists).toBe(false);
  });

  it("does not reinitialize an existing repository", async () => {
    const roots = await makeWorkspace();
    if (!gitAvailable) return;
    await execFileAsync("git", ["init"], { cwd: roots.workspaceRoot });

    await expect(initializeGitRepository({}, roots)).resolves.toMatchObject({ ok: true, alreadyRepository: true });
  });
});
