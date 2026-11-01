import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WORKSPACE_TEXT_PREVIEW_LIMIT_BYTES } from "@actspace/shared";
import {
  listWorkspaceDir,
  readWorkspaceFile,
  statWorkspaceFile,
} from "../workspace-fs-service";
import type { AppDataRoots } from "../agent-run";

const created: string[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeWorkspace(): Promise<AppDataRoots> {
  const dataRoot = await mkdtemp(join(tmpdir(), "actspace-fs-"));
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

// 1x1 透明 PNG。
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("listWorkspaceDir", () => {
  it("lists directories before files, each sorted, and ignores noise dirs", async () => {
    const roots = await makeWorkspace();
    await mkdir(join(roots.workspaceRoot, "node_modules"), { recursive: true });
    await mkdir(join(roots.workspaceRoot, ".git"), { recursive: true });
    await mkdir(join(roots.workspaceRoot, "src"), { recursive: true });
    await mkdir(join(roots.workspaceRoot, "docs"), { recursive: true });
    await writeFile(join(roots.workspaceRoot, "z.txt"), "z", "utf8");
    await writeFile(join(roots.workspaceRoot, "a.txt"), "a", "utf8");

    const result = await listWorkspaceDir({}, roots);

    expect(result.error).toBeUndefined();
    expect(result.entries.map((entry) => entry.name)).toEqual(["docs", "src", "a.txt", "z.txt"]);
    expect(result.entries.find((entry) => entry.name === "node_modules")).toBeUndefined();
    expect(result.entries.find((entry) => entry.name === ".git")).toBeUndefined();
    expect(result.entries[0].kind).toBe("dir");
    expect(result.entries.find((entry) => entry.name === "a.txt")?.size).toBe(1);
  });

  it("rejects path traversal without touching the filesystem", async () => {
    const roots = await makeWorkspace();
    const result = await listWorkspaceDir({ relativePath: "../.." }, roots);
    expect(result.error).toBe("escapes_root");
    expect(result.entries).toEqual([]);
  });

  it("reports not_a_directory for a file path", async () => {
    const roots = await makeWorkspace();
    await writeFile(join(roots.workspaceRoot, "f.txt"), "hi", "utf8");
    const result = await listWorkspaceDir({ relativePath: "f.txt" }, roots);
    expect(result.error).toBe("not_a_directory");
  });
});

describe("readWorkspaceFile", () => {
  it("reads markdown as markdown with original content", async () => {
    const roots = await makeWorkspace();
    await writeFile(join(roots.workspaceRoot, "readme.md"), "# Hi\n\ntext", "utf8");
    const result = await readWorkspaceFile({ relativePath: "readme.md" }, roots);
    expect(result.renderKind).toBe("markdown");
    expect(result.content).toBe("# Hi\n\ntext");
  });

  it("returns only stat for files that are not rendered in-app", async () => {
    const roots = await makeWorkspace();
    await writeFile(join(roots.workspaceRoot, "a.ts"), "export const x = 1;", "utf8");
    await writeFile(join(roots.workspaceRoot, "b.html"), "<p>x</p>", "utf8");
    await writeFile(join(roots.workspaceRoot, "c.csv"), "a,b\n1,2\n", "utf8");
    await writeFile(join(roots.workspaceRoot, "d.bin"), Buffer.from([0x68, 0x00, 0x69]));
    for (const name of ["a.ts", "b.html", "c.csv", "d.bin"]) {
      const result = await readWorkspaceFile({ relativePath: name }, roots);
      expect(result.renderKind, name).toBe("external");
      expect(result.error, name).toBeUndefined();
      expect(result.content, name).toBeUndefined();
      expect(result.size, name).toBeGreaterThan(0);
      expect(result.mtimeMs, name).toBeGreaterThan(0);
    }
  });

  it("returns an image as a base64 data URL", async () => {
    const roots = await makeWorkspace();
    await writeFile(join(roots.workspaceRoot, "pixel.png"), Buffer.from(PNG_BASE64, "base64"));
    const result = await readWorkspaceFile({ relativePath: "pixel.png" }, roots);
    expect(result.renderKind).toBe("image");
    expect(result.dataUrl?.startsWith("data:image/png;base64,")).toBe(true);
    expect(result.content).toBeUndefined();
  });

  it("truncates oversized text to whole lines instead of rejecting the file", async () => {
    const roots = await makeWorkspace();
    // 每行 10 字节，写到刚好超过上限，确保截断点落在行中间。
    const line = "0123456789\n".slice(0, 11);
    const big = line.repeat(Math.ceil(WORKSPACE_TEXT_PREVIEW_LIMIT_BYTES / line.length) + 100);
    await writeFile(join(roots.workspaceRoot, "huge.md"), big, "utf8");

    const result = await readWorkspaceFile({ relativePath: "huge.md" }, roots);

    expect(result.error).toBeUndefined();
    expect(result.truncated).toBe(true);
    expect(result.content?.length).toBeGreaterThan(0);
    // size 仍是磁盘上的完整大小，供 UI 报告「共 M 字节」。
    expect(result.size).toBe(Buffer.byteLength(big, "utf8"));
    // 截断必须落在行边界上，不能留半行。
    expect(result.content?.endsWith("\n")).toBe(true);
    // 读到的量不能超过契约上限 —— renderer 的提示条就是拿这个数报「仅显示前 X」。
    expect(Buffer.byteLength(result.content ?? "", "utf8")).toBeLessThanOrEqual(
      WORKSPACE_TEXT_PREVIEW_LIMIT_BYTES,
    );
  });

  it("still rejects oversized images, since partial bytes cannot be decoded", async () => {
    const roots = await makeWorkspace();
    await writeFile(join(roots.workspaceRoot, "big.png"), Buffer.alloc(5 * 1024 * 1024 + 1));
    const result = await readWorkspaceFile({ relativePath: "big.png" }, roots);
    expect(result.error).toBe("too_large");
    expect(result.dataUrl).toBeUndefined();
  });

  it("returns mtime so the right panel can detect stale tabs", async () => {
    const roots = await makeWorkspace();
    await writeFile(join(roots.workspaceRoot, "a.ts"), "const a = 1;\n", "utf8");
    const first = await readWorkspaceFile({ relativePath: "a.ts" }, roots);
    expect(first.mtimeMs).toBeGreaterThan(0);

    await writeFile(join(roots.workspaceRoot, "a.ts"), "const a = 2;\nconst b = 3;\n", "utf8");
    const second = await readWorkspaceFile({ relativePath: "a.ts" }, roots);
    expect(second.mtimeMs).toBeGreaterThanOrEqual(first.mtimeMs);
    expect(second.size).not.toBe(first.size);
  });

  it("reports mtimeMs 0 on error branches", async () => {
    const roots = await makeWorkspace();
    expect((await readWorkspaceFile({ relativePath: "nope.ts" }, roots)).mtimeMs).toBe(0);
    expect((await readWorkspaceFile({ relativePath: "../../etc/passwd" }, roots)).mtimeMs).toBe(0);
  });

  it("rejects path traversal", async () => {
    const roots = await makeWorkspace();
    const result = await readWorkspaceFile({ relativePath: "../../etc/passwd" }, roots);
    expect(result.error).toBe("escapes_root");
  });
});

describe("statWorkspaceFile", () => {
  it("returns size and mtime without reading content", async () => {
    const roots = await makeWorkspace();
    await writeFile(join(roots.workspaceRoot, "a.ts"), "const a = 1;\n", "utf8");
    const result = await statWorkspaceFile({ relativePath: "a.ts" }, roots);
    expect(result.error).toBeUndefined();
    expect(result.size).toBe(13);
    expect(result.mtimeMs).toBeGreaterThan(0);
  });

  it("reports errors for missing files, directories and traversal", async () => {
    const roots = await makeWorkspace();
    await mkdir(join(roots.workspaceRoot, "dir"), { recursive: true });
    expect((await statWorkspaceFile({ relativePath: "nope.ts" }, roots)).error).toBe("not_found");
    expect((await statWorkspaceFile({ relativePath: "dir" }, roots)).error).toBe("not_a_file");
    expect((await statWorkspaceFile({ relativePath: "../.." }, roots)).error).toBe("escapes_root");
  });
});

describe("workspace root containment", () => {
  it("rejects symlinks that point outside the root but follows ones that stay inside", async () => {
    const roots = await makeWorkspace();
    const outside = await mkdtemp(join(tmpdir(), "actspace-fs-outside-"));
    created.push(outside);
    await writeFile(join(outside, "secret.txt"), "secret", "utf8");
    await mkdir(join(roots.dataRoot, "docs"));
    await writeFile(join(roots.dataRoot, "docs", "a.md"), "# a", "utf8");
    await symlink(outside, join(roots.dataRoot, "escape"));
    await symlink(join(outside, "secret.txt"), join(roots.dataRoot, "secret-link.txt"));
    await symlink(join(roots.dataRoot, "docs"), join(roots.dataRoot, "docs-link"));

    expect((await listWorkspaceDir({ relativePath: "escape" }, roots)).error).toBe("escapes_root");
    expect((await readWorkspaceFile({ relativePath: "escape/secret.txt" }, roots)).error).toBe("escapes_root");
    expect((await readWorkspaceFile({ relativePath: "secret-link.txt" }, roots)).error).toBe("escapes_root");
    expect((await statWorkspaceFile({ relativePath: "secret-link.txt" }, roots)).error).toBe("escapes_root");
    // 不存在的目标也要按 symlink 解析后的位置判断，否则 escapes_root / not_found 的区别会泄露 root 外的文件是否存在。
    expect((await statWorkspaceFile({ relativePath: "escape/missing.txt" }, roots)).error).toBe("escapes_root");
    expect((await statWorkspaceFile({ relativePath: "docs/missing.txt" }, roots)).error).toBe("not_found");

    const inside = await readWorkspaceFile({ relativePath: "docs-link/a.md" }, roots);
    expect(inside.error).toBeUndefined();
    expect(inside.relativePath).toBe("docs-link/a.md");
    expect(inside.content).toBe("# a");
  });

  it("does not treat names starting with .. as escaping the root", async () => {
    const roots = await makeWorkspace();
    await writeFile(join(roots.dataRoot, "..foo.md"), "dots", "utf8");

    const result = await readWorkspaceFile({ relativePath: "..foo.md" }, roots);

    expect(result.error).toBeUndefined();
    expect(result.content).toBe("dots");
    expect((await statWorkspaceFile({ relativePath: "..foo.md" }, roots)).error).toBeUndefined();
  });
});
