import { describe, expect, it, vi } from "vitest";
import type { KairosRuntimeState, SessionEvent } from "@actspace/shared";
import { emptyKairosUsageSummary } from "@actspace/shared";
import {
  CONFIG_FILE_MAP,
  KairosEventBatcher,
  clampLimit,
  dispatchKairosControl,
  validateByName,
  type BatcherSink,
  type BatcherTimer,
  type KairosControllerForDispatch,
} from "../kairos-ipc-internals";

function makeMockController(): KairosControllerForDispatch & {
  calls: Array<{ method: string; args: unknown[] }>;
} {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  return {
    calls,
    async start(opts) {
      calls.push({ method: "start", args: [opts] });
    },
    async stop() {
      calls.push({ method: "stop", args: [] });
    },
    async wakeNow() {
      calls.push({ method: "wakeNow", args: [] });
    },
    async resetToday() {
      calls.push({ method: "resetToday", args: [] });
    },
    async setEnabledPreference(enabled) {
      calls.push({ method: "setEnabledPreference", args: [enabled] });
    },
  };
}

// ─── clampLimit ────────────────────────────────────────────────

describe("clampLimit", () => {
  it("defaults non-finite values to 200", () => {
    expect(clampLimit(Number.NaN)).toBe(200);
    expect(clampLimit(Number.POSITIVE_INFINITY)).toBe(200);
  });

  it("clamps below 1 to 1 and above 500 to 500", () => {
    expect(clampLimit(0)).toBe(1);
    expect(clampLimit(-5)).toBe(1);
    expect(clampLimit(10_000)).toBe(500);
  });

  it("floors fractional values", () => {
    expect(clampLimit(199.9)).toBe(199);
  });
});

// ─── validateByName ────────────────────────────────────────────

describe("validateByName", () => {
  // 注意：agent-core 的 schema parser 设计为"宽容兜底永不 throw"
  // （plan 2 §设计原则：loader 永远不应该 throw 给 controller）。
  // 因此 validateByName 的契约是「确保对应 parser 被调用过；JSON 本身合法即放行」。
  // 真正会让 write-config 失败的是 ipc.ts 里的 JSON.parse 异常。
  it("accepts valid preferences shape and is tolerant of garbage fields", () => {
    expect(() => validateByName("preferences", { enabled: true })).not.toThrow();
    expect(() => validateByName("preferences", { enabled: "yes" })).not.toThrow();
    expect(() => validateByName("preferences", {})).not.toThrow();
  });

  it("accepts valid paths config", () => {
    expect(() =>
      validateByName("paths", { paths: [{ path: "/tmp/a", watch: true }] }),
    ).not.toThrow();
  });

  it("accepts valid blocklist and tolerates malformed inner items", () => {
    expect(() =>
      validateByName("blocklist", { paths: ["**/secret/**"], toolsDenied: ["bash"] }),
    ).not.toThrow();
    expect(() => validateByName("blocklist", { paths: [123] })).not.toThrow();
  });

  it("skips validation for rule.md (no parse needed)", () => {
    expect(() => validateByName("rule", "# 任意 markdown 文本\n- bullet")).not.toThrow();
  });

  it("dispatches to the right parser for all 4 logical names", () => {
    // 4 个 name 都能 round-trip 不抛；任何漏分支会被 default 兜底/exhaustive 暴露
    for (const name of ["preferences", "paths", "blocklist", "rule"] as const) {
      expect(() => validateByName(name, name === "rule" ? "" : {})).not.toThrow();
    }
  });
});

// ─── CONFIG_FILE_MAP ──────────────────────────────────────────

describe("CONFIG_FILE_MAP", () => {
  it("maps all 4 logical names to expected filenames", () => {
    expect(CONFIG_FILE_MAP).toEqual({
      preferences: "preferences.json",
      paths: "paths.json",
      blocklist: "blocklist.json",
      rule: "rule.md",
    });
  });
});

