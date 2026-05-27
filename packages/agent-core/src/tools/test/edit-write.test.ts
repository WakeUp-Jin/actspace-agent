import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFile, mkdir, writeFile, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";

import { editFileDiffExecutor, renderEditResult } from "../tools/edit-file-diff/executor";
import { writeFileExecutor, renderWriteResult } from "../tools/write-file/executor";
import { writeTextAtomic } from "../tools/shared/write-atomic";

function tempDir(): string {
  return join(tmpdir(), `actspace-test-${randomBytes(6).toString("hex")}`);
}

describe("writeTextAtomic", () => {
  let dir: string;

  beforeEach(async () => {
    dir = tempDir();
    await mkdir(dir, { recursive: true });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("creates a new file", async () => {
    const target = join(dir, "new.txt");
    await writeTextAtomic(target, "hello");
    expect(await readFile(target, "utf-8")).toBe("hello");
  });

  it("overwrites an existing file", async () => {
    const target = join(dir, "existing.txt");
    await writeFile(target, "old");
    await writeTextAtomic(target, "new");
    expect(await readFile(target, "utf-8")).toBe("new");
  });

  it("creates parent directories automatically", async () => {
    const target = join(dir, "a", "b", "deep.txt");
    await writeTextAtomic(target, "deep content");
    expect(await readFile(target, "utf-8")).toBe("deep content");
  });

  it("preserves file mode", async () => {
    const target = join(dir, "mode.txt");
    await writeFile(target, "original");
    const { mode: originalMode } = await stat(target);

    await writeTextAtomic(target, "updated");
    const { mode: newMode } = await stat(target);
    expect(newMode).toBe(originalMode);
  });
});

describe("editFileDiffExecutor", () => {
  let dir: string;

  beforeEach(async () => {
    dir = tempDir();
    await mkdir(dir, { recursive: true });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("replaces unique string and writes back to file", async () => {
    const target = join(dir, "file.ts");
    await writeFile(target, 'const x = "old";\n');

    const result = await editFileDiffExecutor(
      { path: target, old_string: '"old"', new_string: '"new"' },
      dir,
    );

    expect(result.success).toBe(true);
    expect(await readFile(target, "utf-8")).toBe('const x = "new";\n');

    const data = result.data as Record<string, unknown>;
    expect(data.type).toBe("update");
    expect(typeof data.diff).toBe("string");
    expect((data.diff as string)).toContain("-");
    expect((data.diff as string)).toContain("+");
    expect(data.additions).toBeGreaterThan(0);
    expect(data.deletions).toBeGreaterThan(0);
  });

  it("rejects when old_string matches multiple locations", async () => {
    const target = join(dir, "dup.ts");
    await writeFile(target, "foo\nfoo\n");

    const result = await editFileDiffExecutor(
      { path: target, old_string: "foo", new_string: "bar" },
      dir,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("matches");
    expect(await readFile(target, "utf-8")).toBe("foo\nfoo\n");
  });

  it("replaces all occurrences with replace_all", async () => {
    const target = join(dir, "all.ts");
    await writeFile(target, "foo\nfoo\nfoo\n");

    const result = await editFileDiffExecutor(
      { path: target, old_string: "foo", new_string: "bar", replace_all: true },
      dir,
    );

    expect(result.success).toBe(true);
    expect(await readFile(target, "utf-8")).toBe("bar\nbar\nbar\n");
  });

  it("returns error when old_string not found", async () => {
    const target = join(dir, "miss.ts");
    await writeFile(target, "hello world");

    const result = await editFileDiffExecutor(
      { path: target, old_string: "nonexistent", new_string: "something" },
      dir,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("creates new file when old_string is empty and file does not exist", async () => {
    const target = join(dir, "brand-new.ts");

    const result = await editFileDiffExecutor(
      { path: target, old_string: "", new_string: "new content" },
      dir,
    );

    expect(result.success).toBe(true);
    expect(await readFile(target, "utf-8")).toBe("new content");
    const data = result.data as Record<string, unknown>;
    expect(data.type).toBe("create");
    expect(data.relativePath).toBe("brand-new.ts");
  });

  it("rejects path outside workspace", async () => {
    const result = await editFileDiffExecutor(
      { path: "/etc/passwd", old_string: "x", new_string: "y" },
      dir,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("escape");
  });

  it("renderEditResult returns diff text for model", () => {
    const result = {
      success: true,
      data: { diff: "--- a/f\n+++ b/f\n-old\n+new", filePath: "/tmp/f", type: "update" },
    };
    const rendered = renderEditResult(result);
    expect(rendered).toContain("--- a/f");
    expect(rendered).toContain("File updated");
  });
});

describe("writeFileExecutor", () => {
  let dir: string;

  beforeEach(async () => {
    dir = tempDir();
    await mkdir(dir, { recursive: true });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("creates a new file with all-green diff", async () => {
    const target = join(dir, "new-file.ts");

    const result = await writeFileExecutor(
      { path: target, content: "line1\nline2\n" },
      dir,
    );

    expect(result.success).toBe(true);
    expect(await readFile(target, "utf-8")).toBe("line1\nline2\n");

    const data = result.data as Record<string, unknown>;
    expect(data.type).toBe("create");
    expect(data.additions).toBeGreaterThan(0);
    expect(data.deletions).toBe(0);
    expect(data.relativePath).toBe("new-file.ts");
    expect((data.diff as string)).toContain("+line1");
  });

  it("overwrites existing file with red+green diff", async () => {
    const target = join(dir, "overwrite.ts");
    await writeFile(target, "old line\n");

    const result = await writeFileExecutor(
      { path: target, content: "new line\n" },
      dir,
    );

    expect(result.success).toBe(true);
    expect(await readFile(target, "utf-8")).toBe("new line\n");

    const data = result.data as Record<string, unknown>;
    expect(data.type).toBe("update");
    expect(data.additions).toBeGreaterThan(0);
    expect(data.deletions).toBeGreaterThan(0);
    expect((data.diff as string)).toContain("-old line");
    expect((data.diff as string)).toContain("+new line");
  });

  it("creates parent directories automatically", async () => {
    const target = join(dir, "deep", "nested", "file.txt");

    const result = await writeFileExecutor(
      { path: target, content: "deep" },
      dir,
    );

    expect(result.success).toBe(true);
    expect(existsSync(target)).toBe(true);
  });

  it("rejects path outside workspace", async () => {
    const result = await writeFileExecutor(
      { path: "/etc/shadow", content: "hack" },
      dir,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("escape");
  });

  it("renderWriteResult returns diff text for model", () => {
    const result = {
      success: true,
      data: { diff: "+new stuff", filePath: "/tmp/f", relativePath: "f", type: "create" },
    };
    const rendered = renderWriteResult(result);
    expect(rendered).toContain("+new stuff");
    expect(rendered).toContain("File created: f");
    expect(rendered).not.toContain("/tmp/f");
  });
});
