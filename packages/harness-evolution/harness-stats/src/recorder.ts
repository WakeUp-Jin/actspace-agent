import { HARNESS_DURATION_BASE_MS, emptyHarnessHistogram, harnessHistogramIndex, type HarnessRevisionKey, type HarnessRuntimeStatLine } from "@actspace/shared";

/** In-memory key limit; reaching it asks the owner to flush immediately. */
export const HARNESS_STATS_MAX_KEYS = 20_000;
const HOUR_MS = 3_600_000;

export type HarnessStatCell = {
  readonly hour: number;
  readonly revision: HarnessRevisionKey;
  readonly kind: HarnessRuntimeStatLine["kind"];
  readonly plugin: string;
  readonly name: string;
  readonly method: string;
  readonly provider: string | null;
  calls: number;
  errors: number;
  totalMs: number;
  histogram: number[];
};
export type HarnessStatSample = {
  readonly revision: HarnessRevisionKey;
  readonly kind: HarnessRuntimeStatLine["kind"];
  readonly plugin: string;
  readonly name: string;
  readonly method: string;
  readonly provider: string | null;
  readonly ms: number;
  readonly error: boolean;
};

/** Hour x revision x plugin x kind x name x method accumulators. Names, counts and durations only. */
export class HarnessStatsRecorder {
  #cells = new Map<string, HarnessStatCell>();
  readonly #now: () => number;
  readonly #maxKeys: number;
  readonly #onFull: () => void;
  constructor(options: { readonly now?: () => number; readonly maxKeys?: number; readonly onFull?: () => void } = {}) {
    this.#now = options.now ?? Date.now;
    this.#maxKeys = options.maxKeys ?? HARNESS_STATS_MAX_KEYS;
    this.#onFull = options.onFull ?? (() => undefined);
  }
  get size(): number { return this.#cells.size; }

  record(sample: HarnessStatSample): void {
    const hour = Math.floor(this.#now() / HOUR_MS) * HOUR_MS;
    const key = `${hour}\u0000${sample.revision}\u0000${sample.kind}\u0000${sample.plugin}\u0000${sample.name}\u0000${sample.method}`;
    let cell = this.#cells.get(key);
    if (!cell) {
      cell = { hour, revision: sample.revision, kind: sample.kind, plugin: sample.plugin, name: sample.name, method: sample.method, provider: sample.provider, calls: 0, errors: 0, totalMs: 0, histogram: emptyHarnessHistogram() };
      this.#cells.set(key, cell);
    }
    cell.calls++;
    if (sample.error) cell.errors++;
    const ms = Number.isFinite(sample.ms) && sample.ms > 0 ? sample.ms : 0;
    cell.totalMs += ms;
    cell.histogram[harnessHistogramIndex(ms, HARNESS_DURATION_BASE_MS)]++;
    if (this.#cells.size >= this.#maxKeys) this.#onFull();
  }

  /** Hand every accumulated cell to the writer and start from empty. */
  take(): HarnessStatCell[] {
    const cells = [...this.#cells.values()];
    this.#cells = new Map();
    return cells;
  }
  /** Merge cells back after a failed write; new data recorded meanwhile is kept. */
  restore(cells: readonly HarnessStatCell[]): void {
    for (const cell of cells) {
      const key = `${cell.hour}\u0000${cell.revision}\u0000${cell.kind}\u0000${cell.plugin}\u0000${cell.name}\u0000${cell.method}`;
      const current = this.#cells.get(key);
      if (!current) { this.#cells.set(key, cell); continue; }
      current.calls += cell.calls;
      current.errors += cell.errors;
      current.totalMs += cell.totalMs;
      for (let index = 0; index < current.histogram.length; index++) current.histogram[index] += cell.histogram[index] ?? 0;
    }
  }
}

export function cellToLine(cell: HarnessStatCell): HarnessRuntimeStatLine {
  return { v: 1, t: "runtime", hour: new Date(cell.hour).toISOString(), revision: cell.revision, kind: cell.kind, plugin: cell.plugin, name: cell.name, method: cell.method, provider: cell.provider, calls: cell.calls, errors: cell.errors, totalMs: Math.round(cell.totalMs * 1000) / 1000, histogram: cell.histogram };
}
