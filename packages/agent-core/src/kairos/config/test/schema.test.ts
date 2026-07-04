import { describe, expect, it } from "vitest";
import {
  DEFAULT_BLOCKLIST,
  DEFAULT_PATHS_CONFIG,
  DEFAULT_PREFERENCES,
  parseBlocklist,
  parsePathsConfig,
  parsePreferences,
} from "../schema";

describe("parsePreferences", () => {
  it("returns defaults when input is not an object", () => {
    expect(parsePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences("garbage")).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences([])).toEqual(DEFAULT_PREFERENCES);
  });

  it("keeps user overrides and falls back per-field for invalid values", () => {
    const parsed = parsePreferences({
      enabled: true,
      sleepRangeSeconds: { min: 10, max: 1200, default: "not-a-number" },
      memory: { loadBudgetRatio: 1.5, compressionThreshold: 0.9 },
    });
    expect(parsed.enabled).toBe(true);
    expect(parsed.sleepRangeSeconds.min).toBe(10);
    expect(parsed.sleepRangeSeconds.max).toBe(1200);
    expect(parsed.sleepRangeSeconds.default).toBe(DEFAULT_PREFERENCES.sleepRangeSeconds.default);
    expect(parsed.memory.loadBudgetRatio).toBe(DEFAULT_PREFERENCES.memory.loadBudgetRatio);
    expect(parsed.memory.compressionThreshold).toBe(0.9);
  });

  it("normalizes invalid sleepBias to default", () => {
    const parsed = parsePreferences({
      rhythm: { workHours: { sleepBias: "wrong" } },
    });
    expect(parsed.rhythm.workHours.sleepBias).toBe(DEFAULT_PREFERENCES.rhythm.workHours.sleepBias);
  });

  it("keeps rhythm time windows fixed while preserving sleepBias", () => {
    const parsed = parsePreferences({
      rhythm: {
        workHours: { start: "10:30", end: "16:30", sleepBias: "light" },
        quietHours: { start: "01:00", end: "05:00", sleepBias: "normal" },
      },
    });

    expect(parsed.rhythm.workHours.start).toBe(DEFAULT_PREFERENCES.rhythm.workHours.start);
    expect(parsed.rhythm.workHours.end).toBe(DEFAULT_PREFERENCES.rhythm.workHours.end);
    expect(parsed.rhythm.workHours.sleepBias).toBe("light");
    expect(parsed.rhythm.quietHours.start).toBe(DEFAULT_PREFERENCES.rhythm.quietHours.start);
    expect(parsed.rhythm.quietHours.end).toBe(DEFAULT_PREFERENCES.rhythm.quietHours.end);
    expect(parsed.rhythm.quietHours.sleepBias).toBe("normal");
  });
});

describe("parsePathsConfig", () => {
  it("returns defaults when input is not an object", () => {
    expect(parsePathsConfig("oops").paths).toEqual([]);
  });

  it("drops entries without a path and silently ignores legacy watch field", () => {
    const parsed = parsePathsConfig({
      tip: "custom tip",
      paths: [
        { path: "/A", watch: true, tip: "first" },   // legacy watch → 忽略
        { path: " ", watch: true },                  // empty after trim → drop
        { watch: false },                            // no path → drop
        { path: "/B" },
        "not-an-object",                             // not object → drop
      ],
    });
    expect(parsed.tip).toBe("custom tip");
    expect(parsed.paths).toEqual([
      { path: "/A", tip: "first" },
      { path: "/B" },
    ]);
  });
});

describe("parseBlocklist", () => {
  it("returns defaults including bash being denied", () => {
    expect(parseBlocklist(null).toolsDenied).toEqual(["bash"]);
    expect(parseBlocklist(null).maxToolCallsPerTick).toBe(10);
  });

  it("allows user to clear bash from toolsDenied by providing empty array", () => {
    const parsed = parseBlocklist({ toolsDenied: [] });
    expect(parsed.toolsDenied).toEqual([]);
  });

  it("preserves timeWindows only when from/to are both strings", () => {
    const parsed = parseBlocklist({
      timeWindows: [
        { from: "22:00", to: "07:00" },
        { from: "10:00" },
        "garbage",
      ],
    });
    expect(parsed.timeWindows).toEqual([{ from: "22:00", to: "07:00" }]);
  });

  it("keeps glob path list verbatim", () => {
    const parsed = parseBlocklist({ paths: ["**/secret/**", "*.env"] });
    expect(parsed.paths).toEqual(["**/secret/**", "*.env"]);
  });
});
