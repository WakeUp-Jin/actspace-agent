import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listWorkspaceDir, readWorkspaceFile } from "../workspace-fs-service";
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

  it("rejects oversized text files", async () => {
    const roots = await makeWorkspace();
    const big = "x".repeat(2 * 1024 * 1024 + 1);
    await writeFile(join(roots.workspaceRoot, "huge.txt"), big, "utf8");
    const result = await readWorkspaceFile({ relativePath: "huge.txt" }, roots);
    expect(result.error).toBe("too_large");
    expect(result.content).toBeUndefined();
  });

  it("rejects path traversal", async () => {
    const roots = await makeWorkspace();
    const result = await readWorkspaceFile({ relativePath: "../../etc/passwd" }, roots);
    expect(result.error).toBe("escapes_root");
  });
});
