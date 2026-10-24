import { enableUsageBatchWrites } from "./usage-batch-write";
import { createContextHistorySchema } from "./context-history-projection";
import { createSyncSchema } from "./read-model-sync";
import { createUsageJournalSchema } from "./usage-journal-projection";
import { createUsageRollups } from "./usage-rollups";
import type { DatabaseSync } from "node:sqlite";

/** Shared schema for the durable index and bounded in-memory Session fallback.
 * v10 replays history omitted by the former automatic Usage reset boundary;
 * v13 adds indexed unknown-token dimensions to activity and aggregate rollups;
 * v14 excludes Session-owned auxiliary usage from derived Run counts. */
export function createReadModelSchema(db: DatabaseSync): void {
  db.exec(`
    PRAGMA application_id = 0x41555332;
    PRAGMA user_version = 14;
    CREATE TABLE IF NOT EXISTS usage_write_mode(batching INTEGER NOT NULL) STRICT;
    INSERT INTO usage_write_mode SELECT 0 WHERE NOT EXISTS(SELECT 1 FROM usage_write_mode);
    CREATE TABLE IF NOT EXISTS session_catalog (
      session_id TEXT PRIMARY KEY,
      title TEXT,
      revision INTEGER NOT NULL,
      created_at TEXT,
      updated_at TEXT,
      workspace_root TEXT,
      worktree_json TEXT,
      pinned INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      access_state TEXT NOT NULL DEFAULT 'read-write',
      is_child_session INTEGER NOT NULL DEFAULT 0,
      agent_run_count INTEGER NOT NULL DEFAULT 0,
      agent_form TEXT,
      agent_mode TEXT,
      agent_mode_revision INTEGER,
      has_pending_tasks INTEGER
    ) STRICT;
    CREATE TABLE IF NOT EXISTS catalog_pending_tasks(session_id TEXT NOT NULL,task_id TEXT NOT NULL,run_id TEXT,state TEXT NOT NULL,PRIMARY KEY(session_id,task_id),FOREIGN KEY(session_id) REFERENCES session_catalog(session_id) ON DELETE CASCADE) STRICT;
    CREATE TABLE IF NOT EXISTS usage_activity (
      activity_id TEXT PRIMARY KEY,
      search_key TEXT NOT NULL,
      session_id TEXT NOT NULL,
      session_title TEXT,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      model TEXT,
      model_key TEXT,
      provider_id TEXT,
      connection_id TEXT,
      tool_name TEXT,
      agent_run_id TEXT NOT NULL,
      turn_id TEXT,
      step_id TEXT,
      request_id TEXT,
      retry_id TEXT,
      retry_of_request_id TEXT,
      source_event_seq INTEGER NOT NULL,
      workspace_root TEXT,
      duration_ms REAL,
      input_tokens INTEGER,
      output_tokens INTEGER,
      cache_read_tokens INTEGER,
      cache_write_tokens INTEGER,
      reasoning_tokens INTEGER,
      total_tokens INTEGER,
      input_tokens_unknown INTEGER GENERATED ALWAYS AS (input_tokens IS NULL) STORED,
      output_tokens_unknown INTEGER GENERATED ALWAYS AS (output_tokens IS NULL) STORED,
      cache_read_tokens_unknown INTEGER GENERATED ALWAYS AS (cache_read_tokens IS NULL) STORED,
      cache_write_tokens_unknown INTEGER GENERATED ALWAYS AS (cache_write_tokens IS NULL) STORED,
      reasoning_tokens_unknown INTEGER GENERATED ALWAYS AS (reasoning_tokens IS NULL) STORED,
      total_tokens_unknown INTEGER GENERATED ALWAYS AS (total_tokens IS NULL) STORED,
      cost_usd REAL,
      cost_amount REAL,
      cost_currency TEXT,
      historical_unverified INTEGER NOT NULL,
      row_json TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES session_catalog(session_id) ON DELETE CASCADE
    ) STRICT;
    CREATE INDEX IF NOT EXISTS usage_activity_started_idx ON usage_activity(started_at DESC, source_event_seq DESC, activity_id DESC);
    CREATE INDEX IF NOT EXISTS usage_activity_kind_page_idx ON usage_activity(kind, started_at DESC, source_event_seq DESC, activity_id DESC);
    CREATE INDEX IF NOT EXISTS usage_activity_status_page_idx ON usage_activity(status, started_at DESC, source_event_seq DESC, activity_id DESC);
    CREATE INDEX IF NOT EXISTS usage_activity_model_page_idx ON usage_activity(model, started_at DESC, source_event_seq DESC, activity_id DESC);
    CREATE INDEX IF NOT EXISTS usage_activity_provider_page_idx ON usage_activity(provider_id, started_at DESC, source_event_seq DESC, activity_id DESC);
    CREATE INDEX IF NOT EXISTS usage_activity_search_idx ON usage_activity(search_key,started_at DESC,source_event_seq DESC,activity_id DESC);
    CREATE INDEX IF NOT EXISTS usage_activity_session_idx ON usage_activity(session_id, source_event_seq);
    CREATE INDEX IF NOT EXISTS usage_activity_filter_idx ON usage_activity(kind, status, started_at);
    CREATE TABLE IF NOT EXISTS usage_search_dimensions(search_key TEXT PRIMARY KEY,content TEXT NOT NULL,ref_count INTEGER NOT NULL) STRICT;
    CREATE VIRTUAL TABLE IF NOT EXISTS search_documents USING fts5(search_key UNINDEXED,content);
    CREATE TRIGGER IF NOT EXISTS usage_dimensions_search_insert AFTER INSERT ON usage_search_dimensions BEGIN
      INSERT INTO search_documents(rowid,search_key,content) VALUES(new.rowid,new.search_key,new.content);
    END;
    CREATE TRIGGER IF NOT EXISTS usage_dimensions_search_delete AFTER DELETE ON usage_search_dimensions BEGIN
      DELETE FROM search_documents WHERE rowid=old.rowid;
    END;
    CREATE TRIGGER IF NOT EXISTS usage_dimensions_insert AFTER INSERT ON usage_activity WHEN (SELECT batching FROM usage_write_mode)=0 BEGIN
      INSERT INTO usage_search_dimensions VALUES(new.search_key,COALESCE(new.model,'')||' '||COALESCE(new.provider_id,'')||' '||COALESCE(new.connection_id,'')||' '||COALESCE(new.tool_name,''),1) ON CONFLICT(search_key) DO UPDATE SET ref_count=ref_count+1;
    END;
    CREATE TRIGGER IF NOT EXISTS usage_dimensions_delete AFTER DELETE ON usage_activity BEGIN
      UPDATE usage_search_dimensions SET ref_count=ref_count-1 WHERE search_key=old.search_key;
      DELETE FROM usage_search_dimensions WHERE search_key=old.search_key AND ref_count=0;
    END;
    CREATE VIRTUAL TABLE IF NOT EXISTS session_excerpt_search USING fts5(session_id UNINDEXED,event_seq UNINDEXED,content);
    CREATE VIRTUAL TABLE IF NOT EXISTS session_search USING fts5(session_id UNINDEXED, content);
    CREATE TABLE IF NOT EXISTS index_state (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
  `);
  db.exec("CREATE INDEX IF NOT EXISTS session_catalog_page_idx ON session_catalog(archived, COALESCE(json_extract(worktree_json,'$.sourceWorkspaceRoot'),workspace_root,''), pinned, updated_at DESC,session_id ASC)");
  createUsageJournalSchema(db);
  createUsageRollups(db);
  createSyncSchema(db);
  createContextHistorySchema(db);
  enableUsageBatchWrites(db);
}
