import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BriefsIndexManager } from "../index-manager";
import { BriefsDispatcher } from "../dispatcher";

let root: string;
let briefsDir: string;
let manager: BriefsIndexManager;
let dispatcher: BriefsDispatcher;

async function writeBrief(id: string, fm: Record<string, string | number | null>, body = "todo"): Promise<void> {
  const tasksDir = join(briefsDir, "tasks");
  await mkdir(tasksDir, { recursive: true });
  const lines = ["---", `id: ${id}`, ...Object.entries(fm).map(([k, v]) => `${k}: ${v === null ? "null" : v}`), "---", "", body];
  await writeFile(join(tasksDir, `${id}.md`), lines.join("\n"), "utf8");
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "kairos-disp-"));
  briefsDir = join(root, "briefs");
  manager = new BriefsIndexManager(briefsDir);
  dispatcher = new BriefsDispatcher(manager);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("BriefsDispatcher.pickNext", () => {
  it("returns auto tick when no briefs are active", async () => {
    const res = await dispatcher.pickNext(new Date("2026-05-27T10:00:00.000Z"));
    expect(res.trigger).toBe("auto");
    if (res.trigger === "auto") expect(res.content).toMatch(/^<tick>2026-05-27/);
  });

  it("returns brief content when one is due", async () => {
    await writeBrief("alpha", {
      status: "active",
      trigger: "interval",
      intervalSec: 60,
      priority: "normal",
      created: "2026-05-27T09:00:00.000Z",
      lastRun: "null",
      nextRun: "2026-05-27T09:00:00.000Z",
    }, "Run alpha summary");
    await manager.rebuildFromDisk();
    const res = await dispatcher.pickNext(new Date("2026-05-27T10:00:00.000Z"));
    expect(res.trigger).toBe("brief");
    if (res.trigger === "brief") {
      expect(res.briefId).toBe("alpha");
      expect(res.content).toContain("Run alpha summary");
    }
  });

  it("picks high priority before normal", async () => {
    await writeBrief("alpha", {
      status: "active", trigger: "interval", intervalSec: 60,
      priority: "normal", created: "2026-05-27T09:00:00.000Z",
      lastRun: "null", nextRun: "2026-05-27T09:00:00.000Z",
    });
    await writeBrief("beta", {
      status: "active", trigger: "interval", intervalSec: 60,
      priority: "high", created: "2026-05-27T09:00:00.000Z",
      lastRun: "null", nextRun: "2026-05-27T09:01:00.000Z",
    });
    await manager.rebuildFromDisk();
    const res = await dispatcher.pickNext(new Date("2026-05-27T10:00:00.000Z"));
    expect(res.trigger).toBe("brief");
    if (res.trigger === "brief") expect(res.briefId).toBe("beta");
  });

  it("treats new interval brief without nextRun as due immediately", async () => {
    await writeBrief("gamma", {
      status: "active", trigger: "interval", intervalSec: 60,
      priority: "normal", created: "2026-05-27T09:00:00.000Z",
      lastRun: "null", nextRun: "null",
    });
    await manager.rebuildFromDisk();
    const res = await dispatcher.pickNext(new Date("2026-05-27T10:00:00.000Z"));
    expect(res.trigger).toBe("brief");
    if (res.trigger === "brief") expect(res.briefId).toBe("gamma");
  });

  it("skips brief whose nextRun is in the future", async () => {
    await writeBrief("delta", {
      status: "active", trigger: "interval", intervalSec: 60,
      priority: "normal", created: "2026-05-27T09:00:00.000Z",
      lastRun: "null", nextRun: "2999-01-01T00:00:00.000Z",
    });
    await manager.rebuildFromDisk();
    const res = await dispatcher.pickNext(new Date("2026-05-27T10:00:00.000Z"));
    expect(res.trigger).toBe("auto");
  });
});
