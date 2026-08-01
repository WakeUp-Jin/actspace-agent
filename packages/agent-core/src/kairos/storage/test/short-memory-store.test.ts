import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SessionEvent } from "@actspace/shared";
import { ShortMemoryStore } from "../short-memory-store";

let rootDir: string;

beforeEach(async () => {
  rootDir = await mkdtemp(join(tmpdir(), "kairos-store-"));
});

afterEach(async () => {
  await rm(rootDir, { recursive: true, force: true });
});

const evt = (type: SessionEvent["type"], payload: unknown, id = "ev-1", agentRunId = "t-1"): SessionEvent => ({
  id,
  sessionId: "s",
  agentRunId,
  type,
  timestamp: "2026-05-27T00:00:00.000Z",
  payload,
});

describe("ShortMemoryStore", () => {
  it("creates monthly folder and writes plain segment on first append", async () => {
    const store = new ShortMemoryStore(rootDir);
    await store.appendEvent(evt("user_message", { content: "hi" }), new Date("2026-05-27T10:00:00Z"));
    const events = await store.loadDaily("2026-05-27");
    expect(events).toHaveLength(1);
    expect((events[0].payload as { content: string }).content).toBe("hi");
  });

  it("rotateDaily creates _001 segment and loadDailyAll returns both", async () => {
    const store = new ShortMemoryStore(rootDir);
    const day = new Date("2026-05-27T10:00:00Z");
    await store.appendEvent(evt("user_message", { content: "first" }, "ev-A"), day);
    await store.rotateDaily(day);
    await store.appendEvent(evt("user_message", { content: "second" }, "ev-B"), day);

    const latest = await store.loadDaily("2026-05-27");
    expect(latest).toHaveLength(1);
    expect((latest[0] as SessionEvent).id).toBe("ev-B");

    const all = await store.loadDailyAll("2026-05-27");
    expect(all.map((e) => e.id)).toEqual(["ev-A", "ev-B"]);
  });

  it("skips malformed lines on load instead of throwing", async () => {
    const { appendFile } = await import("node:fs/promises");
    const store = new ShortMemoryStore(rootDir);
    const day = new Date("2026-05-27T10:00:00Z");
    await store.appendEvent(evt("user_message", { content: "ok" }, "ev-good"), day);
    const segPath = (await store.listDailySegments("2026-05-27"))[0];
    await appendFile(segPath, "{not-json}\n", "utf8");                 // 损坏行
    await store.appendEvent(evt("user_message", { content: "ok2" }, "ev-good2"), day);
    const events = await store.loadDaily("2026-05-27");
    expect(events.map((e) => e.id)).toEqual(["ev-good", "ev-good2"]);  // 坏行被静默跳过
  });

  it("saveSummary + listSummaries roundtrip", async () => {
    const store = new ShortMemoryStore(rootDir);
    const monthDir = store.getMonthDir("2026-05-27");
    await mkdir(monthDir, { recursive: true });
    await store.saveSummary(monthDir, "week_05-20_to_05-26.summary.md", "# summary\nbody");
    const summaries = await store.listSummaries(monthDir);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].label).toBe("week_05-20_to_05-26");
    expect(await store.readSummary(summaries[0].path)).toContain("# summary");
  });

  it("isCoveredBySummary respects week range and month label", async () => {
    const store = new ShortMemoryStore(rootDir);
    const monthDir = store.getMonthDir("2026-05-22");
    await mkdir(monthDir, { recursive: true });
    await store.saveSummary(monthDir, "week_05-20_to_05-26.summary.md", "x");
    await store.saveSummary(monthDir, "month_2026-04.summary.md", "y");
    const summaries = await store.listSummaries(monthDir);
    expect(store.isCoveredBySummary("2026-05-22", summaries)).toBe(true);
    expect(store.isCoveredBySummary("2026-05-27", summaries)).toBe(false);
    expect(store.isCoveredBySummary("2026-04-15", summaries)).toBe(true);
  });

  it("listAllDates returns descending order across months", async () => {
    const store = new ShortMemoryStore(rootDir);
    await store.appendEvent(evt("user_message", {}), new Date("2026-04-30T00:00:00Z"));
    await store.appendEvent(evt("user_message", {}), new Date("2026-05-01T00:00:00Z"));
    await store.appendEvent(evt("user_message", {}), new Date("2026-05-27T00:00:00Z"));
    const dates = await store.listAllDates();
    expect(dates).toEqual(["2026-05-27", "2026-05-01", "2026-04-30"]);
  });

  it("loadAll flattens every segment across all months in chronological order", async () => {
    const store = new ShortMemoryStore(rootDir);
    const april = new Date("2026-04-30T00:00:00Z");
    const mayDay1 = new Date("2026-05-01T00:00:00Z");
    const mayDay27 = new Date("2026-05-27T00:00:00Z");

    await store.appendEvent(evt("user_message", { content: "april" }, "ev-april"), april);
    await store.appendEvent(evt("user_message", { content: "may1" }, "ev-may1"), mayDay1);
    await store.appendEvent(evt("user_message", { content: "may27a" }, "ev-may27a"), mayDay27);
    // 模拟 reset_today 之后在同一日的下一段。
    await store.rotateDaily(mayDay27);
    await store.appendEvent(evt("user_message", { content: "may27b" }, "ev-may27b"), mayDay27);

    const events = await store.loadAll();
    expect(events.map((e) => e.id)).toEqual([
      "ev-april",
      "ev-may1",
      "ev-may27a",
      "ev-may27b",
    ]);
  });

  it("loadAll returns empty array when root dir has no segments", async () => {
    const store = new ShortMemoryStore(rootDir);
    expect(await store.loadAll()).toEqual([]);
  });
});
