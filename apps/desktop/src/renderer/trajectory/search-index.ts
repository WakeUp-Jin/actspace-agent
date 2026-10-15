import type { TrajectoryCell, TrajectoryRecord } from "./contract";

const searchText = (record: TrajectoryRecord) => JSON.stringify({
  eventType: record.eventType, kind: record.kind, state: record.state, summary: record.summary, preview: record.preview, result: record.result,
  raw: record.raw, request: record.requestDetail, schema: record.schemaDetail, input: record.inputDetail, output: record.outputDetail, sourceBlocks: record.sourceBlocks,
}).toLocaleLowerCase();

/** DSH TrajectorySearchIndex: one entry per record id; a record whose object is unchanged keeps its text. */
export class TrajectorySearchIndex {
  private entries = new Map<string, { readonly record: TrajectoryRecord; readonly text: string }>();
  /** Texts generated so far, for tests. */
  generated = 0;

  /** Returns whether any entry was added, replaced or removed. */
  update(cells: Iterable<TrajectoryCell>): boolean {
    const next = new Map<string, { readonly record: TrajectoryRecord; readonly text: string }>();
    let changed = false;
    for (const cell of cells) {
      if (cell.requestOnly) continue;
      const entry = this.entries.get(cell.recordId);
      if (entry?.record === cell.record) {
        next.set(cell.recordId, entry);
        continue;
      }
      changed = true;
      this.generated += 1;
      next.set(cell.recordId, { record: cell.record, text: searchText(cell.record) });
    }
    changed ||= next.size !== this.entries.size;
    this.entries = next;
    return changed;
  }

  /** Record ids matching every whitespace-separated term, or null for an empty query. */
  search(query: string): ReadonlySet<string> | null {
    const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return null;
    const result = new Set<string>();
    for (const [id, entry] of this.entries) if (terms.every(term => entry.text.includes(term))) result.add(id);
    return result;
  }
}
