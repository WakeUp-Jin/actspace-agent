import { projectSessionUsageActivities } from "@actspace/client/sessions";
import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";
import { DatabaseSync } from "node:sqlite";
import { createReadModelSchema } from "./usage-read-model-schema";
import { insertUsageActivities } from "./usage-activity-write";
import { prepare } from "./usage-sql";
import { compactUsageEvent, type UsageJournalSource } from "./usage-journal-projection";
import { titleText } from "./usage-catalog-projection";

/** Emergency query over a complete, bounded Session dataset. Lives only in the query Worker;
 * explicit budgets prevent a broken index from causing an unbounded Main scan. */
export class UsageSessionFallback {
  #sources = new Map<string, { source: UsageJournalSource; events: SessionEventEnvelopeV1[] }>();
  #bytes = 0;
  #events = 0;
  append(source: UsageJournalSource, events: readonly SessionEventEnvelopeV1[]): void {
    let entry = this.#sources.get(source.sessionId);
    if (!entry) {
      if (this.#sources.size >= 1_000) throw new Error("Session fallback exceeds 1,000 sessions; repair index to query this dataset.");
      this.#bytes += Buffer.byteLength(JSON.stringify(source));
      if (this.#bytes > 8 * 1024 * 1024) throw new Error("Session fallback exceeds 8 MiB projection budget.");
      entry = { source: { ...source }, events: [] }; this.#sources.set(source.sessionId, entry);
    }
    for (const event of events) {
      if (++this.#events > 5_000) throw new Error("Session fallback exceeds 5,000 events; repair index to query this dataset.");
      const reduced = compactUsageEvent(event);
      // Preserve the projection's first-pass turn/run association without bodies.
      const data = event.data as Record<string, unknown> | null;
      const previousMetadataBytes = Buffer.byteLength(JSON.stringify([entry.source.title, entry.source.workspaceRoot]));
      if (event.type === "session/title-set") entry.source.title = typeof data?.title === "string" ? titleText(data.title) : null;
      if (event.type === "session/workspace-set" && typeof data?.workspaceRoot === "string" && data.workspaceRoot.trim()) entry.source.workspaceRoot = data.workspaceRoot;
      this.#bytes += Buffer.byteLength(JSON.stringify([entry.source.title, entry.source.workspaceRoot])) - previousMetadataBytes;
      if (this.#bytes > 8 * 1024 * 1024) throw new Error("Session fallback exceeds 8 MiB projection budget.");
      const relation = data && typeof data.turnId === "string" && typeof data.agentRunId === "string" ? { ...event, surface: null, data: { turnId: data.turnId, agentRunId: data.agentRunId }, type: "usage/run-association" } as SessionEventEnvelopeV1 : undefined;
      for (const value of [relation, reduced]) if (value) {
        this.#bytes += Buffer.byteLength(JSON.stringify(value));
        if (this.#bytes > 8 * 1024 * 1024) throw new Error("Session fallback exceeds 8 MiB projection budget.");
        entry.events.push(value);
      }
    }
  }
  materialize(): DatabaseSync {
    const database = new DatabaseSync(":memory:");
    try {
      createReadModelSchema(database);
      database.exec("PRAGMA temp_store=MEMORY; BEGIN IMMEDIATE");
      for (const { source, events } of this.#sources.values()) {
        const inserted = prepare(database, "INSERT INTO session_catalog(session_id,title,revision,workspace_root) VALUES(?,?,?,?)").run(source.sessionId, source.title, source.throughJournalSeq, source.workspaceRoot);
        prepare(database, "INSERT INTO session_search(rowid,session_id,content) VALUES(?,?,?)").run(inserted.lastInsertRowid, source.sessionId, source.title ?? "");
        const rows = projectSessionUsageActivities({ ...source, metadata: { title: source.title, pinned: false, archived: false } }, events);
        insertUsageActivities(database, { ...source, rows });
        prepare(database, "INSERT INTO index_state(key,value) VALUES(?,?)").run(`session:${source.sessionId}`, String(source.throughJournalSeq));
      }
      database.exec("COMMIT");
      return database;
    } catch (error) { database.close(); throw error; }
  }
}
