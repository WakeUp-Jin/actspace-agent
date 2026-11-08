import type { HarnessMountObserver } from "@actspace/cordis-adapter";
import { harnessRevisionKey, type HarnessInventoryLine, type HarnessPluginSource, type HarnessRevisionKey, type HarnessStatsFileLine, type HarnessToolOwnerLine } from "@actspace/shared";
import { createPluginObservation } from "./instrument.js";
import { HarnessStatsRecorder, cellToLine, type HarnessStatCell } from "./recorder.js";
import { HarnessStatsSink, type HarnessStatsFileSystem } from "./sink.js";

export const HARNESS_STATS_FLUSH_INTERVAL_MS = 60_000;
const HARNESS_STATS_FULL_RETRY_MS = 5_000;
export const HARNESS_STATS_ENV = "ACTSPACE_HARNESS_STATS";

/** `ACTSPACE_HARNESS_STATS=0` turns statistics off completely. */
export function harnessStatsEnabled(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env[HARNESS_STATS_ENV] !== "0";
}

/** What the generation manager holds for one prepared Harness mount. */
export interface HarnessMountObservation {
  readonly observer: HarnessMountObserver;
  /** The mount became the selected version: stamp it with its revision and write its inventory. */
  activated(revision: number): void;
  /** The mount failed to come up: still write the inventory so load failures are visible. */
  failed(): void;
  /** The mount was thrown away without ever being selected: nothing is written. */
  discarded(): void;
}
export type HarnessMountIdentity = { readonly harnessId: string; readonly expectedRevision: number };
export type HarnessMountObserverFactory = (identity: HarnessMountIdentity) => HarnessMountObservation;

export type HarnessStatsOptions = {
  readonly dataRoot: string;
  readonly flushIntervalMs?: number;
  readonly maxKeys?: number;
  readonly now?: () => number;
  readonly fileSystem?: HarnessStatsFileSystem;
};

type Load = { ok: boolean; error: string | null; loadMs: number | null };

function pluginSource(origin: string | undefined): HarnessPluginSource {
  return origin === "builtin" || origin === "user" || origin === "evolved" ? origin : "unknown";
}
function describeError(error: unknown): string {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return text.length > 300 ? `${text.slice(0, 300)}...` : text;
}

/** Host-owned recorder: outlives every Harness mount, so switching versions never drops counts. */
export class HarnessStats {
  readonly #recorder: HarnessStatsRecorder;
  readonly #sink: HarnessStatsSink;
  readonly #now: () => number;
  #pending: HarnessStatsFileLine[] = [];
  #queue: Promise<void> = Promise.resolve();
  #timer: ReturnType<typeof setInterval> | undefined;
  #fullScheduled = false;
  #lastFullAttempt = Number.NEGATIVE_INFINITY;
  #disposed = false;

  constructor(options: HarnessStatsOptions) {
    this.#now = options.now ?? Date.now;
    this.#sink = new HarnessStatsSink({ dataRoot: options.dataRoot, ...(options.fileSystem ? { fileSystem: options.fileSystem } : {}) });
    this.#recorder = new HarnessStatsRecorder({ now: this.#now, ...(options.maxKeys === undefined ? {} : { maxKeys: options.maxKeys }), onFull: () => this.#flushSoon() });
    this.#timer = setInterval(() => { if (this.#recorder.size || this.#pending.length) void this.flush(); }, options.flushIntervalMs ?? HARNESS_STATS_FLUSH_INTERVAL_MS);
    this.#timer.unref?.();
  }

