import { mkdtemp, mkdir, writeFile, symlink, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it, expect } from "vitest";
import { queryPathsWithinWorkspace } from "../query-paths.js";
it("checks query operands and Git -C against real workspace paths", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "query-scope-")));
  try {
    const workspace = join(root, "workspace");
    await mkdir(workspace);
    await writeFile(join(workspace, "inside"), "ok");
    await writeFile(join(root, "outside"), "no");
    await symlink(join(root, "outside"), join(workspace, "link"));
    expect(await queryPathsWithinWorkspace({ queryPaths: ["inside"] }, workspace, workspace)).toBe(true);
    for (const path of ["../outside", "link", "missing"])
      expect(await queryPathsWithinWorkspace({ queryPaths: [path] }, workspace, workspace)).toBe(false);
    expect(await queryPathsWithinWorkspace({ directory: "..", queryPaths: [] }, workspace, workspace)).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("accepts script paths inside the Host scratch directory but not elsewhere outside the workspace", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "query-scope-")));
  try {
    const workspace = join(root, "workspace");
    const scratch = join(root, "scratch", "scripts", "session");
    await mkdir(workspace);
    await mkdir(scratch, { recursive: true });
    await writeFile(join(scratch, "run.py"), "print(1)");
    await writeFile(join(root, "other.py"), "print(2)");
    expect(
      await queryPathsWithinWorkspace({ queryPaths: [join(scratch, "run.py")] }, workspace, workspace, [
        join(root, "scratch"),
      ]),
    ).toBe(true);
    expect(await queryPathsWithinWorkspace({ queryPaths: [join(scratch, "run.py")] }, workspace, workspace)).toBe(
      false,
    );
    expect(
      await queryPathsWithinWorkspace({ queryPaths: [join(root, "other.py")] }, workspace, workspace, [
        join(root, "scratch"),
      ]),
    ).toBe(false);
    expect(
      await queryPathsWithinWorkspace({ directory: join(root, "scratch"), queryPaths: [] }, workspace, workspace, [
        join(root, "scratch"),
      ]),
    ).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
