import { DatabaseSync } from "node:sqlite";
import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";
import type { SessionQuerySource } from "@actspace/session-storage";
import { prepare } from "./usage-sql";
import { createReadModelSchema } from "./usage-read-model-schema";
import { projectQueryCatalog } from "./usage-catalog-projection";

type Row = { sessionId: string; title: string | null; revision: number; createdAt: string; updatedAt: string; workspaceRoot: string | null; worktree?: unknown; pinned: boolean; archived: boolean; accessState: string; isChildSession: boolean; sideChatParentId?: string; agentRunCount: number; agentForm?: string; agentMode?: string; agentModeRevision?: number; querySource?: SessionQuerySource };

/** Replays a small Session dataset in the Worker when the disk index is
 * unavailable. Same projection/search semantics; no persistent derived writes. */
export class UsageCatalogFallback {
  readonly database = new DatabaseSync(":memory:");
  #events = 0;
  #bytes = 0;
  #sessions = new Set<string>();
  constructor() { createReadModelSchema(this.database); }
  close(): void { this.database.close(); }
  append(row: Row, events: readonly SessionEventEnvelopeV1[], first: boolean): void {
    this.#events += events.length;
    this.#bytes += Buffer.byteLength(JSON.stringify({ row, events }));
    if (this.#events > 5_000 || this.#bytes > 8 * 1024 * 1024 || (first && this.#sessions.size >= 1_000)) throw new Error("History Session fallback exceeds 1,000 sessions, 5,000 events or 8 MiB. Retry rebuilding the index.");
    if (first) {
      if (this.#sessions.has(row.sessionId)) throw new Error("Duplicate history fallback Session.");
      this.#sessions.add(row.sessionId);
      const inserted = prepare(this.database, "INSERT INTO session_catalog(session_id,title,revision,created_at,updated_at,workspace_root,worktree_json,pinned,archived,access_state,is_child_session,agent_run_count,agent_form,agent_mode,agent_mode_revision,side_chat_parent_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(row.sessionId,row.title,row.revision,new Date(row.createdAt).toISOString(),new Date(row.updatedAt).toISOString(),row.workspaceRoot,row.worktree === undefined ? null : JSON.stringify(row.worktree),Number(row.pinned),Number(row.archived),row.accessState,Number(row.isChildSession),row.agentRunCount,row.agentForm ?? null,row.agentMode ?? null,row.agentModeRevision ?? 0,row.sideChatParentId ?? null);
      prepare(this.database,"INSERT INTO session_search(rowid,session_id,content) VALUES(?,?,?)").run(inserted.lastInsertRowid,row.sessionId,row.title ?? "");
    } else if (!this.#sessions.has(row.sessionId)) throw new Error("Missing history fallback Session.");
    if (row.querySource) projectQueryCatalog(this.database,row.querySource,events,first);
  }
}
