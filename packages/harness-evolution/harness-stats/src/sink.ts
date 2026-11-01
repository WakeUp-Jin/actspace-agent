import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { HarnessHealthLine, HarnessStatsFileLine } from "@actspace/shared";

export type HarnessStatsFileSystem = {
  readonly mkdir: (path: string, options: { readonly recursive: true }) => Promise<unknown>;
  readonly appendFile: (path: string, data: string, encoding: "utf8") => Promise<void>;
};
const nodeFileSystem: HarnessStatsFileSystem = { mkdir: (path, options) => mkdir(path, options), appendFile: (path, data, encoding) => appendFile(path, data, encoding) };

/** `<dataRoot>/harness-stats/YYYY-MM.jsonl` (UTC month of the line's own time), one JSON object per line. */
export function harnessStatsDirectory(dataRoot: string): string { return join(dataRoot, "harness-stats"); }

function monthOf(line: HarnessStatsFileLine): string {
  return (line.t === "runtime" ? line.hour : line.at).slice(0, 7);
}

export class HarnessStatsSink {
  readonly #dir: string;
  readonly #fs: HarnessStatsFileSystem;
  readonly #now: () => number;
  #failures = 0;
  #reported = 0;
  constructor(options: { readonly dataRoot: string; readonly now?: () => number; readonly fileSystem?: HarnessStatsFileSystem }) {
    this.#dir = harnessStatsDirectory(options.dataRoot);
    this.#fs = options.fileSystem ?? nodeFileSystem;
    this.#now = options.now ?? Date.now;
  }
  get writeFailures(): number { return this.#failures; }

  /** Append lines grouped by month. Returns the lines that could not be written; the caller keeps them for the next try. */
  async append(lines: readonly HarnessStatsFileLine[]): Promise<readonly HarnessStatsFileLine[]> {
    if (!lines.length) return [];
    const groups = new Map<string, HarnessStatsFileLine[]>();
    for (const line of lines) {
      const month = monthOf(line);
      const group = groups.get(month);
      if (group) group.push(line); else groups.set(month, [line]);
    }
    // Earlier failures are reported once, inside the first month group that gets written.
    // writeFailures is a delta (new failures since the last reported line), so readers can sum lines across restarts.
    const reportedUpTo = this.#failures;
    const health: HarnessHealthLine | undefined = reportedUpTo > this.#reported
      ? { v: 1, t: "health", at: new Date(this.#now()).toISOString(), writeFailures: reportedUpTo - this.#reported }
      : undefined;
    const failed: HarnessStatsFileLine[] = [];
    let healthMonth = health ? [...groups.keys()][0] : undefined;
    let dirReady = false;
    for (const [month, group] of groups) {
      const text = (health && month === healthMonth ? [health, ...group] : group).map(line => JSON.stringify(line)).join("\n") + "\n";
      try {
        if (!dirReady) { await this.#fs.mkdir(this.#dir, { recursive: true }); dirReady = true; }
        await this.#fs.appendFile(join(this.#dir, `${month}.jsonl`), text, "utf8");
        if (health && month === healthMonth) { this.#reported = Math.max(this.#reported, reportedUpTo); healthMonth = undefined; }
      } catch {
        this.#failures++;
        failed.push(...group);
      }
    }
    return failed;
  }
}
