/** 资源占用页的格式与阈值（front-资源监控规范 §3.3、§4）。与悬浮窗 `public/monitor/monitor.js` 保持同样写法。 */
import type { ResourceGroupId } from "@actspace/shared";

export const RESOURCE_GROUP_NAMES: Record<ResourceGroupId, string> = {
  main: "主进程",
  renderer: "界面",
  gpu: "GPU",
  utility: "其他工具进程",
  agent: "Agent 子进程",
  monitor: "监控自身",
};

/** 分组名后的灰色补充说明（只在设置页显示）。 */
export const RESOURCE_GROUP_NOTES: Partial<Record<ResourceGroupId, string>> = {
  main: "含 Agent Runtime",
  monitor: "不计入合计",
};

export function formatCpuPercent(value: number | null): string {
  if (value === null) return "—";
  return value < 10 ? `${value.toFixed(1)}%` : `${Math.round(value)}%`;
}

export function formatMemoryKiB(kib: number): string {
  if (kib >= 1024 * 1024) return `${(kib / 1024 / 1024).toFixed(2)} GB`;
  return `${Math.round(kib / 1024)} MB`;
}

export function formatDelayMs(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export type ResourceTone = "warning" | "danger" | null;

/** 主进程长时间吃满一个核，界面和 Agent 都会卡。合计 CPU 不变色。 */
export function mainCpuTone(percent: number): ResourceTone {
  return percent >= 90 ? "warning" : null;
}

export function delayTone(ms: number): ResourceTone {
  if (ms >= 1000) return "danger";
  if (ms >= 200) return "warning";
  return null;
}

/** CPU 曲线的上限按 100% 一档取整，单核满载时线贴顶。 */
export function cpuChartMax(values: readonly number[]): number {
  let max = 0;
  for (const value of values) if (value > max) max = value;
  return Math.max(100, Math.ceil(max / 100) * 100);
}

/** SVG 折线与填充路径；横轴固定 `capacity` 个点，不足时从右边开始画。 */
export function sparkPaths(values: readonly number[], max: number, capacity: number, width: number, height: number): { line: string; area: string } {
  if (values.length === 0 || max <= 0) return { line: "", area: "" };
  const offset = capacity - values.length;
  const step = capacity > 1 ? width / (capacity - 1) : 0;
  const points = values.map((value, index) => {
    const x = (offset + index) * step;
    const y = height - 1 - (Math.min(Math.max(value, 0), max) / max) * (height - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = `M${points.join("L")}`;
  const firstX = (offset * step).toFixed(1);
  const lastX = ((capacity - 1) * step).toFixed(1);
  return { line, area: `${line}L${lastX},${height}L${firstX},${height}Z` };
}