  get writeFailures(): number { return this.#sink.writeFailures; }

  /** Bind to `HarnessGenerations`. One observation per prepared mount. */
  readonly observeMount: HarnessMountObserverFactory = identity => {
    const revision = { key: harnessRevisionKey(identity.harnessId, identity.expectedRevision + 1) as HarnessRevisionKey };
    const loads = new Map<string, Load>();
    let origins: ReadonlyMap<string, { readonly origin: string | undefined; readonly provides: readonly string[] }> = new Map();
    const owners: HarnessToolOwnerLine[] = [];
    let state: "mounting" | "active" | "closed" = "mounting";
    const observer: HarnessMountObserver = { observePlugin: (info, all) => {
      if (!origins.size) origins = new Map(all.map(entry => [entry.id, { origin: entry.origin, provides: entry.provides }]));
      return createPluginObservation(info, all, {
        revision: () => revision.key,
        record: sample => { if (!this.#disposed) this.#recorder.record(sample); },
        toolRegistered: (plugin, tool, toolPluginId) => {
          const line: HarnessToolOwnerLine = { v: 1, t: "tool-owner", at: new Date(this.#now()).toISOString(), revision: revision.key, plugin, toolPluginId, tool };
          if (state === "active") this.#enqueue(line); else if (state === "mounting") owners.push(line);
        },
        applied: (plugin, result) => {
          if (result) loads.set(plugin, { ok: result.ok, error: result.ok ? null : describeError(result.error), loadMs: Math.round(result.ms * 1000) / 1000 });
        },
      });
    } };
    const writeInventory = () => {
      const at = new Date(this.#now()).toISOString();
      for (const [plugin, meta] of origins) {
        const load = loads.get(plugin);
        const line: HarnessInventoryLine = { v: 1, t: "inventory", at, revision: revision.key, plugin, source: pluginSource(meta.origin), provides: meta.provides, loadMs: load?.loadMs ?? null, ok: load?.ok ?? true, error: load?.error ?? null };
        this.#enqueue(line);
      }
      for (const line of owners) this.#enqueue(line);
      owners.length = 0;
    };
    return {
      observer,
      activated: finalRevision => {
        if (state !== "mounting") return;
        revision.key = harnessRevisionKey(identity.harnessId, finalRevision);
        for (let index = 0; index < owners.length; index++) owners[index] = { ...owners[index]!, revision: revision.key };
        writeInventory();
        state = "active";
      },
      failed: () => { if (state === "mounting") { writeInventory(); state = "closed"; } },
      discarded: () => { if (state === "mounting") { owners.length = 0; state = "closed"; } },
    };
  };

  /** Write everything accumulated so far. Never rejects; failures are counted and the data stays for the next try. */
  flush(): Promise<void> {
    const run = this.#queue.then(() => this.#flushOnce(), () => this.#flushOnce());
    this.#queue = run.catch(() => undefined);
    return this.#queue;
  }
  /** Stop the timer and write the remainder. Later samples are ignored. */
  async dispose(): Promise<void> {
    if (this.#timer) { clearInterval(this.#timer); this.#timer = undefined; }
    await this.flush();
    this.#disposed = true;
  }

  #enqueue(line: HarnessStatsFileLine): void { if (!this.#disposed) this.#pending.push(line); }
  #flushSoon(): void {
    // While the disk keeps failing, retry the over-limit flush at most every few seconds.
    if (this.#fullScheduled || this.#now() - this.#lastFullAttempt < HARNESS_STATS_FULL_RETRY_MS) return;
    this.#fullScheduled = true;
    this.#lastFullAttempt = this.#now();
    void this.flush().finally(() => { this.#fullScheduled = false; });
  }
  async #flushOnce(): Promise<void> {
    const cells = this.#recorder.take();
    const others = this.#pending;
    this.#pending = [];
    if (!cells.length && !others.length) return;
    const byLine = new Map<HarnessStatsFileLine, HarnessStatCell>();
    const lines: HarnessStatsFileLine[] = [...others];
    for (const cell of cells) { const line = cellToLine(cell); byLine.set(line, cell); lines.push(line); }
    let failed: readonly HarnessStatsFileLine[];
    try { failed = await this.#sink.append(lines); }
    catch { failed = lines; }
    if (!failed.length) return;
    const restoredCells: HarnessStatCell[] = [];
    const restoredLines: HarnessStatsFileLine[] = [];
    for (const line of failed) { const cell = byLine.get(line); if (cell) restoredCells.push(cell); else restoredLines.push(line); }
    this.#recorder.restore(restoredCells);
    this.#pending = [...restoredLines, ...this.#pending];
  }
}
