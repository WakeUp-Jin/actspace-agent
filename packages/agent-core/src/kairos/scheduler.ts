/**
 * KairosScheduler — MessageQueue + QueueProcessor。
 *
 * 职责（plan 5 §3）：
 * 1. 维护一个 FIFO queue（tick + system 任务）。
 * 2. 主循环用尾递归：上一个 tick 完整结束（含 sleep）后才取下一条。
 * 3. sleep 阶段可被 `triggerWake()` 中断。
 * 4. runner 抛错累计达 `circuitBreaker.errorThreshold` 进入 cooldown。
 *
 * V1 简化（与 plan 比的取舍）：
 * - 不实现 blocklist.timeWindows 推迟（由 system prompt 引导 LLM 自行尊重）。
 * - 不实现 tickBudget 限额（同上；可作为 v2 增强）。
 * - 不显式实现"等主 Agent 完成"信号；改为：controller 在主 Agent runTurn 期间
 *   把 `mainAgentBusy` 标志置 true，scheduler 在每次"取下一条"前轮询，若 busy 则
 *   等待信号清除（通过 Promise + listener）。
 */
import type { KairosRunState } from "@actspace/shared";
import type { Preferences, SleepBias } from "./config/schema";
import type { TickPayload } from "./briefs/dispatcher";
import type { KairosRunner } from "./runner";

export type SystemQueueKind = "compress" | "monthly-archive" | "yearly-archive";

export type QueueMessage =
  | { type: "tick"; payload: TickPayload }
  | { type: "system"; payload: { kind: SystemQueueKind } };

export class MessageQueue {
  private readonly q: QueueMessage[] = [];

  enqueue(msg: QueueMessage): void {
    this.q.push(msg);
  }

  dequeue(): QueueMessage | null {
    return this.q.shift() ?? null;
  }

  isEmpty(): boolean {
    return this.q.length === 0;
  }

  size(): number {
    return this.q.length;
  }

  clear(): void {
    this.q.length = 0;
  }
}

// ─── Sleep 夹紧 + bias 推导 ────────────────────────────────────────────

/** 按当前时间段（work/quiet/weekend）选 sleepBias。 */
export function sleepBiasAt(now: Date, prefs: Preferences): SleepBias {
  const day = now.getDay();
  if (day === 0 || day === 6) return prefs.rhythm.weekend.sleepBias;
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (inWindow(minutes, prefs.rhythm.quietHours.start, prefs.rhythm.quietHours.end)) {
    return prefs.rhythm.quietHours.sleepBias;
  }
  if (inWindow(minutes, prefs.rhythm.workHours.start, prefs.rhythm.workHours.end)) {
    return prefs.rhythm.workHours.sleepBias;
  }
  return prefs.rhythm.workHours.sleepBias;
}

/** 把 LLM 给的秒数按 bias 调节，再夹到 preferences.sleepRangeSeconds。 */
export function clampSleep(
  rawSeconds: number | null | undefined,
  bias: SleepBias,
  prefs: Preferences,
): number {
  const range = prefs.sleepRangeSeconds;
  let base: number;
  if (typeof rawSeconds === "number" && Number.isFinite(rawSeconds) && rawSeconds > 0) {
    base = Math.floor(rawSeconds);
  } else {
    base = range.default;
  }
  const factor = bias === "deep" ? 2 : bias === "light" ? 0.5 : 1;
  const adjusted = Math.round(base * factor);
  if (adjusted < range.min) return range.min;
  if (adjusted > range.max) return range.max;
  return adjusted;
}

function inWindow(minutes: number, fromHHMM: string, toHHMM: string): boolean {
  const f = parseHHMM(fromHHMM);
  const t = parseHHMM(toHHMM);
  if (f < 0 || t < 0) return false;
  if (f <= t) return minutes >= f && minutes < t;
  return minutes >= f || minutes < t;
}

function parseHHMM(s: string): number {
  const m = /^([0-2]?\d):([0-5]\d)$/.exec(s.trim());
  if (!m) return -1;
  return Number(m[1]) * 60 + Number(m[2]);
}

