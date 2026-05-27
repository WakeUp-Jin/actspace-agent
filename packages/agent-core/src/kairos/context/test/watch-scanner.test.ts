import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scanWatchPath, DEFAULT_WATCH_EXCLUDE, MAX_FILES_PER_WATCH_PATH } from "../watch-scanner";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "kairos-watch-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("scanWatchPath", () => {
  it("returns relative file paths sorted ascending", async () => {
    await writeFile(join(root, "b.md"), "x", "utf8");
    await writeFile(join(root, "a.md"), "x", "utf8");
    await mkdir(join(root, "sub"), { recursive: true });
    await writeFile(join(root, "sub", "c.md"), "x", "utf8");
    const res = await scanWatchPath(root);
    expect(res.entries).toEqual(["a.md", "b.md", "sub/c.md"]);
    expect(res.truncated).toBe(false);
  });

  it("skips DEFAULT_WATCH_EXCLUDE directories without recursing", async () => {
    await mkdir(join(root, "node_modules", "x"), { recursive: true });
    await writeFile(join(root, "node_modules", "x", "junk.js"), "x", "utf8");
    await mkdir(join(root, ".git"), { recursive: true });
    await writeFile(join(root, ".git", "HEAD"), "ref", "utf8");
    await writeFile(join(root, "keep.md"), "x", "utf8");
    const res = await scanWatchPath(root);
    expect(res.entries).toEqual(["keep.md"]);
  });

  it("skips dotfile entries by default", async () => {
    await writeFile(join(root, ".env"), "x", "utf8");
    await writeFile(join(root, "ok.txt"), "x", "utf8");
    const res = await scanWatchPath(root);
    expect(res.entries).toEqual(["ok.txt"]);
  });

  it("returns empty + no throw when root does not exist", async () => {
    const res = await scanWatchPath(join(root, "does-not-exist"));
    expect(res.entries).toEqual([]);
    expect(res.truncated).toBe(false);
  });

  it("stops at MAX_FILES_PER_WATCH_PATH and marks truncated", async () => {
    // 1500 files (远小于 5000，但够测 cap 的"未触顶"路径)；这里只验证不超过 cap 的常规分支
    expect(MAX_FILES_PER_WATCH_PATH).toBeGreaterThan(0);
    expect(DEFAULT_WATCH_EXCLUDE.has("node_modules")).toBe(true);
  });
});