// ─── KairosEventBatcher ───────────────────────────────────────

interface FakeTimer extends BatcherTimer {
  advance(ms: number): void;
}

function makeFakeTimer(): FakeTimer {
  let now = 0;
  type Pending = { id: number; runAt: number; handler: () => void };
  let nextId = 1;
  const pending: Pending[] = [];
  return {
    setTimeout: (handler, ms) => {
      const id = nextId++;
      pending.push({ id, runAt: now + ms, handler });
      return id;
    },
    clearTimeout: (handle) => {
      const id = handle as number;
      const idx = pending.findIndex((p) => p.id === id);
      if (idx >= 0) pending.splice(idx, 1);
    },
    advance(ms: number) {
      now += ms;
      // 取所有到期任务（按到期时间）执行
      const due = pending
        .filter((p) => p.runAt <= now)
        .sort((a, b) => a.runAt - b.runAt);
      for (const p of due) {
        const idx = pending.indexOf(p);
        if (idx >= 0) pending.splice(idx, 1);
        p.handler();
      }
    },
  };
}

function makeFakeSink(opts: { alive?: boolean } = {}): BatcherSink & {
  events: SessionEvent[];
  states: KairosRuntimeState[];
} {
  const events: SessionEvent[] = [];
  const states: KairosRuntimeState[] = [];
  return {
    events,
    states,
    sendEvent: (e) => events.push(e),
    sendState: (s) => states.push(s),
    isAlive: () => opts.alive !== false,
  };
}

function makeEvent(id: string): SessionEvent {
  return {
    id,
    sessionId: "kairos-2026-05-27",
    turnId: "turn-1",
    timestamp: new Date().toISOString(),
    schemaVersion: 1,
    type: "kairos_tick_injected",
    payload: { trigger: "auto", content: "<tick/>" },
  } as SessionEvent;
}

function makeState(over: Partial<KairosRuntimeState> = {}): KairosRuntimeState {
  return {
    enabled: true,
    state: "ticking",
    todayTickCount: 1,
    toolCallCountInCurrentTick: 0,
    totalSleepSecondsToday: 0,
    usageLifetime: emptyKairosUsageSummary(),
    usageSinceReset: emptyKairosUsageSummary(),
    ...over,
  };
}

