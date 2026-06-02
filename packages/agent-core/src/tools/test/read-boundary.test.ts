import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileExecutor, listDirectoryExecutor } from "../index";
import { readFileDefinition } from "../tools/read-file/definition";

/**
 * 读边界放开：read_file / list_directory 等读类工具不再被 workspace 守卫框住，
 * 可读 workspace 之外的路径（bash 落盘文件、session.jsonl 等内部产物的回读前提）。
 */
describe("read-class tools ignore workspace boundary", () => {
  it("documents that read_file can read explicit local paths such as attachments", () => {
    expect(readFileDefinition.description).toContain("user-explicitly provided local path");
    expect(readFileDefinition.description).toContain("attached file path");
    expect(readFileDefinition.description).not.toContain("Do NOT use this tool for files outside the workspace boundary");
  });

  it("read_file reads an absolute path outside the workspace", async () => {
    const workspace = await realpath(await mkdtemp(join(tmpdir(), "actspace-rb-ws-")));
    const outsideDir = await realpath(await mkdtemp(join(tmpdir(), "actspace-rb-out-")));
    const outsideFile = join(outsideDir, "overflow.txt");
    await writeFile(outsideFile, "secret-overflow-content\n");

    const result = await readFileExecutor({ path: outsideFile }, workspace);
    expect(result.success).toBe(true);
    expect(String(result.data)).toContain("secret-overflow-content");
  });

  it("read_file still resolves relative paths against the workspace", async () => {
    const workspace = await realpath(await mkdtemp(join(tmpdir(), "actspace-rb-ws-")));
    await writeFile(join(workspace, "inside.txt"), "inside-content\n");

    const result = await readFileExecutor({ path: "inside.txt" }, workspace);
    expect(result.success).toBe(true);
    expect(String(result.data)).toContain("inside-content");
  });

  it("list_directory lists a directory outside the workspace", async () => {
    const workspace = await realpath(await mkdtemp(join(tmpdir(), "actspace-rb-ws-")));
    const outsideDir = await realpath(await mkdtemp(join(tmpdir(), "actspace-rb-out-")));
    await mkdir(join(outsideDir, "sub"));
    await writeFile(join(outsideDir, "a.txt"), "x");

    const result = await listDirectoryExecutor({ path: outsideDir }, workspace);
    expect(result.success).toBe(true);
    const data = String(result.data);
    expect(data).toContain("a.txt");
    expect(data).toContain("sub");
  });
});
