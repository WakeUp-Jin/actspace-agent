import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BriefsIndexManager } from "../index-manager";

let root: string;
let briefsDir: string;
let manager: BriefsIndexManager;

async function writeBrief(id: string, fm: Record<string, string | number | null>, body = "body"): Promise<void> {
  const tasksDir = join(briefsDir, "tasks");
  await mkdir(tasksDir, { recursive: true });
  const lines = ["---", `id: ${id}`, ...Object.entries(fm).map(([k, v]) => `${k}: ${v === null ? "null" : v}`), "---", "", body];
  await writeFile(join(tasksDir, `${id}.md`), lines.join("\n"), "utf8");
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "kairos-briefs-"));
  briefsDir = join(root, "briefs");
  manager = new BriefsIndexManager(briefsDir);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("BriefsIndexManager", () => {
  it("rebuildFromDisk creates index.json with one entry per .md", async () => {
    await writeBrief("alpha", { status: "active", intervalSec: 60, priority: "high" });
    await writeBrief("beta", { status: "paused", intervalSec: 120, priority: "low" });
    await manager.rebuildFromDisk();
    const entries = await manager.list();
    expect(entries.map((e) => e.id).sort()).toEqual(["alpha", "beta"]);
    const indexRaw = await readFile(join(briefsDir, "index.json"), "utf8");
    expect(indexRaw).toContain("\"id\": \"alpha\"");
  });

  it("markRun(active, ok) updates lastRun + nextRun based on intervalSec", async () => {
    await writeBrief("alpha", { status: "active", intervalSec: 60, priority: "high" });
    await manager.rebuildFromDisk();
    const now = new Date("2026-05-27T10:00:00.000Z");
    await manager.markRun("alpha", "ok", now);
    const entries = await manager.list();
    const alpha = entries.find((e) => e.id === "alpha")!;
    expect(alpha.frontmatter.lastRun).toBe(now.toISOString());
    expect(alpha.frontmatter.nextRun).toBe(new Date(now.getTime() + 60_000).toISOString());
  });

  it("markRun(failed) flips status and clears nextRun", async () => {
    await writeBrief("alpha", { status: "active", intervalSec: 60, priority: "high" });
    await manager.rebuildFromDisk();
    await manager.markRun("alpha", "failed", new Date("2026-05-27T10:00:00.000Z"));
    const entries = await manager.list();
    const alpha = entries.find((e) => e.id === "alpha")!;
    expect(alpha.frontmatter.status).toBe("failed");
    expect(alpha.frontmatter.nextRun).toBeNull();
  });

  it("captures broken brief as status=failed instead of throwing", async () => {
    const tasksDir = join(briefsDir, "tasks");
    await mkdir(tasksDir, { recursive: true });
    await writeFile(join(tasksDir, "bad.md"), "---\nid: WRONG\n---\nbody", "utf8");
    const idx = await manager.rebuildFromDisk();
    const bad = idx.entries.find((e) => e.id === "bad");
    expect(bad?.frontmatter.status).toBe("failed");
  });
});