describe("KairosEventBatcher", () => {
  it("buffers events and flushes once after debounce window", () => {
    const sink = makeFakeSink();
    const timer = makeFakeTimer();
    const batcher = new KairosEventBatcher(sink, 50, timer);

    batcher.pushEvent(makeEvent("e1"));
    batcher.pushEvent(makeEvent("e2"));
    batcher.pushEvent(makeEvent("e3"));
    // 仍在 debounce 窗口内：未 flush
    expect(sink.events).toHaveLength(0);

    timer.advance(49);
    expect(sink.events).toHaveLength(0);

    timer.advance(1);
    expect(sink.events.map((e) => e.id)).toEqual(["e1", "e2", "e3"]);
  });

  it("collapses multiple setState into one final send", () => {
    const sink = makeFakeSink();
    const timer = makeFakeTimer();
    const batcher = new KairosEventBatcher(sink, 50, timer);

    batcher.setState(makeState({ state: "idle", todayTickCount: 1 }));
    batcher.setState(makeState({ state: "ticking", todayTickCount: 2 }));
    batcher.setState(makeState({ state: "sleeping", todayTickCount: 3 }));
    expect(sink.states).toHaveLength(0);

    timer.advance(50);
    expect(sink.states).toHaveLength(1);
    expect(sink.states[0].state).toBe("sleeping");
    expect(sink.states[0].todayTickCount).toBe(3);
  });

  it("emits both buffered events and the latest state in one flush", () => {
    const sink = makeFakeSink();
    const timer = makeFakeTimer();
    const batcher = new KairosEventBatcher(sink, 50, timer);

    batcher.pushEvent(makeEvent("e1"));
    batcher.setState(makeState({ state: "ticking" }));
    batcher.pushEvent(makeEvent("e2"));

    timer.advance(50);
    expect(sink.events.map((e) => e.id)).toEqual(["e1", "e2"]);
    expect(sink.states).toHaveLength(1);
  });

  it("drops buffered batch when sink reports not alive", () => {
    const sink = makeFakeSink({ alive: false });
    const timer = makeFakeTimer();
    const batcher = new KairosEventBatcher(sink, 50, timer);

    batcher.pushEvent(makeEvent("e1"));
    batcher.setState(makeState());

    timer.advance(50);
    expect(sink.events).toHaveLength(0);
    expect(sink.states).toHaveLength(0);
  });

  it("flushNow forces immediate emit (used for dispose / tests)", () => {
    const sink = makeFakeSink();
    const timer = makeFakeTimer();
    const batcher = new KairosEventBatcher(sink, 50, timer);

    batcher.pushEvent(makeEvent("e1"));
    batcher.flushNow();
    expect(sink.events.map((e) => e.id)).toEqual(["e1"]);
  });

  it("dispose clears pending timer and rejects further pushes", () => {
    const sink = makeFakeSink();
    const timer = makeFakeTimer();
    const clearSpy = vi.spyOn(timer, "clearTimeout");
    const batcher = new KairosEventBatcher(sink, 50, timer);

    batcher.pushEvent(makeEvent("e1"));
    batcher.dispose();
    expect(clearSpy).toHaveBeenCalled();

    // dispose 后再 push 也不会触发 flush
    batcher.pushEvent(makeEvent("e2"));
    timer.advance(500);
    expect(sink.events).toHaveLength(0);
  });
});

// ─── dispatchKairosControl ─────────────────────────────────────

describe("dispatchKairosControl", () => {
  it("type=start → calls start({force:true}) then setEnabledPreference(true)", async () => {
    const c = makeMockController();
    await dispatchKairosControl(c, { type: "start" });
    expect(c.calls).toEqual([
      { method: "start", args: [{ force: true }] },
      { method: "setEnabledPreference", args: [true] },
    ]);
  });

  it("type=stop → calls stop() then setEnabledPreference(false)", async () => {
    const c = makeMockController();
    await dispatchKairosControl(c, { type: "stop" });
    expect(c.calls).toEqual([
      { method: "stop", args: [] },
      { method: "setEnabledPreference", args: [false] },
    ]);
  });

  it("type=wake_now → only wakeNow(), no preference write", async () => {
    const c = makeMockController();
    await dispatchKairosControl(c, { type: "wake_now" });
    expect(c.calls).toEqual([{ method: "wakeNow", args: [] }]);
  });

  it("type=reset_today → only resetToday(), no preference write", async () => {
    const c = makeMockController();
    await dispatchKairosControl(c, { type: "reset_today" });
    expect(c.calls).toEqual([{ method: "resetToday", args: [] }]);
  });

  it("throws on missing / malformed payload", async () => {
    const c = makeMockController();
    await expect(
      dispatchKairosControl(c, undefined as unknown as { type: "start" }),
    ).rejects.toThrow(/invalid payload/);
    await expect(
      dispatchKairosControl(c, { type: 123 } as unknown as { type: "start" }),
    ).rejects.toThrow(/invalid payload/);
    expect(c.calls).toEqual([]);
  });

  it("propagates setEnabledPreference failure (e.g. user broke preferences.json)", async () => {
    const c = makeMockController();
    c.setEnabledPreference = async () => {
      throw new Error("preferences.json 解析失败：bad json");
    };
    await expect(dispatchKairosControl(c, { type: "start" })).rejects.toThrow(/解析失败/);
    // start 已经成功，但 setEnabledPreference 抛错被上抛
    expect(c.calls.find((e) => e.method === "start")).toBeTruthy();
  });
});
