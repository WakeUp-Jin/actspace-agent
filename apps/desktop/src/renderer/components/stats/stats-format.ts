// 统计页共用的数字格式（front-统计页规范.md §1）：未知一律「—」，不写 0。

export const DASH = "—";

const known = (value: number | null | undefined): value is number => value != null && Number.isFinite(value);

export function fmtInt(value: number | null | undefined): string {
  return known(value) ? Math.round(value).toLocaleString("zh-CN") : DASH;
}

/** Token：1,234 以下原样，往上 1.2k / 34.5k / 1.2M / 3.4B。 */
export function fmtTokens(value: number | null | undefined): string {
  if (!known(value)) return DASH;
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
  return fmtInt(value);
}

/** 费用 USD：两位小数；`precise` 给单次请求用三位；非零但不到一分写「<$0.01」。 */
export function fmtUsd(value: number | null | undefined, precise = false): string {
  if (!known(value)) return DASH;
  const digits = precise ? 3 : 2;
  const floor = 1 / 10 ** digits;
  if (value > 0 && value < floor) return `<$${floor.toFixed(digits)}`;
  return `$${value.toFixed(digits)}`;
}

/** 耗时：ms / s / 分 / 时。 */
export function fmtDuration(ms: number | null | undefined): string {
  if (!known(ms)) return DASH;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)} 分`;
  return `${(ms / 3_600_000).toFixed(1)} 时`;
}

/** 比例（0–1）转百分数，默认一位小数。 */
export function fmtPct(value: number | null | undefined, digits = 1): string {
  return known(value) ? `${(value * 100).toFixed(digits)}%` : DASH;
}

export function ratio(numerator: number | null | undefined, denominator: number | null | undefined): number | null {
  return known(numerator) && known(denominator) && denominator > 0 ? numerator / denominator : null;
}

export function average(total: number | null | undefined, samples: number | null | undefined): number | null {
  return ratio(total, samples);
}

/** ISO 时间 → 本机 `MM-DD HH:mm`。 */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return DASH;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** ISO 时间 → 今天 / 昨天 / N 天前 / MM-DD。`now` 只给测试用。 */
export function fmtRelativeDay(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return DASH;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return DASH;
  const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days <= 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 7) return `${days} 天前`;
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
