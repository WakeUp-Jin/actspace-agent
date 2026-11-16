import type { ReleaseEntry, ReleaseSectionType } from "./model";

export type ReleaseTypeCounts = Record<ReleaseSectionType, number>;

export interface ReleaseActivityDay {
  date: string;
  counts: ReleaseTypeCounts;
  total: number;
  release?: { title: string; anchor: string };
}

export interface ReleaseActivity {
  days: ReleaseActivityDay[];
  /** 单日条数的最大值，节奏线按它归一柱高。 */
  maxTotal: number;
  latestDate: string;
  /** 以最近一次发布为终点的 30 天里，有发布的天数。 */
  activeDaysLast30: number;
}

const DAY = 86_400_000;
const time = (date: string) => Date.parse(`${date}T00:00:00Z`);
const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function typeCounts(entry: ReleaseEntry): ReleaseTypeCounts {
  const counts: ReleaseTypeCounts = { feature: 0, improvement: 0, fix: 0 };
  for (const section of entry.sections) counts[section.type] += section.itemsHtml.length;
  return counts;
}

/** 从最早一次到最近一次发布，逐日列出条数；没有发布的日子计 0。entries 需按日期倒序（parser 的输出）。 */
export function buildReleaseActivity(entries: ReleaseEntry[]): ReleaseActivity | undefined {
  const latest = entries[0];
  const earliest = entries.at(-1);
  if (!latest || !earliest) return undefined;

  const byDate = new Map(entries.map((entry) => [entry.date, entry]));
  const days: ReleaseActivityDay[] = [];
  for (let ms = time(earliest.date); ms <= time(latest.date); ms += DAY) {
    const date = isoDate(ms);
    const entry = byDate.get(date);
    const counts = entry ? typeCounts(entry) : { feature: 0, improvement: 0, fix: 0 };
    days.push({
      date,
      counts,
      total: counts.feature + counts.improvement + counts.fix,
      release: entry && { title: entry.title, anchor: entry.anchor },
    });
  }

  const windowStart = time(latest.date) - 29 * DAY;
  return {
    days,
    maxTotal: Math.max(...days.map((day) => day.total)),
    latestDate: latest.date,
    activeDaysLast30: entries.filter((entry) => time(entry.date) >= windowStart).length,
  };
}
