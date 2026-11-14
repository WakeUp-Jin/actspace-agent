import { describe, expect, it, vi } from "vitest";
import { RESOURCE_HISTORY_LENGTH } from "@actspace/shared";
import {
  ResourceCollector,
  type AppMetricLike,
  type ResourceCollectorDeps,
} from "../resource-monitor/resource-collector";

function harness(overrides: Partial<ResourceCollectorDeps> = {}) {
  let now = 0;
  let cpuClock = 0;
  let cpuStep = 0;
  let tick: (() => void) | null = null;
  const timers = { set: 0, cleared: 0 };
  const histogram = {
    max: 0,
    enable: vi.fn(),
    disable: vi.fn(),
    reset: vi.fn(() => {
      histogram.max = 0;
    }),
  };
  let cumulative = { main: 1, tab: 1, float: 0 };
  const metrics = (): AppMetricLike[] => [
    { pid: 100, type: "Browser", cpu: { cumulativeCPUUsage: cumulative.main }, memory: { workingSetSize: 1000 } },
    { pid: 200, type: "Tab", cpu: { cumulativeCPUUsage: cumulative.tab }, memory: { workingSetSize: 2000 } },
    { pid: 300, type: "Tab", cpu: { cumulativeCPUUsage: cumulative.float }, memory: { workingSetSize: 50 } },
  ];
  const getAppMetrics = vi.fn(metrics);
  const runPs = vi.fn(() => ({
    pid: 999,
    output: Promise.resolve(
      [
        "100 1 1000 0:10.00 /Applications/ActSpace.app/Contents/MacOS/ActSpace",
        "200 100 2000 0:01.00 /x/ActSpace Helper (Renderer)",
        "400 100 500 0:00.50 /usr/local/bin/node",
        "401 400 300 0:00.10 /usr/bin/python3",
        "999 100 900 0:00.02 /bin/ps",
      ].join("\n"),
    ),
  }));
  const createHistogram = vi.fn(() => histogram);
  const collector = new ResourceCollector({
    getAppMetrics,
    createHistogram,
    runPs,
    mainPid: 100,
    monitorPids: () => new Set([300]),
    now: () => now,
    // 每读一次前进 cpuStep，等于每次采样（读两次）花掉 cpuStep 毫秒。
    cpuClock: () => (cpuClock += cpuStep),
    setInterval: (callback) => {
      timers.set++;
      tick = callback;
      return "timer";
    },
    clearInterval: () => {
      timers.cleared++;
      tick = null;
    },
    ...overrides,
  });
  return {
    collector,
    histogram,
    timers,
    getAppMetrics,
    runPs,
    createHistogram,
    advance(ms: number, next: Partial<typeof cumulative>) {
      now += ms;
      cumulative = { ...cumulative, ...next };
      tick?.();
    },
    setSampleCost(ms: number) {
      cpuStep = ms;
    },
    get ticking() {
      return tick !== null;
    },
  };
}

describe("ResourceCollector", () => {
  it("does nothing until someone subscribes and releases everything after the last one leaves", async () => {
    const h = harness();
    expect(h.createHistogram).not.toHaveBeenCalled();
    expect(h.getAppMetrics).not.toHaveBeenCalled();
    expect(h.runPs).not.toHaveBeenCalled();
    const offA = h.collector.subscribe(() => {});
    const offB = h.collector.subscribe(() => {});
    expect(h.timers.set).toBe(1);
    expect(h.histogram.enable).toHaveBeenCalledTimes(1);
    offA();
    offA();
    expect(h.collector.active).toBe(true);
    offB();
    expect(h.collector.active).toBe(false);
    expect(h.timers.cleared).toBe(1);
    expect(h.histogram.disable).toHaveBeenCalledTimes(1);
    expect(h.ticking).toBe(false);
    expect(h.collector.state()).toEqual({ history: [], latest: null });
    await Promise.resolve();
  });

  it("reports single-core CPU, RSS totals without the monitor group, and main thread delay", async () => {
    const h = harness();
    const samples: number[] = [];
    h.collector.subscribe((sample) => samples.push(sample.cpuPercent));
    await new Promise((resolve) => setTimeout(resolve, 0));
    h.histogram.max = 170e6;
    h.advance(2000, { main: 2, tab: 1.5, float: 0.2 });
    const latest = h.collector.state().latest!;
    expect(latest.mainCpuPercent).toBeCloseTo(50);
    // 主进程 50 + 界面 25；悬浮窗 10 不计入。
    expect(latest.cpuPercent).toBeCloseTo(75);
    expect(latest.rssKiB).toBe(1000 + 2000 + 500 + 300);
    expect(latest.mainThreadDelayMs).toBe(150);
    expect(h.histogram.reset).toHaveBeenCalled();
    const agent = latest.groups.find((group) => group.id === "agent")!;
    expect(agent.processes.map((row) => [row.label, row.count])).toEqual([
      ["node", 1],
      ["python3", 1],
    ]);
    const monitor = latest.groups.find((group) => group.id === "monitor")!;
    expect(monitor.processes.map((row) => row.label)).toEqual(["悬浮窗", "采集器", "ps"]);
    expect(samples).toHaveLength(1);
  });

  it("moves the collector's own main-thread time from the main row to the monitor row", () => {
    const h = harness({ runPs: null });
    h.collector.subscribe(() => {});
    h.setSampleCost(10);
    h.advance(2000, { main: 2 });
    expect(h.collector.state().latest!.mainCpuPercent).toBeCloseTo(50);
    // 上一轮采样花了 10 ms / 2 s = 0.5%，从主进程挪到「采集器」。
    h.advance(2000, { main: 3 });
    const latest = h.collector.state().latest!;
    expect(latest.mainCpuPercent).toBeCloseTo(49.5);
    const collectorRow = latest.groups
      .find((group) => group.id === "monitor")!
      .processes.find((row) => row.label === "采集器")!;
    expect(collectorRow.cpuPercent).toBeCloseTo(0.5);
  });

  it("keeps at most five minutes of history", () => {
    const h = harness({ runPs: null });
    h.collector.subscribe(() => {});
    for (let i = 1; i <= RESOURCE_HISTORY_LENGTH + 5; i++) h.advance(2000, { main: 1 + i * 0.01 });
    const { history } = h.collector.state();
    expect(history).toHaveLength(RESOURCE_HISTORY_LENGTH);
    expect(history.at(-1)!.at).toBe((RESOURCE_HISTORY_LENGTH + 5) * 2000);
  });

  it("does not queue ps scans while one is still running", () => {
    let release: (value: string) => void = () => {};
    const runPs = vi.fn(() => ({
      pid: 1,
      output: new Promise<string>((resolve) => {
        release = resolve;
      }),
    }));
    const h = harness({ runPs });
    h.collector.subscribe(() => {});
    for (let i = 0; i < 9; i++) h.advance(2000, {});
    expect(runPs).toHaveBeenCalledTimes(1);
    release("");
  });

  it("marks agent processes unavailable when ps is not supported", () => {
    const h = harness({ runPs: null });
    h.collector.subscribe(() => {});
    h.advance(2000, {});
    expect(h.collector.state().latest!.agentProcessesAvailable).toBe(false);
  });
});
