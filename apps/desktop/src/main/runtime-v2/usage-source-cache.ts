import type { RuntimeV2SessionSnapshot } from "@actspace/shared/runtime-v2";
import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";

type Source = { snapshot: RuntimeV2SessionSnapshot; journal: readonly SessionEventEnvelopeV1[] };
type Reader = {
  listSessions(): Promise<readonly { sessionId: string }[]>;
  inspectSession(id: string): Promise<RuntimeV2SessionSnapshot>;
  inspectSessionEvents(id: string): Promise<readonly SessionEventEnvelopeV1[]>;
};

/** Durable notifications invalidate source reads; changing page/filter only reruns the pure projection. */
export class UsageSourceCache {
  private pending?: Promise<Source[]>;
  constructor(private readonly reader: Reader) {}
  invalidate(): void { this.pending = undefined; }
  read(): Promise<Source[]> {
    if (this.pending) return this.pending;
    const task = this.load();
    this.pending = task;
    void task.catch(() => { if (this.pending === task) this.pending = undefined; });
    return task;
  }
  private async load(): Promise<Source[]> {
    const sessions = await this.reader.listSessions();
    return Promise.all(sessions.map(async ({ sessionId }) => {
      const snapshot = await this.reader.inspectSession(sessionId);
      const observed = await this.reader.inspectSessionEvents(sessionId);
      const journal = observed.filter((event) => event.seq <= snapshot.throughJournalSeq);
      if ((journal.at(-1)?.seq ?? -1) !== snapshot.throughJournalSeq) throw new Error("Usage Journal revision mismatch");
      return { snapshot, journal };
    }));
  }
}