// ─── QueueProcessor ────────────────────────────────────────────────────

export type WakeReason = "user_message" | "wake_now";

export interface QueueProcessorOptions {
  queue: MessageQueue;
  runner: KairosRunner;
  prefs: Preferences;
  /** 当队列空闲时获取下一条 tick（通常来自 BriefsDispatcher.pickNext）。 */
  pickNextTick: (now: Date) => Promise<TickPayload>;
  /** 状态变化回调（含 sleepEndsAt / 中断 reason 等元信息）。 */
  onStateChange: (state: KairosRunState, meta?: SchedulerStateMeta) => void;
  /** 进入 sleep 时回调；返回的 SessionEvent payload 由 controller 写盘。 */
  onSleepStart?: (plannedSeconds: number) => void;
  /** sleep 自然结束 / 被中断时回调；reason 帮助 controller 写对应 SessionEvent。 */
  onSleepEnd?: (info: { actualSeconds: number; interruptedBy?: WakeReason; remainingSeconds: number }) => void;
  /** runner 抛错时回调（含错误对象 + 当前连续错误计数）。 */
  onError?: (err: unknown, consecutiveErrors: number) => void;
  /** 测试注入：替换默认的 setTimeout（让测试不真等几十秒）。 */
  scheduler?: SchedulerLike;
}

export interface SchedulerStateMeta {
  sleepEndsAt?: string;
  cooldownEndsAt?: string;
}

/** 可中断 setTimeout 的最小接口；默认走 Node 全局。 */
export interface SchedulerLike {
  setTimeout: (cb: () => void, ms: number) => SchedulerHandle;
  clearTimeout: (h: SchedulerHandle) => void;
  now: () => number;
}

export type SchedulerHandle = unknown;

