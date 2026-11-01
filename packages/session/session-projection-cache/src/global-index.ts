import type { RuntimeV2GlobalSessionSummary } from "@actspace/shared/runtime-v2";

/** A disposable cross-session summary index. Journal replay remains its rebuild path. */
export class GlobalSessionIndex {
  #generation = 0;
  #summaries = new Map<string, RuntimeV2GlobalSessionSummary>();


  get generation(): number { return this.#generation; }
  replace(summary: RuntimeV2GlobalSessionSummary): void {
    const previous = this.#summaries.get(summary.sessionId);
    if (previous && summary.throughJournalSeq < previous.throughJournalSeq) return;
    this.#summaries.set(summary.sessionId, summary);
    this.#generation += 1;
  }

  replaceAll(summaries: readonly RuntimeV2GlobalSessionSummary[]): void {
    this.#summaries = new Map(summaries.map(summary => [summary.sessionId, summary]));
    this.#generation += 1;
  }

  remove(sessionId: string): void { if (this.#summaries.delete(sessionId)) this.#generation += 1; }
  get(sessionId: string): RuntimeV2GlobalSessionSummary | undefined { return this.#summaries.get(sessionId); }
  values(): readonly RuntimeV2GlobalSessionSummary[] { return Object.freeze([...this.#summaries.values()]); }

}
