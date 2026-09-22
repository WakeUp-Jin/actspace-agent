import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RuntimeV2GlobalSessionSummary } from "@actspace/shared/runtime-v2";

type StoredIndex = { readonly version: 1; readonly generation: number; readonly summaries: readonly RuntimeV2GlobalSessionSummary[] };

/** A disposable cross-session summary index. Journal replay remains its rebuild path. */
export class GlobalSessionIndex {
  #generation = 0;
  #summaries = new Map<string, RuntimeV2GlobalSessionSummary>();
  #loaded = false;
  constructor(private readonly root: string, private readonly warn?: (error: unknown) => void) {}

  get generation(): number { return this.#generation; }
  get loaded(): boolean { return this.#loaded; }

  async load(): Promise<boolean> {
    if (this.#loaded) return true;
    try {
      const value = JSON.parse(await readFile(this.path(), "utf8")) as StoredIndex;
      if (value.version !== 1 || !Number.isSafeInteger(value.generation) || !Array.isArray(value.summaries)) throw new Error("Invalid global session index.");
      this.#generation = value.generation;
      this.#summaries = new Map(value.summaries.filter(item => item && typeof item.sessionId === "string").map(item => [item.sessionId, item]));
      this.#loaded = true;
      return true;
    } catch {
      this.#loaded = true;
      return false;
    }
  }

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
  values(): readonly RuntimeV2GlobalSessionSummary[] { return Object.freeze([...this.#summaries.values()]); }

  async save(): Promise<void> {
    const path = this.path();
    const temporary = `${path}.${Date.now()}.tmp`;
    try {
      await mkdir(this.root, { recursive: true });
      await writeFile(temporary, JSON.stringify({ version: 1, generation: this.#generation, summaries: this.values() }), { mode: 0o600 });
      await rename(temporary, path);
    } catch (error) {
      this.warn?.(error);
      await unlink(temporary).catch(() => undefined);
    }
  }

  private path(): string { return join(this.root, "global-session-index.json"); }
}
