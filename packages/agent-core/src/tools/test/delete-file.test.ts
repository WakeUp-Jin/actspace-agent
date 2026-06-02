import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { deleteFileExecutor, renderDeleteResult } from "../tools/delete-file/executor";
import { createDeleteFilePermissionChecker } from "../tools/delete-file/permissions";

function tempDir(): string {
  return join(tmpdir(), `actspace-delete-test-${randomBytes(6).toString("hex")}`);
}

describe("deleteFileExecutor", () => {
  let dir: string;

  beforeEach(async () => {
    dir = tempDir();
    await mkdir(dir, { recursive: true });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("deletes a regular file inside the workspace", async () => {
    const target = join(dir, "notes.md");
    await writeFile(target, "delete me");

    const result = await deleteFileExecutor({ path: target }, dir);

    expect(result.success).toBe(true);
    expect(existsSync(target)).toBe(false);
    expect(result.data).toMatchObject({
      type: "delete",
      filePath: target,
      relativePath: "notes.md",
    });
  });

  it("returns a readable error when the file does not exist", async () => {
    const result = await deleteFileExecutor({ path: "missing.md" }, dir);

    expect(result.success).toBe(false);
    expect(result.error).toBe("File not found: missing.md");
  });

  it("rejects directories", async () => {
    const target = join(dir, "folder");
    await mkdir(target);

    const result = await deleteFileExecutor({ path: target }, dir);

    expect(result.success).toBe(false);
    expect(result.error).toBe("delete_file only supports files. Directories are not supported.");
    await expect(stat(target)).resolves.toBeTruthy();
  });

  it("rejects paths outside the workspace", async () => {
    const result = await deleteFileExecutor({ path: "/etc/passwd" }, dir);

    expect(result.success).toBe(false);
    expect(result.error).toContain("escapes workspace boundary");
  });

  it("requires path", async () => {
    const result = await deleteFileExecutor({}, dir);

    expect(result.success).toBe(false);
    expect(result.error).toBe("path is required");
  });

  it("renders a short model result with relative path", () => {
    const rendered = renderDeleteResult({
      success: true,
      data: { type: "delete", filePath: "/tmp/workspace/notes.md", relativePath: "notes.md" },
    });

    expect(rendered).toBe("File deleted: notes.md");
  });
});

describe("createDeleteFilePermissionChecker", () => {
  let dir: string;

  beforeEach(async () => {
    dir = tempDir();
    await mkdir(dir, { recursive: true });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("asks for approval for workspace files", async () => {
    const checker = createDeleteFilePermissionChecker(dir);
    const decision = await checker({ path: "notes.md" });

    expect(decision).toMatchObject({
      decision: "ask",
      summary: "Delete notes.md",
      reason: "delete_file is a destructive file operation and requires approval.",
      riskLevel: "high",
      allowSimilar: false,
      sanitizedArgs: { path: join(dir, "notes.md") },
    });
  });

  it("denies missing path before approval", async () => {
    const checker = createDeleteFilePermissionChecker(dir);
    const decision = await checker({});

    expect(decision).toEqual({ decision: "deny", reason: "path is required" });
  });

  it("denies outside workspace before approval", async () => {
    const checker = createDeleteFilePermissionChecker(dir);
    const decision = await checker({ path: "/etc/passwd" });

    expect(decision.decision).toBe("deny");
    expect(decision.reason).toContain("escapes workspace boundary");
  });
});
