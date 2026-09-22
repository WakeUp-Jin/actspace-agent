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

/** Disposable per-Session Usage rows, validated against the durable Global Index. */
export class UsageSourceCache {
  private pending?: Promise<IndexedUsageSource[]>;
  constructor(private readonly reader: Reader, private readonly dataRoot: string) {}
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
    const previous = new Map(stored.sources.map(source => [source.sessionId, source]));
    const sources: IndexedUsageSource[] = [];
    let changed = stored.sources.length !== summaries.length;
    for (const summary of summaries) {
      const cached = previous.get(summary.sessionId);
      if (cached?.throughJournalSeq === summary.throughJournalSeq) { sources.push(cached); continue; }
      const snapshot = await this.reader.inspectSession(summary.sessionId);
      const observed = await this.reader.inspectSessionEvents(summary.sessionId);
      const journal = observed.filter(event => event.seq <= summary.throughJournalSeq);
      if ((journal.at(-1)?.seq ?? -1) !== summary.throughJournalSeq || snapshot.throughJournalSeq !== summary.throughJournalSeq) throw new Error("Usage index revision mismatch");
      sources.push({ sessionId: summary.sessionId, title: summary.title, throughJournalSeq: summary.throughJournalSeq, rows: projectSessionUsageActivities(snapshot, journal) });
      changed = true;
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
}
