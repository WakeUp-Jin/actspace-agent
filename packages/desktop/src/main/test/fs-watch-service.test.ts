// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  FS_WATCH_DEFAULT_EXCLUDES,
  MAX_RESTARTS_IN_WINDOW,
  RESTART_BACKOFF_MS,
  RESTART_WINDOW_MS,
  defaultFsWatchConfig,
  isHeartbeatFresh,
  normalizeFsWatchConfig,
  pruneRestartWindow,
  restartDelayMs,
} from "../plugins/fs-watch-service";

describe("isHeartbeatFresh", () => {
  const now = new Date("2026-07-03T12:00:00.000Z");

  it("treats heartbeats younger than 90s as fresh", () => {
    expect(isHeartbeatFresh("2026-07-03T11:59:00.000Z", now)).toBe(true);
    expect(isHeartbeatFresh("2026-07-03T11:58:31.000Z", now)).toBe(true);
  });

  it("treats heartbeats at/after 90s as stale", () => {
    expect(isHeartbeatFresh("2026-07-03T11:58:30.000Z", now)).toBe(false);
    expect(isHeartbeatFresh("2026-07-03T10:00:00.000Z", now)).toBe(false);
  });

  it("rejects missing or unparsable timestamps", () => {
    expect(isHeartbeatFresh(undefined, now)).toBe(false);
    expect(isHeartbeatFresh("not-a-date", now)).toBe(false);
  });
});

describe("restart backoff", () => {
  it("follows the exponential sequence and stops after it runs out", () => {
    expect(RESTART_BACKOFF_MS).toEqual([5_000, 15_000, 45_000, 135_000, 405_000]);
    RESTART_BACKOFF_MS.forEach((delay, index) => {
      expect(restartDelayMs(index)).toBe(delay);
    });
    expect(restartDelayMs(RESTART_BACKOFF_MS.length)).toBeUndefined();
  });

  it("prunes restart timestamps outside the 10-minute window", () => {
    const now = 1_000_000_000;
    const inside = now - RESTART_WINDOW_MS + 1;
    const outside = now - RESTART_WINDOW_MS;
    expect(pruneRestartWindow([outside, inside, now], now)).toEqual([inside, now]);
    expect(MAX_RESTARTS_IN_WINDOW).toBe(5);
  });
});

describe("fs-watch config", () => {
  const outDir = "/data/skills/fs-watch/references/watch-log";

  it("seeds defaults with the provided watch root and contract values", () => {
    const config = defaultFsWatchConfig(outDir, "/home/user/workspace");
    expect(config).toEqual({
      version: 1,
      roots: [{ path: "/home/user/workspace" }],
      outDir,
      excludeNames: FS_WATCH_DEFAULT_EXCLUDES,
      excludeHidden: true,
      debounceMs: 500,
      retentionDays: 14,
    });
    expect(defaultFsWatchConfig(outDir, undefined).roots).toEqual([]);
  });

  it("always overrides outDir even when the raw config points elsewhere", () => {
    const normalized = normalizeFsWatchConfig(
      { version: 1, roots: [{ path: "/a" }], outDir: "/somewhere/else" },
      outDir,
      undefined,
    );
    expect(normalized.outDir).toBe(outDir);
    expect(normalized.roots).toEqual([{ path: "/a" }]);
  });

  it("drops malformed roots entries and falls back on invalid numbers", () => {
    const normalized = normalizeFsWatchConfig(
      {
        roots: [{ path: "/ok" }, { path: "" }, "junk", { nope: true }],
        debounceMs: -5,
        retentionDays: 9_999,
        excludeHidden: "yes",
      },
      outDir,
      "/fallback",
    );
    expect(normalized.roots).toEqual([{ path: "/ok" }]);
    expect(normalized.debounceMs).toBe(500);
    expect(normalized.retentionDays).toBe(14);
    expect(normalized.excludeHidden).toBe(true);
  });

  it("returns full defaults for non-object raw input", () => {
    expect(normalizeFsWatchConfig(undefined, outDir, "/root")).toEqual(
      defaultFsWatchConfig(outDir, "/root"),
    );
  });
});
