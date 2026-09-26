import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { projectSessionUsageActivities, type IndexedUsageSource } from "@actspace/client/sessions";
import type { RuntimeV2GlobalSessionSummary, RuntimeV2SessionSnapshot } from "@actspace/shared/runtime-v2";
import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";

type Reader = {
  globalSessionSummaries(): Promise<readonly RuntimeV2GlobalSessionSummary[]>;
  inspectSession(id: string): Promise<RuntimeV2SessionSnapshot>;
  inspectSessionEvents(id: string): Promise<readonly SessionEventEnvelopeV1[]>;
};
type Stored = { readonly version: 1; readonly sources: readonly IndexedUsageSource[] };
type ResetState = { readonly version: 1; readonly resetAt: string };

/** Disposable per-Session Usage rows, keyed by the Global Index and validated against Journal replay. */
export class UsageSourceCache {
  private pending?: Promise<IndexedUsageSource[]>;
  constructor(private readonly reader: Reader, private readonly dataRoot: string, private readonly now: () => Date = () => new Date()) {}
  invalidate(): void { this.pending = undefined; }
  read(): Promise<IndexedUsageSource[]> {
    if (this.pending) return this.pending;
    const task = this.load();
    this.pending = task;
    void task.catch(() => { if (this.pending === task) this.pending = undefined; });
    return task;
  }
  private async load(): Promise<IndexedUsageSource[]> {
    const summaries = await this.reader.globalSessionSummaries();
    let stored: Stored = { version: 1, sources: [] };
    try { const candidate = JSON.parse(await readFile(this.path(), "utf8")) as Stored; if (candidate.version === 1 && Array.isArray(candidate.sources)) stored = candidate; } catch { /* rebuild below */ }
    const reset = await this.ensureResetState();
    const resetAt = reset?.resetAt;
    const previous = new Map(stored.sources.map(source => [source.sessionId, source]));
    const sources: IndexedUsageSource[] = [];
    let changed = Boolean(reset?.created) || stored.sources.length !== summaries.length;
    for (const summary of summaries) {
      const cached = previous.get(summary.sessionId);
      if (!reset?.created && cached?.throughJournalSeq === summary.throughJournalSeq) { sources.push(cached); continue; }
      changed = true;
      // The Journal-derived snapshot is authoritative; a lagging index entry is repaired by this cold read.
      const snapshot = await this.reader.inspectSession(summary.sessionId);
      const revision = snapshot.throughJournalSeq;
      const journal = (await this.reader.inspectSessionEvents(summary.sessionId)).filter(event => event.seq <= revision);
      if ((journal.at(-1)?.seq ?? -1) !== revision) { console.warn(`[usage] Skipping Session ${summary.sessionId}: journal does not reach snapshot seq ${revision}.`); continue; }
      const rows = projectSessionUsageActivities(snapshot, journal).filter((row) => !resetAt || row.startedAt >= resetAt);
      sources.push({ sessionId: summary.sessionId, title: summary.title, throughJournalSeq: revision, rows });
    }
    if (changed) await this.save(sources);
    return sources;
  }
  private async save(sources: readonly IndexedUsageSource[]): Promise<void> {
    const path = this.path(); const temporary = `${path}.${Date.now()}.tmp`;
    await mkdir(this.dataRoot, { recursive: true });
    try { await writeFile(temporary, JSON.stringify({ version: 1, sources }), { mode: 0o600 }); await rename(temporary, path); }
    catch (error) { await unlink(temporary).catch(() => undefined); throw error; }
  }
  private path(): string { return join(this.dataRoot, "global-usage-index.json"); }
  private resetPath(): string { return join(this.dataRoot, "global-usage-reset.json"); }
  private async ensureResetState(): Promise<{ readonly resetAt: string; readonly created: boolean } | undefined> {
    try {
      const state = JSON.parse(await readFile(this.resetPath(), "utf8")) as ResetState;
      return state.version === 1 && typeof state.resetAt === "string" ? { resetAt: state.resetAt, created: false } : undefined;
    } catch (error) {
      if (!isMissingFile(error)) return undefined;
      const resetAt = this.now().toISOString();
      await mkdir(this.dataRoot, { recursive: true });
      await writeFile(this.resetPath(), JSON.stringify({ version: 1, resetAt }), { mode: 0o600 });
      return { resetAt, created: true };
    }
  }
}

function isMissingFile(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT";
}
