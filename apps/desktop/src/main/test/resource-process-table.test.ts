import { describe, expect, it } from "vitest";
import {
  buildGroups,
  CpuDeltaTracker,
  descendantsOf,
  mergeByName,
  parsePsOutput,
  parsePsTime,
} from "../resource-monitor/process-table";

describe("parsePsTime", () => {
  it("reads macOS mm:ss.cc with minutes above 59", () => {
    expect(parsePsTime("0:01.50")).toBeCloseTo(1.5);
    expect(parsePsTime("201:36.72")).toBeCloseTo(201 * 60 + 36.72);
  });

  it("reads Linux [DD-]HH:MM:SS", () => {
    expect(parsePsTime("01:02:03")).toBe(3723);
    expect(parsePsTime("2-00:00:01")).toBe(2 * 86400 + 1);
  });

  it("rejects malformed values", () => {
    expect(parsePsTime("abc")).toBeNull();
    expect(parsePsTime("12")).toBeNull();
  });
});

describe("parsePsOutput", () => {
  it("parses rows, keeps only the executable name and skips junk", () => {
    const rows = parsePsOutput(
      [
        "    1     0   8224 201:36.72 /sbin/launchd",
        "  500     1  12480   0:01.00 /Applications/My App.app/Contents/MacOS/My App",
        "garbage line",
        "",
      ].join("\n"),
    );
    expect(rows).toEqual([
      { pid: 1, ppid: 0, rssKiB: 8224, cpuSeconds: expect.closeTo(12096.72, 2), name: "launchd" },
      { pid: 500, ppid: 1, rssKiB: 12480, cpuSeconds: 1, name: "My App" },
    ]);
  });
});

describe("descendantsOf", () => {
  const row = (pid: number, ppid: number, name = "x") => ({ pid, ppid, rssKiB: 1, cpuSeconds: 0, name });

  it("walks every generation and stops at skipped subtrees", () => {
    const rows = [row(1, 0), row(10, 1), row(11, 10), row(12, 11), row(20, 10), row(30, 1), row(31, 30), row(99, 2)];
    expect(
      descendantsOf(rows, 10, new Set([20]))
        .map((r) => r.pid)
        .sort(),
    ).toEqual([11, 12]);
    expect(
      descendantsOf(rows, 1, new Set([30]))
        .map((r) => r.pid)
        .sort(),
    ).toEqual([10, 11, 12, 20]);
  });

  it("survives ppid cycles", () => {
    expect(descendantsOf([row(2, 3), row(3, 2), row(4, 1)], 2).map((r) => r.pid)).toEqual([3]);
  });
});

describe("CpuDeltaTracker", () => {
  it("returns single-core percent from cumulative seconds", () => {
    const tracker = new CpuDeltaTracker();
    expect(tracker.percent(1, 10, 0)).toBeNull();
    tracker.commit();
    // 2 s 内用了 1 s CPU = 单核 50%。
    expect(tracker.percent(1, 11, 2000)).toBeCloseTo(50);
    tracker.commit();
    // 多线程可以超过 100%。
    expect(tracker.percent(1, 14, 4000)).toBeCloseTo(150);
  });

  it("forgets pids that disappeared and treats pid reuse as unknown", () => {
    const tracker = new CpuDeltaTracker();
    tracker.percent(1, 10, 0);
    tracker.percent(2, 10, 0);
    tracker.commit();
    tracker.percent(1, 11, 2000);
    tracker.commit();
    expect(tracker.percent(2, 12, 4000)).toBeNull();
    tracker.commit();
    expect(tracker.percent(2, 1, 6000)).toBeNull();
  });
});

describe("grouping", () => {
  it("merges agent processes by name and counts them", () => {
    expect(
      mergeByName([
        { pid: 5, label: "node", count: 1, cpuPercent: 2, rssKiB: 100 },
        { pid: 6, label: "node", count: 1, cpuPercent: null, rssKiB: 300 },
        { pid: 7, label: "python3", count: 1, cpuPercent: null, rssKiB: 50 },
      ]),
    ).toEqual([
      { pid: 5, label: "node", count: 2, cpuPercent: 2, rssKiB: 400 },
      { pid: 7, label: "python3", count: 1, cpuPercent: null, rssKiB: 50 },
    ]);
  });

  it("puts electron processes in fixed groups and the float renderer in monitor", () => {
    const groups = buildGroups({
      electron: [
        { pid: 1, type: "Browser", cpuPercent: 10, rssKiB: 100 },
        { pid: 2, type: "Tab", cpuPercent: 5, rssKiB: 200 },
        { pid: 3, type: "Tab", cpuPercent: 1, rssKiB: 40 },
        { pid: 4, type: "GPU", cpuPercent: 3, rssKiB: 50 },
        { pid: 5, type: "Utility", name: "Network Service", cpuPercent: null, rssKiB: 20 },
      ],
      monitorPids: new Set([3]),
      agent: [],
      monitorChildren: [],
    });
    expect(groups.map((group) => [group.id, group.cpuPercent, group.rssKiB])).toEqual([
      ["main", 10, 100],
      ["renderer", 5, 200],
      ["gpu", 3, 50],
      ["utility", 0, 20],
      ["agent", 0, 0],
      ["monitor", 1, 40],
    ]);
    expect(groups[3]!.processes[0]!.label).toBe("Network Service");
    expect(groups[5]!.processes[0]!.label).toBe("悬浮窗");
  });
});
