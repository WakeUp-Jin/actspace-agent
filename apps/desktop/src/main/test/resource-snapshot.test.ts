import { describe, expect, it } from "vitest";
import type { ResourceSample } from "@actspace/shared";
import { parseFloatWindowState, resolveFloatPosition } from "../resource-monitor/float-bounds";
import { formatResourceSnapshot, parseFootprint } from "../resource-monitor/snapshot-text";

const sample: ResourceSample = {
  sampledAt: Date.UTC(2026, 10, 11, 12, 0, 0),
  cpuPercent: 12.5,
  rssKiB: 640 * 1024,
  mainCpuPercent: 8,
  mainThreadDelayMs: 3.4,
  agentProcessesAvailable: true,
  groups: [
    {
      id: "main",
      cpuPercent: 8,
      rssKiB: 200 * 1024,
      processes: [{ pid: 10, label: "主进程", count: 1, cpuPercent: 8, rssKiB: 200 * 1024 }],
    },
    {
      id: "agent",
      cpuPercent: 4.5,
      rssKiB: 440 * 1024,
      processes: [{ pid: 20, label: "node", count: 2, cpuPercent: null, rssKiB: 440 * 1024 }],
    },
    {
      id: "monitor",
      cpuPercent: 0.2,
      rssKiB: 0,
      processes: [{ pid: 10, label: "采集器", count: 1, cpuPercent: 0.2, rssKiB: 0 }],
    },
  ],
};

describe("snapshot text", () => {
  it("parses footprint headers", () => {
    const stdout =
      "======\nFinder [661]: 64-bit    Footprint: 187 MB (16384 bytes per page)\n======\nActSpace [10]: 64-bit    Footprint: 1.2 GB (16384 bytes per page)\n";
    expect([...parseFootprint(stdout)]).toEqual([
      [661, "187 MB"],
      [10, "1.2 GB"],
    ]);
  });

  it("lists totals, groups and processes with footprint when available", () => {
    const text = formatResourceSnapshot({
      sample,
      platform: "darwin arm64",
      cores: 10,
      appVersion: "0.1.0",
      footprint: new Map([[10, "166 MB"]]),
    });
    expect(text).toContain("2026-11-11T12:00:00.000Z");
    expect(text).toContain("合计 CPU 13% · 内存 640 MB · 主线程延迟 3 ms");
    expect(text).toContain("  主进程  pid 10  CPU 8.0% · RSS 200 MB · footprint 166 MB");
    expect(text).toContain("  node ×2  pid 20  CPU — · RSS 440 MB");
    expect(text).toContain("监控自身（不计入合计）");
  });

  it("still produces text when footprint fails", () => {
    const text = formatResourceSnapshot({
      sample,
      platform: "darwin arm64",
      cores: 10,
      appVersion: "0.1.0",
      footprint: new Error("timeout"),
    });
    expect(text).toContain("footprint 读取失败：timeout");
  });
});

describe("float window position", () => {
  const primary = { x: 0, y: 25, width: 1440, height: 875 };
  it("parses only well-formed saved state", () => {
    expect(parseFloatWindowState('{"x":10.4,"y":20,"expanded":true}')).toEqual({ x: 10, y: 20, expanded: true });
    expect(parseFloatWindowState('{"x":"10","y":20}')).toBeNull();
    expect(parseFloatWindowState("nope")).toBeNull();
  });

  it("keeps a saved position on a connected screen and falls back to the primary top-right", () => {
    expect(resolveFloatPosition({ x: 100, y: 100 }, 290, [primary], primary)).toEqual({ x: 100, y: 100 });
    expect(resolveFloatPosition({ x: 3000, y: 100 }, 290, [primary], primary)).toEqual({
      x: 1440 - 290 - 16,
      y: 25 + 16,
    });
    expect(resolveFloatPosition(null, 290, [primary], primary)).toEqual({ x: 1134, y: 41 });
  });
});
