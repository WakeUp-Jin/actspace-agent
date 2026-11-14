/**
 * 资源监控（设置「资源占用」+ 悬浮窗）的数据形状与 channel。口径见 front-资源监控规范 §4：
 * CPU 100% = 一个核；内存是常驻内存（RSS / working set），含共享页，各进程直接相加。
 */

/** 固定分组，顺序即界面顺序。`monitor`（悬浮窗自身）不计入合计。 */
export type ResourceGroupId = "main" | "renderer" | "gpu" | "utility" | "agent" | "monitor";

export const RESOURCE_GROUP_ORDER: readonly ResourceGroupId[] = [
  "main",
  "renderer",
  "gpu",
  "utility",
  "agent",
  "monitor",
];

export interface ResourceProcessRow {
  readonly pid: number;
  /** 进程名（Electron 的 name / type，或子进程的可执行文件名）。 */
  readonly label: string;
  /** 合并的进程数；Agent 子进程按名字合并后可能大于 1。 */
  readonly count: number;
  /** 第一次看到的子进程没有上一次读数，CPU 未知。 */
  readonly cpuPercent: number | null;
  readonly rssKiB: number;
}

export interface ResourceGroup {
  readonly id: ResourceGroupId;
  readonly cpuPercent: number;
  readonly rssKiB: number;
  readonly processes: readonly ResourceProcessRow[];
}

export interface ResourceSample {
  readonly sampledAt: number;
  /** 合计（不含 monitor 组）。 */
  readonly cpuPercent: number;
  readonly rssKiB: number;
  readonly mainCpuPercent: number;
  /** 采样窗口内主进程事件循环的最大延迟。 */
  readonly mainThreadDelayMs: number;
  readonly groups: readonly ResourceGroup[];
  /** Windows 没有 `ps`，不统计 Agent 子进程。 */
  readonly agentProcessesAvailable: boolean;
}

/** 曲线只需要的三项；5 分钟 150 个点。 */
export interface ResourceHistoryPoint {
  readonly at: number;
  readonly cpuPercent: number;
  readonly rssKiB: number;
  readonly mainThreadDelayMs: number;
}

export interface ResourceWatchState {
  readonly history: readonly ResourceHistoryPoint[];
  readonly latest: ResourceSample | null;
}

export interface ResourceFloatState extends ResourceWatchState {
  readonly expanded: boolean;
}

export const RESOURCE_SAMPLE_INTERVAL_MS = 2_000;
export const RESOURCE_HISTORY_LENGTH = 150;

/** 主进程每 2 秒推一次：最新读数 + 追加到曲线的点。 */
export interface ResourceSampleNotice {
  readonly sample: ResourceSample;
  readonly point: ResourceHistoryPoint;
}

/** 悬浮窗告诉主进程自己的布局：展开与否、内容高度（px）。主进程据此改窗口大小并记住展开状态。 */
export interface ResourceFloatLayout {
  readonly expanded: boolean;
  readonly height: number;
}

export const RESOURCE_MONITOR_CHANNELS = {
  watch: "actspace:resources:watch",
  copySnapshot: "actspace:resources:copy-snapshot",
  setFloatLayout: "actspace:resources:float-layout",
  closeFloat: "actspace:resources:float-close",
  sample: "actspace:resources:sample",
  floatState: "actspace:resources:float-state",
} as const;
