import type { Stats } from "node:fs";

/** Opaque physical identity shared by the writer proof and query reader. */
export function queryStamp(stat: Stats): string {
  return `${stat.dev}:${stat.ino}:${stat.birthtimeMs}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
}
