/**
 * 资源监控的纯函数：`ps` 输出解析、后代过滤、CPU 差值、分组。不碰 Electron，便于单测。
 * 口径见 docs/design-docs/frontend/front-资源监控规范.md §4。
 */
import type { ResourceGroup, ResourceGroupId, ResourceProcessRow } from "@actspace/shared";

export interface PsRow {
  readonly pid: number;
  readonly ppid: number;
  readonly rssKiB: number;
  /** 累计 CPU 秒数。 */
  readonly cpuSeconds: number;
  /** 可执行文件名（不含目录）。 */
  readonly name: string;
}

/** `ps` 的 time 列：macOS `mm:ss.cc`（分钟可超过 59），Linux `[DD-]HH:MM:SS`。 */
export function parsePsTime(value: string): number | null {
  const [days, clock] = value.includes("-") ? value.split("-", 2) : ["0", value];
  const parts = clock!.split(":").map(Number);
  if (parts.length < 2 || parts.length > 3 || parts.some(part => !Number.isFinite(part))) return null;
  const [seconds, minutes, hours = 0] = parts.reverse() as [number, number, number?];
  const dayCount = Number(days);
  if (!Number.isFinite(dayCount)) return null;
  return ((dayCount * 24 + hours) * 60 + minutes) * 60 + seconds;
}

function basename(path: string): string {
  const trimmed = path.trim();
  const slash = trimmed.lastIndexOf("/");
  return slash === -1 ? trimmed : trimmed.slice(slash + 1);
}

/** 解析 `ps -A -o pid=,ppid=,rss=,time=,comm=`；comm 在最后，可以含空格。坏行跳过。 */
export function parsePsOutput(stdout: string): PsRow[] {
  const rows: PsRow[] = [];
  for (const line of stdout.split("\n")) {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.+?)\s*$/.exec(line);
    if (!match) continue;
    const cpuSeconds = parsePsTime(match[4]!);
    if (cpuSeconds === null) continue;
    rows.push({ pid: Number(match[1]), ppid: Number(match[2]), rssKiB: Number(match[3]), cpuSeconds, name: basename(match[5]!) || match[5]! });
  }
  return rows;
}

/**
 * `root` 的全部后代（不含 root 自己）。整机进程表只扫一遍建索引。
 * `skip` 里的进程（Electron 自己的子进程、本次 `ps`）连同它们的后代都不算。
 */
export function descendantsOf(rows: readonly PsRow[], root: number, skip: ReadonlySet<number> = new Set()): PsRow[] {
  const children = new Map<number, PsRow[]>();
  for (const row of rows) {
    if (row.pid === row.ppid) continue;
    const list = children.get(row.ppid);
    if (list) list.push(row);
    else children.set(row.ppid, [row]);
  }
  const found: PsRow[] = [];
  const queue = [root];
  const seen = new Set<number>([root]);
  while (queue.length > 0) {
    for (const child of children.get(queue.pop()!) ?? []) {
      if (seen.has(child.pid) || skip.has(child.pid)) continue;
      seen.add(child.pid);
      found.push(child);
      queue.push(child.pid);
    }
  }
  return found;
}

/**
 * 累计 CPU 秒数 → 两次读数之间的单核百分比。每个 pid 记上一次的读数；没见过的 pid 返回 null。
 * `retain` 之后只保留本轮出现过的 pid，进程退出后不会一直占着内存。
 */
export class CpuDeltaTracker {
  private previous = new Map<number, { readonly seconds: number; readonly at: number }>();
  private current = new Map<number, { readonly seconds: number; readonly at: number }>();

  percent(pid: number, cumulativeSeconds: number, atMs: number): number | null {
    this.current.set(pid, { seconds: cumulativeSeconds, at: atMs });
    const before = this.previous.get(pid);
    if (!before || atMs <= before.at) return null;
    const delta = cumulativeSeconds - before.seconds;
    // pid 被复用时累计值会变小，这一轮当作没见过。
    if (delta < 0) return null;
    return (delta / ((atMs - before.at) / 1000)) * 100;
  }

