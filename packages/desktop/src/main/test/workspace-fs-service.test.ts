import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import hljs from "highlight.js";
import { WORKSPACE_TEXT_PREVIEW_LIMIT_BYTES } from "@actspace/shared";
import {
  listMappedLanguages,
  listWorkspaceDir,
  readWorkspaceFile,
  statWorkspaceFile,
} from "../workspace-fs-service";
import type { AppDataRoots } from "../agent-turn";

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
    expect(result.language).toBeUndefined();
  });

  it("infers highlight language for code/config files", async () => {
    const roots = await makeWorkspace();
    await writeFile(join(roots.workspaceRoot, "a.ts"), "export const x = 1;", "utf8");
    await writeFile(join(roots.workspaceRoot, "b.yaml"), "key: value", "utf8");
    await writeFile(join(roots.workspaceRoot, "c.unknownext"), "plain", "utf8");

    const ts = await readWorkspaceFile({ relativePath: "a.ts" }, roots);
    expect(ts.renderKind).toBe("text");
    expect(ts.language).toBe("typescript");

    const yaml = await readWorkspaceFile({ relativePath: "b.yaml" }, roots);
    expect(yaml.language).toBe("yaml");

    const unknown = await readWorkspaceFile({ relativePath: "c.unknownext" }, roots);
    expect(unknown.renderKind).toBe("text");
    expect(unknown.language).toBeUndefined();
  });

  it("returns an image as a base64 data URL", async () => {
    const roots = await makeWorkspace();
    await writeFile(join(roots.workspaceRoot, "pixel.png"), Buffer.from(PNG_BASE64, "base64"));
    const result = await readWorkspaceFile({ relativePath: "pixel.png" }, roots);
    expect(result.renderKind).toBe("image");
    expect(result.dataUrl?.startsWith("data:image/png;base64,")).toBe(true);
    expect(result.content).toBeUndefined();
  });

  it("flags binary text files", async () => {
    const roots = await makeWorkspace();
    await writeFile(join(roots.workspaceRoot, "blob.bin"), Buffer.from([0x68, 0x00, 0x69]));
    const result = await readWorkspaceFile({ relativePath: "blob.bin" }, roots);
    expect(result.error).toBe("binary");
  });

  it("truncates oversized text to whole lines instead of rejecting the file", async () => {
    const roots = await makeWorkspace();
    // 每行 10 字节，写到刚好超过上限，确保截断点落在行中间。
    const line = "0123456789\n".slice(0, 11);
    const big = line.repeat(Math.ceil(WORKSPACE_TEXT_PREVIEW_LIMIT_BYTES / line.length) + 100);
    await writeFile(join(roots.workspaceRoot, "huge.log"), big, "utf8");

    const result = await readWorkspaceFile({ relativePath: "huge.log" }, roots);

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

  it("resolves language from basename for dotfiles and extension-less files", async () => {
    const roots = await makeWorkspace();
    await writeFile(join(roots.workspaceRoot, "Dockerfile"), "FROM node:22", "utf8");
    await writeFile(join(roots.workspaceRoot, "Makefile"), "all:\n\techo hi", "utf8");
    await writeFile(join(roots.workspaceRoot, ".gitignore"), "dist\n", "utf8");
    await writeFile(join(roots.workspaceRoot, ".npmrc"), "registry=x\n", "utf8");
    await writeFile(join(roots.workspaceRoot, ".env.local"), "A=1\n", "utf8");
    await writeFile(join(roots.workspaceRoot, "go.mod"), "module x\n", "utf8");
    await writeFile(join(roots.workspaceRoot, "LICENSE"), "MIT\n", "utf8");

    const expected: Array<[string, string | undefined]> = [
      ["Dockerfile", "dockerfile"],
      ["Makefile", "makefile"],
      [".gitignore", "plaintext"],
      [".npmrc", "ini"],
      [".env.local", "bash"],
      ["go.mod", "go"],
      ["LICENSE", undefined],
    ];
    for (const [name, language] of expected) {
      const result = await readWorkspaceFile({ relativePath: name }, roots);
      expect(result.language, name).toBe(language);
    }
  });

  it("covers the newly mapped extensions", async () => {
    const roots = await makeWorkspace();
    const cases: Array<[string, string]> = [
      ["a.astro", "xml"],
      ["a.vue", "xml"],
      ["a.java", "java"],
      ["a.cpp", "cpp"],
      ["a.rb", "ruby"],
      ["a.tf", "ini"],
      ["a.proto", "protobuf"],
      ["a.patch", "diff"],
      ["a.ini", "ini"],
      ["a.ps1", "powershell"],
    ];
    for (const [name] of cases) {
      await writeFile(join(roots.workspaceRoot, name), "x\n", "utf8");
    }
    for (const [name, language] of cases) {
      const result = await readWorkspaceFile({ relativePath: name }, roots);
      expect(result.language, name).toBe(language);
    }
  });

  it("leaves plain data files unhighlighted on purpose", async () => {
    const roots = await makeWorkspace();
    await writeFile(join(roots.workspaceRoot, "notes.txt"), "hi\n", "utf8");
    await writeFile(join(roots.workspaceRoot, "app.log"), "hi\n", "utf8");
    expect((await readWorkspaceFile({ relativePath: "notes.txt" }, roots)).language).toBeUndefined();
    expect((await readWorkspaceFile({ relativePath: "app.log" }, roots)).language).toBeUndefined();
  });

  it("routes csv/tsv to the csv render kind without a language", async () => {
    const roots = await makeWorkspace();
    await writeFile(join(roots.workspaceRoot, "data.csv"), "a,b\n1,2\n", "utf8");
    await writeFile(join(roots.workspaceRoot, "data.tsv"), "a\tb\n1\t2\n", "utf8");

    const csv = await readWorkspaceFile({ relativePath: "data.csv" }, roots);
    expect(csv.renderKind).toBe("csv");
    expect(csv.content).toBe("a,b\n1,2\n");
    expect(csv.language).toBeUndefined();
    expect((await readWorkspaceFile({ relativePath: "data.tsv" }, roots)).renderKind).toBe("csv");
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

describe("language mapping integrity", () => {
  // 防漂移锁（main 侧一端）：映射表里写的每个语言 id 都必须是 highlight.js 真实存在的语言，
  // 否则文件会静默回退成纯文本。renderer 侧 `right-panel/highlight.ts` 有对应的另一端。
  it("only maps languages that highlight.js actually provides", () => {
    const missing = listMappedLanguages().filter((language) => !hljs.getLanguage(language));
    expect(missing).toEqual([]);
  });
});
