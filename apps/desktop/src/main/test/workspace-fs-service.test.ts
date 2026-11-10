import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WORKSPACE_TEXT_PREVIEW_LIMIT_BYTES } from "@actspace/shared";
import {
  MARKDOWN_LIST_MAX_FILES,
  MARKDOWN_WALK_MAX_ENTRIES,
  listWorkspaceMarkdownFiles,
  readWorkspaceFile,
  statWorkspaceFile,
  writeWorkspaceMarkdownFile,
} from "../workspace-fs-service";
import type { GitRunner } from "../git/run-git";
import type { AppDataRoots } from "../app-paths";

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

async function put(root: string, relativePath: string, content = "# x"): Promise<void> {
  const abs = join(root, relativePath);
  await mkdir(join(abs, ".."), { recursive: true });
  await writeFile(abs, content, "utf8");
}

const notRepo: GitRunner = async () => ({ stdout: "", stderr: "fatal: not a git repository", exitCode: 128, timedOut: false, truncated: false });

describe("listWorkspaceMarkdownFiles", () => {
  it("lists tracked and untracked markdown in a git repo and honours .gitignore", async () => {
    const { workspaceRoot } = await makeWorkspace();
    execFileSync("git", ["init", "-q"], { cwd: workspaceRoot });
    await put(workspaceRoot, "README.md");
    await put(workspaceRoot, "docs/guide.markdown");
    await put(workspaceRoot, "docs/中文 文档.md");
    await put(workspaceRoot, "notes/ignored.md");
    await put(workspaceRoot, "node_modules/pkg/README.md");
    await put(workspaceRoot, "src/index.ts", "export {}");
    await put(workspaceRoot, ".gitignore", "notes/\nnode_modules/\n");
    execFileSync("git", ["add", "README.md", ".gitignore"], { cwd: workspaceRoot });
    await put(workspaceRoot, "new-untracked.md");

    const result = await listWorkspaceMarkdownFiles(workspaceRoot);

    expect(result).toEqual({
      ok: true,
      source: "git",
      truncated: false,
      files: ["README.md", "docs/guide.markdown", "docs/中文 文档.md", "new-untracked.md"],
    });
  });

  it("walks a non-git directory, skipping noise dirs, dot dirs and symlinks", async () => {
    const { workspaceRoot } = await makeWorkspace();
    const outside = await mkdtemp(join(tmpdir(), "actspace-fs-outside-"));
    created.push(outside);
    await put(outside, "secret.md");
    await put(workspaceRoot, "b/two.md");
    await put(workspaceRoot, "a.md");
    await put(workspaceRoot, "node_modules/x/README.md");
    await put(workspaceRoot, ".hidden/h.md");
    await put(workspaceRoot, "dist/out.md");
    await put(workspaceRoot, "code.ts", "export {}");
    await symlink(outside, join(workspaceRoot, "link-dir"));
    await symlink(join(outside, "secret.md"), join(workspaceRoot, "link.md"));
    // 没有可用的 git 时同样走遍历。
    const noGit: GitRunner = async () => ({ stdout: "", stderr: "", exitCode: null, timedOut: false, truncated: false, startError: { code: "ENOENT", message: "git missing" } });

    expect(await listWorkspaceMarkdownFiles(workspaceRoot, { runGit: noGit })).toEqual({ ok: true, source: "walk", truncated: false, files: ["a.md", "b/two.md"] });
    expect(await listWorkspaceMarkdownFiles(workspaceRoot, { runGit: notRepo })).toEqual({ ok: true, source: "walk", truncated: false, files: ["a.md", "b/two.md"] });
  });

  it("excludes git-tracked markdown files that were deleted on disk", async () => {
    const { workspaceRoot } = await makeWorkspace();
    execFileSync("git", ["init", "-q"], { cwd: workspaceRoot });
    execFileSync("git", ["config", "user.email", "t@example.com"], { cwd: workspaceRoot });
    execFileSync("git", ["config", "user.name", "t"], { cwd: workspaceRoot });
    await put(workspaceRoot, "keep.md");
    await put(workspaceRoot, "gone.md");
    execFileSync("git", ["add", "keep.md", "gone.md"], { cwd: workspaceRoot });
    execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: workspaceRoot });
    await rm(join(workspaceRoot, "gone.md"));

    expect(await listWorkspaceMarkdownFiles(workspaceRoot)).toEqual({ ok: true, source: "git", truncated: false, files: ["keep.md"] });
  });

  it("matches markdown extensions case-insensitively for git and walk sources", async () => {
    const { workspaceRoot } = await makeWorkspace();
    execFileSync("git", ["init", "-q"], { cwd: workspaceRoot });
    await put(workspaceRoot, "README.MD");
    await put(workspaceRoot, "docs/Guide.Markdown");
    await put(workspaceRoot, "docs/lower.md");
    await put(workspaceRoot, "code.ts", "export {}");
    const expected = ["README.MD", "docs/Guide.Markdown", "docs/lower.md"];

    const viaGit = await listWorkspaceMarkdownFiles(workspaceRoot);
    expect(viaGit).toMatchObject({ ok: true, source: "git" });
    expect(viaGit.ok && [...viaGit.files].sort()).toEqual([...expected].sort());
    const walked = await listWorkspaceMarkdownFiles(workspaceRoot, { runGit: notRepo });
    expect(walked).toMatchObject({ ok: true, source: "walk" });
    expect(walked.ok && [...walked.files].sort()).toEqual([...expected].sort());

    const calls: string[][] = [];
    const spy: GitRunner = async (args) => {
      calls.push(args);
      return { stdout: "", stderr: "", exitCode: 0, timedOut: false, truncated: false };
    };
    await listWorkspaceMarkdownFiles(workspaceRoot, { runGit: spy });
    expect(calls.length).toBeGreaterThanOrEqual(2);
    for (const args of calls) expect(args).toEqual(expect.arrayContaining([":(icase)*.md", ":(icase)*.markdown"]));
    expect(calls.some((args) => args.includes("--deleted"))).toBe(true);
  });

  it("truncates to the file cap for both sources", async () => {
    const { workspaceRoot } = await makeWorkspace();
    const names = Array.from({ length: MARKDOWN_LIST_MAX_FILES + 3 }, (_, index) => `d/${String(index).padStart(5, "0")}.md`);
    const fakeGit: GitRunner = async (args) => ({ stdout: args.includes("--deleted") ? "" : [...names, ...names].join("\0") + "\0", stderr: "", exitCode: 0, timedOut: false, truncated: false });
    const viaGit = await listWorkspaceMarkdownFiles(workspaceRoot, { runGit: fakeGit });
    expect(viaGit).toMatchObject({ ok: true, source: "git", truncated: true });
    expect(viaGit.ok && viaGit.files).toHaveLength(MARKDOWN_LIST_MAX_FILES);

    await Promise.all(names.slice(0, MARKDOWN_LIST_MAX_FILES + 1).map((name) => put(workspaceRoot, name)));
    const walked = await listWorkspaceMarkdownFiles(workspaceRoot, { runGit: notRepo });
    expect(walked).toMatchObject({ ok: true, source: "walk", truncated: true });
    expect(walked.ok && walked.files).toHaveLength(MARKDOWN_LIST_MAX_FILES);
  });

  it("lists nested git repos with git ls-files inside a non-git walk", async () => {
    const { workspaceRoot } = await makeWorkspace();
    await put(workspaceRoot, "top.md");
    await put(workspaceRoot, "plain/p.md");
    await put(workspaceRoot, "repo/README.md");
    await put(workspaceRoot, "repo/ignored/i.md");
    await put(workspaceRoot, "repo/node_modules/dep/README.md");
    await put(workspaceRoot, "repo/.gitignore", "ignored/\nnode_modules/\n");
    execFileSync("git", ["init", "-q"], { cwd: join(workspaceRoot, "repo") });
    // 根目录不是仓库：根上的 git 调用失败，嵌套仓库里的调用走真实 git。
    const runGit: GitRunner = async (args, options) => options.cwd === workspaceRoot ? notRepo(args, options) : (await import("../git/run-git")).runGitCommand(args, options);
    expect(await listWorkspaceMarkdownFiles(workspaceRoot, { runGit })).toEqual({ ok: true, source: "walk", truncated: false, files: ["plain/p.md", "repo/README.md", "top.md"] });
  });

  it("reports the directories a truncated walk did not finish, and expanded raises the caps", async () => {
    const { workspaceRoot } = await makeWorkspace();
    const names = Array.from({ length: MARKDOWN_LIST_MAX_FILES + 2 }, (_, index) => `b/${String(index).padStart(5, "0")}.md`);
    await Promise.all([...names.map((name) => put(workspaceRoot, name)), put(workspaceRoot, "a/x.md"), put(workspaceRoot, "c/z.md")]);
    const walked = await listWorkspaceMarkdownFiles(workspaceRoot, { runGit: notRepo });
    expect(walked).toMatchObject({ ok: true, source: "walk", truncated: true, incompleteDirs: ["b", "c"] });
    const expanded = await listWorkspaceMarkdownFiles(workspaceRoot, { runGit: notRepo }, { expanded: true });
    expect(expanded).toMatchObject({ ok: true, source: "walk", truncated: false });
    expect(expanded.ok && expanded.files).toHaveLength(MARKDOWN_LIST_MAX_FILES + 4);
  });

  it("keeps the visited-entry cap at 50000 and reports an untruncated small walk", async () => {
    expect(MARKDOWN_WALK_MAX_ENTRIES).toBe(50_000);
    const { workspaceRoot } = await makeWorkspace();
    await put(workspaceRoot, "a.md");
    expect(await listWorkspaceMarkdownFiles(workspaceRoot, { runGit: notRepo })).toMatchObject({ truncated: false });
  });

  it("rejects relative roots, missing roots and files", async () => {
    const { workspaceRoot } = await makeWorkspace();
    await put(workspaceRoot, "f.md");
    expect(await listWorkspaceMarkdownFiles("../..")).toEqual({ ok: false, error: "escapes_root" });
    expect(await listWorkspaceMarkdownFiles(join(workspaceRoot, "missing"))).toEqual({ ok: false, error: "not_found" });
    expect(await listWorkspaceMarkdownFiles(join(workspaceRoot, "f.md"))).toEqual({ ok: false, error: "not_a_directory" });
  });
});

