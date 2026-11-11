/**
 * 资源采集器：按订阅计数启停。第一个订阅者来时创建定时器和事件循环直方图，最后一个走时全部释放——
 * 关闭时零成本（front-资源监控规范 §5.1）。
 */
import {
  RESOURCE_HISTORY_LENGTH,
  RESOURCE_SAMPLE_INTERVAL_MS,
  type ResourceHistoryPoint,
  type ResourceProcessRow,
  type ResourceSample,
  type ResourceWatchState,
} from "@actspace/shared";
import { buildGroups, CpuDeltaTracker, descendantsOf, parsePsOutput, type ElectronProcessReading } from "./process-table";

/** `app.getAppMetrics()` 一行里用到的字段。 */
export interface AppMetricLike {
  readonly pid: number;
  readonly type: string;
  readonly name?: string;
  readonly cpu: { readonly cumulativeCPUUsage?: number };
  readonly memory: { readonly workingSetSize: number };
}

export interface LoopDelayHistogram {
  readonly max: number;
  enable(): boolean | void;
  disable(): boolean | void;
  reset(): void;
}

export interface ResourceCollectorDeps {
  readonly getAppMetrics: () => readonly AppMetricLike[];
  readonly createHistogram: (resolutionMs: number) => LoopDelayHistogram;
  /** 异步执行 `ps`，返回 stdout 和子进程 pid；不支持的平台传 null。 */
  readonly runPs: (() => { readonly pid: number | undefined; readonly output: Promise<string> }) | null;
  readonly mainPid: number;
  /** 悬浮窗渲染进程的 pid，算进「监控自身」。 */
  readonly monitorPids: () => ReadonlySet<number>;
  readonly now?: () => number;
  /** 墙钟高精度计时，量采集器自己在主进程里的耗时。 */
  readonly cpuClock?: () => number;
  readonly setInterval?: (callback: () => void, ms: number) => unknown;
  readonly clearInterval?: (handle: unknown) => void;
  readonly log?: (message: string, details?: Record<string, unknown>) => void;
}

export type ResourceListener = (sample: ResourceSample, point: ResourceHistoryPoint) => void;

/** 直方图分辨率；实测 20 ms 时 `max − 20` 与人为阻塞时长误差 < 10 ms。 */
const LOOP_RESOLUTION_MS = 20;
/** 每 3 次采样（6 s）扫一次 `ps`。 */
const PS_EVERY_TICKS = 3;

interface Running {
  readonly timer: unknown;
  readonly histogram: LoopDelayHistogram;
  readonly electronCpu: CpuDeltaTracker;
  readonly agentCpu: CpuDeltaTracker;
  tick: number;
  agentRows: ResourceProcessRow[];
  psInFlight: boolean;
  /** 最近一次 `ps` 自己用的 CPU，摊到扫描间隔上。 */
  psPercent: number | null;
  /** 上一轮采样以来采集器自己花在主进程里的毫秒数。 */
  selfMs: number;
  lastAt: number;
}

export class ResourceCollector {
  private readonly listeners = new Set<ResourceListener>();
  private running: Running | null = null;
  private history: ResourceHistoryPoint[] = [];
  private latest: ResourceSample | null = null;
  private readonly now: () => number;
  private readonly cpuClock: () => number;
  private readonly setTimer: (callback: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;

  constructor(private readonly deps: ResourceCollectorDeps) {
    this.now = deps.now ?? Date.now;
    this.cpuClock = deps.cpuClock ?? (() => performance.now());
    this.setTimer = deps.setInterval ?? ((callback, ms) => {
      const handle = setInterval(callback, ms);
      handle.unref?.();
      return handle;
    });
    this.clearTimer = deps.clearInterval ?? (handle => clearInterval(handle as NodeJS.Timeout));
  }

  get active(): boolean {
    return this.running !== null;
  }

  state(): ResourceWatchState {
    return { history: this.history, latest: this.latest };
  }

  /** 订阅；返回退订函数。订阅数从 0 到 1 时启动，回到 0 时停止并丢掉历史。 */
  subscribe(listener: ResourceListener): () => void {
    this.listeners.add(listener);
    if (!this.running) this.start();
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.stop();
    };
  }

  dispose(): void {
    this.listeners.clear();
    this.stop();
  }

  private start(): void {
    const histogram = this.deps.createHistogram(LOOP_RESOLUTION_MS);
    histogram.enable();
    const electronCpu = new CpuDeltaTracker();
    const startedAt = this.now();
    // 先记一次基准，第一个采样就能算出 CPU。
    for (const metric of this.deps.getAppMetrics()) {
      if (metric.cpu.cumulativeCPUUsage !== undefined) electronCpu.percent(metric.pid, metric.cpu.cumulativeCPUUsage, startedAt);
    }
    electronCpu.commit();
    this.running = {
      timer: this.setTimer(() => this.sample(), RESOURCE_SAMPLE_INTERVAL_MS),
      histogram,
      electronCpu,
      agentCpu: new CpuDeltaTracker(),
      tick: 0,
      agentRows: [],
      psInFlight: false,
      psPercent: null,
      selfMs: 0,
      lastAt: startedAt,
    };
    this.scanAgentProcesses(this.running);
  }

