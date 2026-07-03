import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TaskOutputMonitor } from "../tools/bash/output-monitor";

describe("TaskOutputMonitor output subscription", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function createAttached(subscription: { pattern: string; reason: string; debounceMs?: number }) {
    const monitor = new TaskOutputMonitor({
      subscription: { debounceMs: 5_000, ...subscription },
      stallTimeoutMs: 45_000,
    });
    const matches: string[] = [];
    const stalls: string[] = [];
    let recovered = 0;
    monitor.attach({
      onOutputMatch: (line) => matches.push(line),
      onStall: (tail) => stalls.push(tail),
      onStallRecovered: () => recovered++,
    });
    return { monitor, matches, stalls, getRecovered: () => recovered };
  }

  it("notifies when a completed line matches the pattern", () => {
    const { monitor, matches } = createAttached({ pattern: "ready on", reason: "dev server ready" });

    monitor.handleChunk("compiling...\nserver ready");
    expect(matches).toHaveLength(0); // "server ready" 行未完成（无换行）

    monitor.handleChunk(" on :5173\n");
    expect(matches).toEqual(["server ready on :5173"]);
  });

  it("debounces repeated matches within the window", () => {
    const { monitor, matches } = createAttached({ pattern: "hit", reason: "watch" });

    monitor.handleChunk("hit 1\nhit 2\nhit 3\n");
    expect(matches).toHaveLength(1);

    vi.advanceTimersByTime(5_001);
    monitor.handleChunk("hit 4\n");
    expect(matches).toHaveLength(2);
  });

  it("flushes pre-attach matches on attach (command backgrounds after output appeared)", () => {
    const monitor = new TaskOutputMonitor({
      subscription: { pattern: "ready", reason: "dev server ready", debounceMs: 5_000 },
    });
    monitor.handleChunk("server ready on :5173\n");

    const matches: string[] = [];
    monitor.attach({ onOutputMatch: (line) => matches.push(line), onStall: () => {} });
    expect(matches).toEqual(["server ready on :5173"]);
  });

  it("stops notifying after dispose", () => {
    const { monitor, matches } = createAttached({ pattern: "x", reason: "r" });
    monitor.dispose();
    monitor.handleChunk("x\n");
    expect(matches).toHaveLength(0);
  });
});

describe("TaskOutputMonitor stall watchdog", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function createAttached(stallTimeoutMs = 45_000) {
    const monitor = new TaskOutputMonitor({ stallTimeoutMs });
    const stalls: string[] = [];
    let recovered = 0;
    monitor.attach({
      onOutputMatch: () => {},
      onStall: (tail) => stalls.push(tail),
      onStallRecovered: () => recovered++,
    });
    return { monitor, stalls, getRecovered: () => recovered };
  }

  it("fires when output stalls on an interactive prompt tail", () => {
    const { monitor, stalls } = createAttached();

    monitor.handleChunk("installing...\nContinue? (y/n) ");
    vi.advanceTimersByTime(45_001);

    expect(stalls).toEqual(["Continue? (y/n)"]);
  });

  it("does not fire for slow commands whose tail is a normal log line", () => {
    const { monitor, stalls } = createAttached();

    monitor.handleChunk("building module 3 of 200\n");
    vi.advanceTimersByTime(120_000);

    expect(stalls).toHaveLength(0);
  });

  it("resets the timer on new output and recovers after a stall", () => {
    const { monitor, stalls, getRecovered } = createAttached();

    monitor.handleChunk("Are you sure? [y/N] ");
    vi.advanceTimersByTime(30_000);
    // 30s 时来了新输出 → 重置，不触发
    monitor.handleChunk("auto-confirmed\n");
    vi.advanceTimersByTime(30_000);
    expect(stalls).toHaveLength(0);

    // 再次停滞在提问上 → 触发
    monitor.handleChunk("Password: ");
    vi.advanceTimersByTime(45_001);
    expect(stalls).toHaveLength(1);

    // 输出恢复 → recovered 回调
    monitor.handleChunk("login ok\n");
    expect(getRecovered()).toBe(1);
  });

  it("only checks once per silence period (no repeated stall notifications)", () => {
    const { monitor, stalls } = createAttached();

    monitor.handleChunk("Continue? (y/n) ");
    vi.advanceTimersByTime(45_001);
    expect(stalls).toHaveLength(1);

    // 继续静默不重复报
    vi.advanceTimersByTime(300_000);
    expect(stalls).toHaveLength(1);
  });
});
