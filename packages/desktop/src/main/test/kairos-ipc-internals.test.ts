import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KairosBriefWriteRequest, KairosRuntimeState, SessionEvent } from "@actspace/shared";
import { emptyKairosUsageSummary } from "@actspace/shared";
import {
  CONFIG_FILE_MAP,
  KairosEventBatcher,
  clampLimit,
  deleteBrief,
  dispatchKairosControl,
  listBriefs,
  readKairosConfigFile,
  readBrief,
  validateByName,
  writeKairosConfigFile,
  writeBrief,
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
    async setBudget(input) {
      calls.push({ method: "setBudget", args: [input] });
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

  it("skips validation for markdown configs (rule.md / soul.md)", () => {
    expect(() => validateByName("rule", "# 任意 markdown 文本\n- bullet")).not.toThrow();
    expect(() => validateByName("soul", "# 你是 Kairos —— 自定义人格")).not.toThrow();
  });

  it("dispatches to the right parser for all 5 logical names", () => {
    // 5 个 name 都能 round-trip 不抛；任何漏分支会被 default 兜底/exhaustive 暴露
    const markdownNames = new Set(["rule", "soul"]);
    for (const name of ["preferences", "paths", "blocklist", "rule", "soul"] as const) {
      expect(() => validateByName(name, markdownNames.has(name) ? "" : {})).not.toThrow();
    }
  });
});

// ─── CONFIG_FILE_MAP ──────────────────────────────────────────

describe("CONFIG_FILE_MAP", () => {
  it("maps all 5 logical names to expected filenames", () => {
    expect(CONFIG_FILE_MAP).toEqual({
      preferences: "preferences.json",
      paths: "paths.json",
      blocklist: "blocklist.json",
      rule: "rule.md",
      soul: "soul.md",
    });
  });
});

