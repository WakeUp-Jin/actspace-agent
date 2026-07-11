import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ToolManager } from "../manager";
import { readFileDefinition } from "../tools/read-file/definition";
import { readFileExecutor, READ_FILE_DEFAULT_LIMIT } from "../tools/read-file/executor";

let workspace: string;
let manager: ToolManager;

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), "actspace-read-file-"));
  manager = new ToolManager({ workspaceRoot: workspace });
  manager.registerFromSpec(readFileDefinition, readFileExecutor);
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

function lines(count: number): string {
  return Array.from({ length: count }, (_, index) => `line-${index + 1}`).join("\n");
}

describe("read_file", () => {
  it("describes segmented range reads and the force escape hatch", () => {
    expect(readFileDefinition.description).toContain("Prefer segmented reads");
    expect(readFileDefinition.description).toContain("200 lines");
    expect(readFileDefinition.description).toContain("force=true");
    expect(readFileDefinition.parameters.properties.limit.description).toContain("default 200-line range");
    expect(readFileDefinition.parameters.properties.force.description).toContain("unchanged range");
  });

  it("reads 200 lines by default and prompts offset/limit paging", async () => {
    await writeFile(join(workspace, "long.txt"), lines(250), "utf8");

    const result = await readFileExecutor({ path: "long.txt" }, workspace);

    expect(result.success).toBe(true);
    const output = String(result.data);
    expect(output).toContain(`${String(READ_FILE_DEFAULT_LIMIT).padStart(6)}|line-200`);
    expect(output).not.toContain("line-201");
    expect(output).toContain("[Showing lines 1-200 of 250. Use offset/limit to read more.]");
  });

  it("returns image files as native image content for multimodal models", async () => {
    const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    await writeFile(join(workspace, "pixel.png"), Buffer.from(pngBase64, "base64"));

    const result = await readFileExecutor({ path: "pixel.png" }, workspace);

    expect(result.success).toBe(true);
    expect(String(result.data)).toContain("Read image file:");
    expect(result.content).toEqual([
      expect.objectContaining({ type: "text" }),
      { type: "image", data: pngBase64, mimeType: "image/png" },
    ]);
  });

  it("returns an unchanged stub for repeated reads of the same unchanged range", async () => {
    await writeFile(join(workspace, "memo.txt"), "alpha\nbeta\n", "utf8");

    const first = await manager.execute("read_file", { path: "memo.txt", offset: 1, limit: 2 });
    expect(first.success).toBe(true);
    expect(String(first.data)).toContain("alpha");

    const second = await manager.execute("read_file", { path: "memo.txt", offset: 1, limit: 2 });
    expect(second.success).toBe(true);
    expect(String(second.data)).toContain("File unchanged since previous read");
    expect(String(second.data)).not.toContain("alpha");
  });

  it("force=true repeats an unchanged range", async () => {
    await writeFile(join(workspace, "memo.txt"), "alpha\nbeta\n", "utf8");

    await manager.execute("read_file", { path: "memo.txt", offset: 1, limit: 2 });
    const forced = await manager.execute("read_file", {
      path: "memo.txt",
      offset: 1,
      limit: 2,
      force: true,
    });

    expect(forced.success).toBe(true);
    expect(String(forced.data)).toContain("alpha");
    expect(String(forced.data)).not.toContain("File unchanged since previous read");
  });

  it("reads again when file metadata changes", async () => {
    const filePath = join(workspace, "memo.txt");
    await writeFile(filePath, "alpha\n", "utf8");
    await manager.execute("read_file", { path: "memo.txt", offset: 1, limit: 1 });
    await writeFile(filePath, "changed-alpha-longer\n", "utf8");

    const result = await manager.execute("read_file", { path: "memo.txt", offset: 1, limit: 1 });

    expect(result.success).toBe(true);
    expect(String(result.data)).toContain("changed-alpha-longer");
  });

  it("caches different ranges independently", async () => {
    await writeFile(join(workspace, "memo.txt"), "alpha\nbeta\ngamma\ndelta\n", "utf8");

    await manager.execute("read_file", { path: "memo.txt", offset: 1, limit: 2 });
    const nextRange = await manager.execute("read_file", { path: "memo.txt", offset: 3, limit: 2 });

    expect(nextRange.success).toBe(true);
    expect(String(nextRange.data)).toContain("gamma");
    expect(String(nextRange.data)).not.toContain("File unchanged since previous read");
  });
});
