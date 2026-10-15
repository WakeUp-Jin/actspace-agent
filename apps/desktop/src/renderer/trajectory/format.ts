import { T } from "./strings";

/** DSH 计时：小于 1 秒显示整数毫秒，小于 10 秒两位小数，其余一位小数。 */
export function formatDurationMs(milliseconds: number | null | undefined): string {
  if (milliseconds == null || !Number.isFinite(milliseconds)) return "—";
  if (milliseconds < 1_000) return `${Math.round(milliseconds)} 毫秒`;
  return `${(milliseconds / 1_000).toFixed(milliseconds < 10_000 ? 2 : 1)} 秒`;
}

/** Timeline tooltip duration: integer milliseconds with thousands separators. */
export function formatMillis(milliseconds: number | null | undefined): string {
  if (milliseconds == null || !Number.isFinite(milliseconds)) return "—";
  return `${String(Math.round(milliseconds)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} 毫秒`;
}

export const formatTokens = (value: number) => `${value} tok`;
export const formatThroughput = (value: number) => `${value.toFixed(1)} tok/s`;

const two = (value: number) => String(value).padStart(2, "0");
const three = (value: number) => String(value).padStart(3, "0");

/** Local `HH:MM:SS.mmm`. */
export function formatClock(timestamp: number): string {
  const date = new Date(timestamp);
  return `${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}.${three(date.getMilliseconds())}`;
}

/** Local `YYYY-MM-DD HH:MM:SS.mmm`, or 不可用. */
export function formatStartedAt(timestamp: number | null | undefined): string {
  if (timestamp == null || !Number.isFinite(timestamp)) return T.notAvailable;
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${formatClock(timestamp)}`;
}

export const formatUnixSeconds = (timestamp: number) => (timestamp / 1_000).toFixed(3);

export function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
