import { describe, it, expect, vi } from "vitest";
import {
  clampSleep,
  sleepBiasAt,
  MessageQueue,
  QueueProcessor,
  type SchedulerLike,
  type WakeReason,
} from "../scheduler";
import { DEFAULT_PREFERENCES, type Preferences } from "../config/schema";
import type { KairosRunner, TickResult } from "../runner";
import type { TickPayload } from "../briefs/dispatcher";

// ─── 时间夹紧 ───

describe("clampSleep", () => {
  const prefs: Preferences = {
    ...DEFAULT_PREFERENCES,
    sleepRangeSeconds: { min: 30, max: 600, default: 120 },
  };

  it("uses default when raw is null", () => {
    expect(clampSleep(null, "normal", prefs)).toBe(120);
  });

  it("clamps to min when below range", () => {
    expect(clampSleep(5, "normal", prefs)).toBe(30);
  });

  it("clamps to max when above range", () => {
    expect(clampSleep(9999, "normal", prefs)).toBe(600);
  });

  it("doubles the duration in deep bias and clamps if needed", () => {
    expect(clampSleep(60, "deep", prefs)).toBe(120);   // 60*2=120 in range
    expect(clampSleep(400, "deep", prefs)).toBe(600);  // 400*2=800 → cap to 600
  });

  it("halves the duration in light bias and clamps to min", () => {
    expect(clampSleep(50, "light", prefs)).toBe(30);   // 50*0.5=25 → bump to 30
    expect(clampSleep(200, "light", prefs)).toBe(100); // 200*0.5=100
  });

  it("rejects non-positive raw → falls back to default", () => {
    expect(clampSleep(-5, "normal", prefs)).toBe(120);
    expect(clampSleep(NaN, "normal", prefs)).toBe(120);
  });
});

describe("sleepBiasAt", () => {
  it("picks weekend bias on Saturday", () => {
    const sat = new Date("2026-05-30T14:00:00+08:00");
    expect(sleepBiasAt(sat, DEFAULT_PREFERENCES)).toBe(DEFAULT_PREFERENCES.rhythm.weekend.sleepBias);
  });

  it("picks quiet bias inside quietHours window crossing midnight", () => {
    const earlyMorning = new Date("2026-05-27T03:00:00");           // Wed 03:00
    // 默认 quietHours = 23:00→07:00, sleepBias=deep
    expect(sleepBiasAt(earlyMorning, DEFAULT_PREFERENCES)).toBe("deep");
  });

  it("picks work bias inside workHours window", () => {
    const noon = new Date("2026-05-27T13:00:00");                   // Wed 13:00
    expect(sleepBiasAt(noon, DEFAULT_PREFERENCES)).toBe("normal");
  });
});

// ─── QueueProcessor ─────────────────────────────────────────────────────

class FakeScheduler implements SchedulerLike {
  private _now = 0;
  private timers: Array<{ id: number; at: number; cb: () => void }> = [];
  private nextId = 1;

  now(): number {
    return this._now;
  }

  setTimeout(cb: () => void, ms: number) {
    const id = this.nextId++;
    this.timers.push({ id, at: this._now + ms, cb });
    return id;
  }

  clearTimeout(h: unknown): void {
    this.timers = this.timers.filter((t) => t.id !== (h as number));
  }

  advance(ms: number): void {
    const target = this._now + ms;
    while (true) {
      const due = this.timers
        .filter((t) => t.at <= target)
        .sort((a, b) => a.at - b.at);
      if (due.length === 0) break;
      const next = due[0];
      this._now = next.at;
      this.timers = this.timers.filter((t) => t.id !== next.id);
      next.cb();
    }
    this._now = target;
  }
}

class FakeRunner {
  public calls = 0;
  public throwUntilCall = 0;
  public sleepSeconds: number | null = 60;

  async processTick(): Promise<TickResult> {
    this.calls += 1;
    if (this.calls <= this.throwUntilCall) {
      throw new Error("simulated runner failure #" + this.calls);
    }
    return { sleepSecondsRequested: this.sleepSeconds, toolCallCount: 0 };
  }
}

