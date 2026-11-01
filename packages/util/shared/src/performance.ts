/** Application processes only; memory is summed working set, not unique physical RAM. */
export interface DesktopPerformanceSnapshot {
  sampledAt: number;
  mainDelayMs: number;
  processes: Array<{ pid: number; type: string; cpuPercent: number; workingSetKiB: number }>;
}
export const PERFORMANCE_CHANNELS = {
  sample: "actspace:performance:sample",
  active: "actspace:performance:active",
} as const;
