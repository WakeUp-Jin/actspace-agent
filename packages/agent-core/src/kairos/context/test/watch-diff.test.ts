import { mkdir, mkdtemp, rm, unlink, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WatchDiffEngine, type WatchManifest } from "../watch-diff";

let root: string;
let watchPath: string;
let manifestDir: string;
let engine: WatchDiffEngine;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "kairos-diff-"));
  watchPath = join(root, "watch");
  manifestDir = join(root, "manifests");
  await mkdir(watchPath, { recursive: true });
  engine = new WatchDiffEngine(manifestDir);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("WatchDiffEngine", () => {
  it("first scan: all entries appear as added", async () => {
    await writeFile(join(watchPath, "a.md"), "x", "utf8");
    await writeFile(join(watchPath, "b.md"), "x", "utf8");
    const diff = await engine.diff(watchPath);
    expect(diff.totalAdded).toBe(2);
    expect(diff.removed).toEqual([]);
    expect(diff.added.map((p) => p.replace(`${watchPath}/`, ""))).toEqual(["a.md", "b.md"]);
  });

  it("no change: second scan yields empty added/removed", async () => {
    await writeFile(join(watchPath, "a.md"), "x", "utf8");
    await engine.diff(watchPath);
    const second = await engine.diff(watchPath);
    expect(second.totalAdded).toBe(0);
    expect(second.totalRemoved).toBe(0);
  });

  it("rename: surfaces as remove + add", async () => {
    await writeFile(join(watchPath, "x.csv"), "x", "utf8");
    await engine.diff(watchPath);
    await unlink(join(watchPath, "x.csv"));
    await writeFile(join(watchPath, "y.csv"), "x", "utf8");
    const diff = await engine.diff(watchPath);
    expect(diff.totalRemoved).toBe(1);
    expect(diff.totalAdded).toBe(1);
    expect(diff.removed[0]).toContain("x.csv");
    expect(diff.added[0]).toContain("y.csv");
  });

  it("truncates added list when over 50 items", async () => {
    for (let i = 0; i < 60; i++) {
      await writeFile(join(watchPath, `f-${String(i).padStart(3, "0")}.txt`), "x", "utf8");
    }
    const diff = await engine.diff(watchPath);
    expect(diff.totalAdded).toBe(60);
    expect(diff.added.length).toBe(50);
    expect(diff.truncated).toBe(true);
  });

  it("writes manifest atomically with sha1-prefix filename", async () => {
    await writeFile(join(watchPath, "a.md"), "x", "utf8");
    await engine.diff(watchPath);
    const manifestPath = engine.manifestPath(watchPath);
    expect(manifestPath).toMatch(/[0-9a-f]{12}\.json$/);
    const parsed = JSON.parse(await readFile(manifestPath, "utf8")) as WatchManifest;
    expect(parsed.path).toBe(watchPath);
    expect(parsed.entries).toEqual(["a.md"]);
  });
});
