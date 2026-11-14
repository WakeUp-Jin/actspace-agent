/** 「复制快照」的纯文本（front-资源监控规范 §5.3）。纯函数，footprint 由调用方取好传进来。 */
import type { ResourceGroupId, ResourceSample } from "@actspace/shared";

export const RESOURCE_GROUP_LABELS: Record<ResourceGroupId, string> = {
  main: "主进程（含 Agent Runtime）",
  renderer: "界面",
  gpu: "GPU",
  utility: "其他工具进程",
  agent: "Agent 子进程",
  monitor: "监控自身（不计入合计）",
};

export function formatCpu(value: number | null): string {
  if (value === null) return "—";
  return `${value < 10 ? value.toFixed(1) : Math.round(value)}%`;
}

export function formatKiB(kib: number): string {
  if (kib >= 1024 * 1024) return `${(kib / 1024 / 1024).toFixed(2)} GB`;
  return `${Math.round(kib / 1024)} MB`;
}

/** `footprint` 输出里每个进程的标题行：`Name [pid]: 64-bit    Footprint: 187 MB (16384 bytes per page)`。 */
export function parseFootprint(stdout: string): Map<number, string> {
  const result = new Map<number, string>();
  for (const match of stdout.matchAll(/\[(\d+)\]:.*?Footprint:\s*([\d.]+\s*[KMG]?B)/g))
    result.set(Number(match[1]), match[2]!.replace(/\s+/g, " "));
  return result;
}

export interface SnapshotContext {
  readonly sample: ResourceSample;
  readonly platform: string;
  readonly cores: number;
  readonly appVersion: string;
  /** null = 当前平台不取；Error = 取失败。 */
  readonly footprint: ReadonlyMap<number, string> | Error | null;
}

export function formatResourceSnapshot(context: SnapshotContext): string {
  const { sample } = context;
  const lines = [
    `ActSpace 资源快照 ${new Date(sample.sampledAt).toISOString()}`,
    `版本 ${context.appVersion} · ${context.platform} · ${context.cores} 核 · CPU 100% = 一个核 · 内存为常驻内存（含共享页）`,
    "",
    `合计 CPU ${formatCpu(sample.cpuPercent)} · 内存 ${formatKiB(sample.rssKiB)} · 主线程延迟 ${Math.round(sample.mainThreadDelayMs)} ms`,
    "",
  ];
  for (const group of sample.groups) {
    const unavailable = group.id === "agent" && !sample.agentProcessesAvailable;
    lines.push(
      unavailable
        ? `${RESOURCE_GROUP_LABELS[group.id]}  —（当前平台不统计）`
        : `${RESOURCE_GROUP_LABELS[group.id]}  CPU ${formatCpu(group.cpuPercent)} · 内存 ${formatKiB(group.rssKiB)}`,
    );
    for (const row of group.processes) {
      const footprint = context.footprint instanceof Map ? context.footprint.get(row.pid) : undefined;
      const name = row.count > 1 ? `${row.label} ×${row.count}` : row.label;
      lines.push(
        `  ${name}  pid ${row.pid}  CPU ${formatCpu(row.cpuPercent)} · RSS ${formatKiB(row.rssKiB)}${footprint ? ` · footprint ${footprint}` : ""}`,
      );
    }
  }
  if (context.footprint instanceof Error) lines.push("", `footprint 读取失败：${context.footprint.message}`);
  return `${lines.join("\n")}\n`;
}