describe("writeWorkspaceMarkdownFile", () => {
  it("overwrites an existing markdown file atomically and reports the new stat", async () => {
    const roots = await makeWorkspace();
    const workspaceRoot = roots.workspaceRoot;
    await put(workspaceRoot, "docs/a.md", "old");

    const result = await writeWorkspaceMarkdownFile({ workspaceRoot, relativePath: "docs/a.md", content: "# 新内容\n" });

    expect(result).toMatchObject({ ok: true, size: Buffer.byteLength("# 新内容\n") });
    expect(await readFile(join(workspaceRoot, "docs/a.md"), "utf8")).toBe("# 新内容\n");
    expect((await readdir(join(workspaceRoot, "docs"))).filter((name) => name.endsWith(".tmp"))).toEqual([]);
    const stat = await statWorkspaceFile({ workspaceRoot, relativePath: "docs/a.md" }, roots);
    expect(result.ok && result.mtimeMs).toBe(stat.mtimeMs);
  });

  it("accepts uppercase markdown extensions", async () => {
    const { workspaceRoot } = await makeWorkspace();
    await put(workspaceRoot, "README.MD", "old");
    expect(await writeWorkspaceMarkdownFile({ workspaceRoot, relativePath: "README.MD", content: "new" })).toMatchObject({ ok: true });
    expect(await readFile(join(workspaceRoot, "README.MD"), "utf8")).toBe("new");
  });

  it("rejects non-markdown, missing and directory targets without creating files", async () => {
    const { workspaceRoot } = await makeWorkspace();
    await put(workspaceRoot, "code.ts", "x");
    await mkdir(join(workspaceRoot, "dir.md"));
    expect(await writeWorkspaceMarkdownFile({ workspaceRoot, relativePath: "code.ts", content: "y" })).toEqual({ ok: false, error: "not_markdown" });
    expect(await writeWorkspaceMarkdownFile({ workspaceRoot, relativePath: "missing.md", content: "y" })).toEqual({ ok: false, error: "not_found" });
    expect(await writeWorkspaceMarkdownFile({ workspaceRoot, relativePath: "dir.md", content: "y" })).toEqual({ ok: false, error: "not_found" });
    expect(await readFile(join(workspaceRoot, "code.ts"), "utf8")).toBe("x");
    expect((await readdir(workspaceRoot)).sort()).toEqual(["code.ts", "dir.md"]);
  });

  it("rejects traversal, symlinks that leave the root, and markdown symlinks to non-markdown targets", async () => {
    const { workspaceRoot } = await makeWorkspace();
    const outside = await mkdtemp(join(tmpdir(), "actspace-fs-outside-"));
    created.push(outside);
    await put(outside, "secret.md", "secret");
    await put(workspaceRoot, "plain.txt", "plain");
    await symlink(outside, join(workspaceRoot, "escape"));
    await symlink(join(outside, "secret.md"), join(workspaceRoot, "link.md"));
    await symlink(join(workspaceRoot, "plain.txt"), join(workspaceRoot, "to-text.md"));

    expect(await writeWorkspaceMarkdownFile({ workspaceRoot, relativePath: "../x.md", content: "y" })).toEqual({ ok: false, error: "escapes_root" });
    expect(await writeWorkspaceMarkdownFile({ workspaceRoot, relativePath: "escape/secret.md", content: "y" })).toEqual({ ok: false, error: "escapes_root" });
    expect(await writeWorkspaceMarkdownFile({ workspaceRoot, relativePath: "link.md", content: "y" })).toEqual({ ok: false, error: "escapes_root" });
    expect(await writeWorkspaceMarkdownFile({ workspaceRoot, relativePath: "to-text.md", content: "y" })).toEqual({ ok: false, error: "not_markdown" });
    expect(await writeWorkspaceMarkdownFile({ workspaceRoot: "relative", relativePath: "a.md", content: "y" })).toEqual({ ok: false, error: "escapes_root" });
    expect(await readFile(join(outside, "secret.md"), "utf8")).toBe("secret");
    expect(await readFile(join(workspaceRoot, "plain.txt"), "utf8")).toBe("plain");
  });

  it("follows a symlink that stays inside the root and keeps the link", async () => {
    const { workspaceRoot } = await makeWorkspace();
    await put(workspaceRoot, "real.md", "old");
    await symlink(join(workspaceRoot, "real.md"), join(workspaceRoot, "alias.md"));
    expect(await writeWorkspaceMarkdownFile({ workspaceRoot, relativePath: "alias.md", content: "new" })).toMatchObject({ ok: true });
    expect(await readFile(join(workspaceRoot, "real.md"), "utf8")).toBe("new");
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