  /** 结束一轮读数：本轮的读数成为下一轮的基准。 */
  commit(): void {
    this.previous = this.current;
    this.current = new Map();
  }
}

/** Electron 进程（`app.getAppMetrics()` 的一行）需要的字段。 */
export interface ElectronProcessReading {
  readonly pid: number;
  readonly type: string;
  readonly name?: string;
  readonly cpuPercent: number | null;
  readonly rssKiB: number;
}

const ELECTRON_LABELS: Record<string, string> = { Browser: "主进程", GPU: "GPU", Tab: "界面" };

export function electronGroupOf(reading: Pick<ElectronProcessReading, "pid" | "type">, monitorPids: ReadonlySet<number>): ResourceGroupId {
  if (monitorPids.has(reading.pid)) return "monitor";
  if (reading.type === "Browser") return "main";
  if (reading.type === "Tab") return "renderer";
  if (reading.type === "GPU") return "gpu";
  return "utility";
}

function electronLabel(reading: ElectronProcessReading, group: ResourceGroupId): string {
  if (group === "monitor") return "悬浮窗";
  return reading.name || ELECTRON_LABELS[reading.type] || reading.type;
}

function sumCpu(values: readonly (number | null)[]): number | null {
  let total: number | null = null;
  for (const value of values) if (value !== null) total = (total ?? 0) + value;
  return total;
}

/** 子进程按可执行文件名合并：`node ×3`。CPU 只加已知的；全部未知时为 null。 */
export function mergeByName(rows: readonly ResourceProcessRow[]): ResourceProcessRow[] {
  const merged = new Map<string, { pid: number; count: number; cpu: (number | null)[]; rssKiB: number }>();
  for (const row of rows) {
    const entry = merged.get(row.label);
    if (entry) {
      entry.count += row.count;
      entry.cpu.push(row.cpuPercent);
      entry.rssKiB += row.rssKiB;
    } else merged.set(row.label, { pid: row.pid, count: row.count, cpu: [row.cpuPercent], rssKiB: row.rssKiB });
  }
  return [...merged].map(([label, entry]) => ({ pid: entry.pid, label, count: entry.count, cpuPercent: sumCpu(entry.cpu), rssKiB: entry.rssKiB }))
    .sort((a, b) => b.rssKiB - a.rssKiB);
}

export interface GroupInput {
  readonly electron: readonly ElectronProcessReading[];
  readonly monitorPids: ReadonlySet<number>;
  /** 已排除 Electron 自身进程的后代子进程。 */
  readonly agent: readonly ResourceProcessRow[];
  /** 监控在主进程里的耗时等额外行；它们的 CPU 已从主进程那一行扣掉。 */
  readonly monitorChildren: readonly ResourceProcessRow[];
}

/** 按固定顺序产出六组；空组也保留（界面上写 0）。 */
export function buildGroups(input: GroupInput): ResourceGroup[] {
  const rows: Record<ResourceGroupId, ResourceProcessRow[]> = { main: [], renderer: [], gpu: [], utility: [], agent: [], monitor: [] };
  for (const reading of input.electron) {
    const group = electronGroupOf(reading, input.monitorPids);
    rows[group].push({ pid: reading.pid, label: electronLabel(reading, group), count: 1, cpuPercent: reading.cpuPercent, rssKiB: reading.rssKiB });
  }
  rows.agent.push(...mergeByName(input.agent));
  rows.monitor.push(...input.monitorChildren);
  return (Object.keys(rows) as ResourceGroupId[]).map(id => ({
    id,
    cpuPercent: sumCpu(rows[id].map(row => row.cpuPercent)) ?? 0,
    rssKiB: rows[id].reduce((total, row) => total + row.rssKiB, 0),
    processes: rows[id],
  }));
}