function makeAutoPayload(label: string): TickPayload {
  return { trigger: "auto", content: `<tick ${label}/>` };
}

async function flush() {
  // 让 microtask 跑完
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
}

describe("QueueProcessor", () => {
  it("runs tick → sleep → wakes naturally → schedules next tick", async () => {
    const sched = new FakeScheduler();
    const queue = new MessageQueue();
    const runner = new FakeRunner();
    const states: string[] = [];

    let nextLabel = 0;
    const processor = new QueueProcessor({
      queue,
      runner: runner as unknown as KairosRunner,
      prefs: { ...DEFAULT_PREFERENCES, sleepRangeSeconds: { min: 10, max: 600, default: 60 } },
      pickNextTick: async () => makeAutoPayload(`next-${nextLabel++}`),
      onStateChange: (s) => states.push(s),
      scheduler: sched,
    });

    await processor.start();
    await flush();
    // 第一次 loop：queue 空 → pickNextTick → 注入 → runner.processTick → 进入 sleep（60s）
    sched.advance(0);   // 让 pending 推进
    await flush();
    sched.advance(60_000);
    await flush();

    expect(runner.calls).toBeGreaterThanOrEqual(1);
    expect(states).toContain("ticking");
    expect(states).toContain("sleeping");
    expect(states).toContain("idle");
    await processor.stop();
  });

  it("triggerWake during sleep ends sleep early and emits interrupted state", async () => {
    const sched = new FakeScheduler();
    const queue = new MessageQueue();
    const runner = new FakeRunner();
    runner.sleepSeconds = 300;
    const states: string[] = [];
    let interruptedReason: WakeReason | undefined;

    const processor = new QueueProcessor({
      queue,
      runner: runner as unknown as KairosRunner,
      prefs: { ...DEFAULT_PREFERENCES, sleepRangeSeconds: { min: 10, max: 600, default: 60 } },
      pickNextTick: async () => makeAutoPayload("once"),
      onStateChange: (s) => states.push(s),
      onSleepEnd: (info) => {
        interruptedReason = info.interruptedBy;
      },
      scheduler: sched,
    });

    await processor.start();
    await flush();
    sched.advance(0);
    await flush();
    // 现在 runner 已经跑了一次，进入 sleep；用 triggerWake 中断
    expect(states[states.length - 1]).toBe("sleeping");
    processor.triggerWake("user_message");
    await flush();
    expect(interruptedReason).toBe("user_message");
    expect(states).toContain("interrupted");
    await processor.stop();
  });

  it("enters cooldown after consecutive errors reach threshold", async () => {
    const sched = new FakeScheduler();
    const queue = new MessageQueue();
    const runner = new FakeRunner();
    runner.throwUntilCall = 999; // 永远抛
    const states: string[] = [];
    const errors: unknown[] = [];

    const processor = new QueueProcessor({
      queue,
      runner: runner as unknown as KairosRunner,
      prefs: {
        ...DEFAULT_PREFERENCES,
        circuitBreaker: { errorThreshold: 2, cooldownSec: 1 },
        sleepRangeSeconds: { min: 10, max: 600, default: 60 },
      },
      pickNextTick: async () => makeAutoPayload("err"),
      onStateChange: (s) => states.push(s),
      onError: (err) => errors.push(err),
      scheduler: sched,
    });

    await processor.start();
    // Loop 1：throw → consecutive=1，未到 threshold（2）→ 继续走 sleep 路径；
    // sleep 0s（因 catch 后没设 sleepSeconds，默认走 default 60）… 实际我们把 default 设为 60
    // 简化：直接看 errors 数量 + cooldown state
    await flush();
    await new Promise((r) => setTimeout(r, 50));
    sched.advance(60_000);
    await flush();
    await new Promise((r) => setTimeout(r, 50));
    sched.advance(60_000);
    await flush();
    await new Promise((r) => setTimeout(r, 50));

    expect(errors.length).toBeGreaterThanOrEqual(2);
    expect(states).toContain("cooldown");
    await processor.stop();
  }, 10_000);
});