const defaultScheduler: SchedulerLike = {
  setTimeout: (cb, ms) => setTimeout(cb, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
};

export class QueueProcessor {
  private readonly opts: QueueProcessorOptions;
  private readonly schedulerImpl: SchedulerLike;
  private running = false;
  private stopRequested = false;
  private consecutiveErrors = 0;
  private currentSleep: {
    handle: SchedulerHandle;
    plannedMs: number;
    startedAt: number;
    resolve: (reason: WakeReason | "natural") => void;
  } | null = null;
  private mainAgentBusy = false;
  private mainAgentDoneResolvers: Array<() => void> = [];

  constructor(opts: QueueProcessorOptions) {
    this.opts = opts;
    this.schedulerImpl = opts.scheduler ?? defaultScheduler;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.stopRequested = false;
    this.consecutiveErrors = 0;
    this.opts.onStateChange("idle");
    void this.loop();
  }

  async stop(): Promise<void> {
    this.stopRequested = true;
    if (this.currentSleep) {
      this.interruptSleep("wake_now");
    }
    // wait 当前 tick 自然完成
    while (this.running) {
      await delay(20);
    }
    this.opts.onStateChange("stopped");
  }

  triggerWake(reason: WakeReason): void {
    if (this.currentSleep) {
      this.interruptSleep(reason);
    }
  }

  /** 主 Agent runTurn 开始 → scheduler 后续不投新 tick；同时唤醒任何进行中的 sleep。 */
  notifyMainAgentTurnStart(): void {
    this.mainAgentBusy = true;
    this.triggerWake("user_message");
  }

  /** 主 Agent runTurn 结束 → scheduler 可以继续投 tick（但要 delay 5s）。 */
  notifyMainAgentTurnEnd(): void {
    this.mainAgentBusy = false;
    const resolvers = this.mainAgentDoneResolvers;
    this.mainAgentDoneResolvers = [];
    for (const r of resolvers) r();
  }

  // ─── 内部主循环 ─────────────────────────────────────────────────────

  private async loop(): Promise<void> {
    try {
      while (!this.stopRequested) {
        // 等主 Agent 闲下来
        if (this.mainAgentBusy) {
          await this.waitMainAgentDone();
          // 主 Agent 刚结束 → 缓冲 5s，避免用户连发被 Kairos 抢资源
          await delay(5_000);
          if (this.stopRequested) break;
        }

        // 队列空 → 主动投一个 tick
        if (this.opts.queue.isEmpty()) {
          try {
            const next = await this.opts.pickNextTick(new Date(this.schedulerImpl.now()));
            this.opts.queue.enqueue({ type: "tick", payload: next });
          } catch (err) {
            this.opts.onError?.(err, ++this.consecutiveErrors);
          }
        }

        const msg = this.opts.queue.dequeue();
        if (!msg) {
          await delay(50);
          continue;
        }

        this.opts.onStateChange("ticking");
        let sleepSeconds: number | null = null;
        try {
          const result = await this.opts.runner.processTick(msg);
          sleepSeconds = result.sleepSecondsRequested;
          this.consecutiveErrors = 0;
        } catch (err) {
          this.consecutiveErrors += 1;
          this.opts.onError?.(err, this.consecutiveErrors);
          if (this.consecutiveErrors >= this.opts.prefs.circuitBreaker.errorThreshold) {
            const cooldownSec = this.opts.prefs.circuitBreaker.cooldownSec;
            const cooldownEndsAt = new Date(this.schedulerImpl.now() + cooldownSec * 1000).toISOString();
            this.opts.onStateChange("cooldown", { cooldownEndsAt });
            await delay(cooldownSec * 1000);
            this.consecutiveErrors = 0;
            this.opts.onStateChange("idle");
            continue;
          }
        }

        if (this.stopRequested) break;

        const bias = sleepBiasAt(new Date(this.schedulerImpl.now()), this.opts.prefs);
        const clamped = clampSleep(sleepSeconds, bias, this.opts.prefs);
        const sleepEndsAt = new Date(this.schedulerImpl.now() + clamped * 1000).toISOString();
        this.opts.onStateChange("sleeping", { sleepEndsAt });
        this.opts.onSleepStart?.(clamped);

        const sleepOutcome = await this.runInterruptibleSleep(clamped * 1000);
        this.opts.onSleepEnd?.({
          actualSeconds: Math.round(sleepOutcome.actualMs / 1000),
          interruptedBy: sleepOutcome.reason === "natural" ? undefined : sleepOutcome.reason,
          remainingSeconds: Math.round(sleepOutcome.remainingMs / 1000),
        });

        if (sleepOutcome.reason !== "natural") {
          this.opts.onStateChange("interrupted");
        } else {
          this.opts.onStateChange("idle");
        }
      }
    } finally {
      this.running = false;
    }
  }

  private interruptSleep(reason: WakeReason): void {
    const cur = this.currentSleep;
    if (!cur) return;
    this.schedulerImpl.clearTimeout(cur.handle);
    this.currentSleep = null;
    cur.resolve(reason);
  }

  private runInterruptibleSleep(ms: number): Promise<{
    reason: WakeReason | "natural";
    actualMs: number;
    remainingMs: number;
  }> {
    return new Promise((resolve) => {
      const startedAt = this.schedulerImpl.now();
      const handle = this.schedulerImpl.setTimeout(() => {
        if (this.currentSleep && this.currentSleep.handle === handle) {
          this.currentSleep = null;
        }
        resolve({ reason: "natural", actualMs: ms, remainingMs: 0 });
      }, ms);

      const wrappedResolve = (reason: WakeReason | "natural") => {
        const actualMs = this.schedulerImpl.now() - startedAt;
        resolve({ reason, actualMs, remainingMs: Math.max(0, ms - actualMs) });
      };

      this.currentSleep = { handle, plannedMs: ms, startedAt, resolve: wrappedResolve };
    });
  }

  private waitMainAgentDone(): Promise<void> {
    if (!this.mainAgentBusy) return Promise.resolve();
    return new Promise((resolve) => {
      this.mainAgentDoneResolvers.push(resolve);
    });
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
