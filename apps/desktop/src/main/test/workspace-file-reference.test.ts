import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveWorkspaceFileReference } from "../workspace-file-reference";

let base: string;
let workspace: string;

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "file-reference-"));
  workspace = join(base, "workspace");
  await mkdir(join(workspace, "src", "nested"), { recursive: true });
  await writeFile(join(workspace, "src", "nested", "a.ts"), "export {};\n");
  await mkdir(join(base, "outside"));
  await writeFile(join(base, "outside", "secret.txt"), "secret\n");
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

describe("resolveWorkspaceFileReference", () => {
  it("accepts a regular file inside the workspace", async () => {
    await expect(resolveWorkspaceFileReference(workspace, "src/nested/a.ts")).resolves.toEqual({ ok: true });
    await expect(resolveWorkspaceFileReference(workspace, "./src\\nested\\a.ts")).resolves.toEqual({ ok: true });
  });

  it("reports missing files and directories", async () => {
    await expect(resolveWorkspaceFileReference(workspace, "src/missing.ts")).resolves.toEqual({ ok: false, code: "file_not_found" });
    await expect(resolveWorkspaceFileReference(workspace, "src/nested")).resolves.toEqual({ ok: false, code: "not_a_file" });
  });

  it("rejects lexical escapes and absolute paths", async () => {
    await expect(resolveWorkspaceFileReference(workspace, "../outside/secret.txt")).resolves.toEqual({ ok: false, code: "file_outside_workspace" });
    await expect(resolveWorkspaceFileReference(workspace, join(base, "outside", "secret.txt"))).resolves.toEqual({ ok: false, code: "file_outside_workspace" });
  });

  it("rejects a symlink that points outside the workspace but accepts one that stays inside", async () => {
    await symlink(join(base, "outside", "secret.txt"), join(workspace, "leak.txt"));
    await symlink(join(base, "outside"), join(workspace, "leak-dir"));
    await symlink(join(workspace, "src", "nested", "a.ts"), join(workspace, "alias.ts"));
    await expect(resolveWorkspaceFileReference(workspace, "leak.txt")).resolves.toEqual({ ok: false, code: "file_outside_workspace" });
    await expect(resolveWorkspaceFileReference(workspace, "leak-dir/secret.txt")).resolves.toEqual({ ok: false, code: "file_outside_workspace" });
    await expect(resolveWorkspaceFileReference(workspace, "alias.ts")).resolves.toEqual({ ok: true });
  });

  it("accepts files whose names start with two dots", async () => {
    await writeFile(join(workspace, "..notes.md"), "x\n");
    await expect(resolveWorkspaceFileReference(workspace, "..notes.md")).resolves.toEqual({ ok: true });
  });
});