describe("Kairos config files", () => {
  let kairosRoot: string;

  beforeEach(async () => {
    kairosRoot = await mkdtemp(join(tmpdir(), "kairos-config-"));
  });

  afterEach(async () => {
    await rm(kairosRoot, { recursive: true, force: true });
  });

  it("returns a typed not-found response before the runtime controller exists", async () => {
    await expect(readKairosConfigFile(kairosRoot, { name: "preferences" })).resolves.toEqual({
      content: "",
      fileName: "preferences.json",
      notFound: true,
    });
  });

  it("writes and reads JSON config without requiring a runtime controller", async () => {
    const content = JSON.stringify({ enabled: false }, null, 2);
    await writeKairosConfigFile(kairosRoot, { name: "preferences", content });

    await expect(readKairosConfigFile(kairosRoot, { name: "preferences" })).resolves.toEqual({
      content,
      fileName: "preferences.json",
      notFound: false,
    });
  });

  it("writes markdown config verbatim", async () => {
    const content = "# Kairos rule\n保持克制。\n";
    await writeKairosConfigFile(kairosRoot, { name: "rule", content });

    await expect(readKairosConfigFile(kairosRoot, { name: "rule" })).resolves.toMatchObject({
      content,
      fileName: "rule.md",
      notFound: false,
    });
  });

  it("rejects invalid JSON before replacing the config file", async () => {
    await expect(
      writeKairosConfigFile(kairosRoot, { name: "preferences", content: "{ broken" }),
    ).rejects.toThrow(/Invalid JSON/);
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
    agentRunId: "turn-1",
    timestamp: new Date().toISOString(),
    schemaVersion: 2,
    type: "kairos_tick_injected",
    payload: { trigger: "auto", content: "<tick/>" },
  } as SessionEvent;
}

function makeState(over: Partial<KairosRuntimeState> = {}): KairosRuntimeState {
  return {
    enabled: true,
    state: "ticking",
    budget: { enabled: false, balanceCny: 0, exhausted: false },
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

  it("type=set_budget → 透传 enabled+balanceCny 到 setBudget，不碰 preference", async () => {
    const c = makeMockController();
    await dispatchKairosControl(c, { type: "set_budget", enabled: true, balanceCny: 5 });
    expect(c.calls).toEqual([
      { method: "setBudget", args: [{ enabled: true, balanceCny: 5 }] },
    ]);
  });

  it("type=set_budget → 关闭额度（enabled=false）也透传", async () => {
    const c = makeMockController();
    await dispatchKairosControl(c, { type: "set_budget", enabled: false, balanceCny: 0 });
    expect(c.calls).toEqual([
      { method: "setBudget", args: [{ enabled: false, balanceCny: 0 }] },
    ]);
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

// ─── briefs 文件存取 ──────────────────────────────────────────

describe("briefs store (list/read/write/delete)", () => {
  let briefsDir: string;

  beforeEach(async () => {
    briefsDir = await mkdtemp(join(tmpdir(), "kairos-briefs-"));
  });

  afterEach(async () => {
    await rm(briefsDir, { recursive: true, force: true });
  });

  const writeReq = (over: Partial<KairosBriefWriteRequest> = {}): KairosBriefWriteRequest => ({
    id: "daily-report",
    status: "active",
    trigger: "interval",
    intervalSec: 3600,
    priority: "normal",
    body: "# 日报\n汇总今日文件变动。",
    ...over,
  });

  it("returns empty list when tasks dir does not exist", async () => {
    expect(await listBriefs(briefsDir)).toEqual({ briefs: [] });
  });

  it("creates a new brief with system-managed fields initialized", async () => {
    const now = new Date("2026-07-04T10:00:00.000Z");
    await writeBrief(briefsDir, writeReq(), now);

    const { briefs } = await listBriefs(briefsDir);
    expect(briefs).toHaveLength(1);
    expect(briefs[0]).toMatchObject({
      id: "daily-report",
      status: "active",
      trigger: "interval",
      intervalSec: 3600,
      priority: "normal",
      created: now.toISOString(),
      lastRun: null,
      nextRun: null,
    });

    const read = await readBrief(briefsDir, "daily-report");
    expect(read.body).toContain("# 日报");
  });

  it("preserves created/lastRun/nextRun when editing an existing brief", async () => {
    const created = new Date("2026-07-01T08:00:00.000Z");
    await writeBrief(briefsDir, writeReq(), created);
    // 模拟系统跑过一次：直接改盘上的 frontmatter
    const filePath = join(briefsDir, "tasks", "daily-report.md");
    const raw = await readFile(filePath, "utf8");
    await writeFile(
      filePath,
      raw
        .replace("lastRun: null", "lastRun: 2026-07-03T18:00:00.000Z")
        .replace("nextRun: null", "nextRun: 2026-07-04T18:00:00.000Z"),
      "utf8",
    );

    await writeBrief(briefsDir, writeReq({ priority: "high", body: "更新后的正文" }));

    const read = await readBrief(briefsDir, "daily-report");
    expect(read.summary.priority).toBe("high");
    expect(read.body).toContain("更新后的正文");
    // 系统字段不被 UI 提交破坏
    expect(read.summary.created).toBe(created.toISOString());
    expect(read.summary.lastRun).toBe("2026-07-03T18:00:00.000Z");
    expect(read.summary.nextRun).toBe("2026-07-04T18:00:00.000Z");
  });

  it("clears intervalSec for non-interval triggers", async () => {
    await writeBrief(briefsDir, writeReq({ id: "manual-task", trigger: "manual", intervalSec: 999 }));
    const read = await readBrief(briefsDir, "manual-task");
    expect(read.summary.intervalSec).toBeNull();
  });

  it("rejects interval briefs without a positive intervalSec", async () => {
    await expect(
      writeBrief(briefsDir, writeReq({ intervalSec: null })),
    ).rejects.toThrow(/intervalSec/);
    await expect(
      writeBrief(briefsDir, writeReq({ intervalSec: -5 })),
    ).rejects.toThrow(/intervalSec/);
  });

  it("rejects ids with path traversal or illegal characters", async () => {
    for (const bad of ["../escape", "a/b", "", "含中文", ".hidden"]) {
      await expect(writeBrief(briefsDir, writeReq({ id: bad }))).rejects.toThrow(/Invalid brief id/);
    }
    await expect(readBrief(briefsDir, "../../etc/passwd")).rejects.toThrow(/Invalid brief id/);
    await expect(deleteBrief(briefsDir, "../x")).rejects.toThrow(/Invalid brief id/);
  });

  it("deletes a brief and tolerates deleting a missing one", async () => {
    await writeBrief(briefsDir, writeReq());
    await deleteBrief(briefsDir, "daily-report");
    expect(await listBriefs(briefsDir)).toEqual({ briefs: [] });
    await expect(deleteBrief(briefsDir, "daily-report")).resolves.toBeUndefined();
  });
});