  private stop(): void {
    const running = this.running;
    if (!running) return;
    this.running = null;
    this.clearTimer(running.timer);
    running.histogram.disable();
    this.history = [];
    this.latest = null;
  }

  private sample(): void {
    const running = this.running;
    if (!running) return;
    const started = this.cpuClock();
    const at = this.now();
    const monitorPids = this.deps.monitorPids();
    const electron: ElectronProcessReading[] = [];
    const elapsedMs = Math.max(1, at - running.lastAt);
    const selfPercent = (running.selfMs / elapsedMs) * 100;
    for (const metric of this.deps.getAppMetrics()) {
      const cumulative = metric.cpu.cumulativeCPUUsage;
      let cpuPercent = cumulative === undefined ? null : running.electronCpu.percent(metric.pid, cumulative, at);
      // 采集器自己的耗时记在「监控自身」，从主进程那一行扣掉。
      if (metric.type === "Browser" && cpuPercent !== null) cpuPercent = Math.max(0, cpuPercent - selfPercent);
      electron.push({ pid: metric.pid, type: metric.type, name: metric.name, cpuPercent, rssKiB: metric.memory.workingSetSize });
    }
    running.electronCpu.commit();
    const mainThreadDelayMs = Math.max(0, running.histogram.max / 1e6 - LOOP_RESOLUTION_MS);
    running.histogram.reset();
    const selfRow: ResourceProcessRow = { pid: this.deps.mainPid, label: "采集器", count: 1, cpuPercent: selfPercent, rssKiB: 0 };
    const monitorRows = running.psPercent === null ? [selfRow] : [selfRow, { pid: 0, label: "ps", count: 1, cpuPercent: running.psPercent, rssKiB: 0 }];
    const groups = buildGroups({ electron, monitorPids, agent: running.agentRows, monitorChildren: monitorRows });
    let cpuPercent = 0;
    let rssKiB = 0;
    for (const group of groups) {
      if (group.id === "monitor") continue;
      cpuPercent += group.cpuPercent;
      rssKiB += group.rssKiB;
    }
    const sample: ResourceSample = {
      sampledAt: at,
      cpuPercent,
      rssKiB,
      mainCpuPercent: groups.find(group => group.id === "main")?.cpuPercent ?? 0,
      mainThreadDelayMs,
      groups,
      agentProcessesAvailable: this.deps.runPs !== null,
    };
    const point: ResourceHistoryPoint = { at, cpuPercent, rssKiB, mainThreadDelayMs };
    this.latest = sample;
    this.history = this.history.length >= RESOURCE_HISTORY_LENGTH
      ? [...this.history.slice(this.history.length - RESOURCE_HISTORY_LENGTH + 1), point]
      : [...this.history, point];
    running.tick += 1;
    if (running.tick % PS_EVERY_TICKS === 0) this.scanAgentProcesses(running);
    running.lastAt = at;
    running.selfMs = this.cpuClock() - started;
    for (const listener of this.listeners) listener(sample, point);
  }

  /** 异步 `ps`；上一次还没返回就跳过这一轮，不排队。 */
  private scanAgentProcesses(running: Running): void {
    const runPs = this.deps.runPs;
    if (!runPs || running.psInFlight) return;
    running.psInFlight = true;
    const { pid: psPid, output } = runPs();
    output.then((stdout) => {
      if (this.running !== running) return;
      const started = this.cpuClock();
      const at = this.now();
      const rows = parsePsOutput(stdout);
      const skip = new Set<number>(this.deps.getAppMetrics().map(metric => metric.pid));
      if (psPid !== undefined) {
        skip.add(psPid);
        // ps 输出里有它自己这一行；它的累计 CPU 就是这次扫描的成本。
        const own = rows.find(row => row.pid === psPid);
        running.psPercent = own ? (own.cpuSeconds / ((PS_EVERY_TICKS * RESOURCE_SAMPLE_INTERVAL_MS) / 1000)) * 100 : null;
      }
      running.agentRows = descendantsOf(rows, this.deps.mainPid, skip).map(row => ({
        pid: row.pid,
        label: row.name,
        count: 1,
        cpuPercent: running.agentCpu.percent(row.pid, row.cpuSeconds, at),
        rssKiB: row.rssKiB,
      }));
      running.agentCpu.commit();
      running.selfMs += this.cpuClock() - started;
    }, (error: unknown) => {
      this.deps.log?.("resource monitor ps failed", { error: error instanceof Error ? error.message : String(error) });
    }).finally(() => {
      running.psInFlight = false;
    });
  }
}
