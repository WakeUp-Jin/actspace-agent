import { writeUsageBatch } from "./usage-batch-write";
import type { DatabaseSync } from "node:sqlite";
import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";
import { prepare, type ProjectionDatabase } from "./usage-sql";
import { insertUsageActivities } from "./usage-activity-write";
import { projectQueryCatalog } from "./usage-catalog-projection";
import { projectUsageJournalBatch, type UsageJournalSource } from "./usage-journal-projection";

export type JournalBatch = { catalogOnly?: boolean; source: UsageJournalSource; events: readonly SessionEventEnvelopeV1[]; cursor: string; first: boolean; final: boolean; reset: boolean };
export type JournalState = { revision: number | null; cursor?: string; stamp?: string; codecSetDigest?: string; building?: boolean };
type Build = { target: number; stamp: string; codec: string; revision: number; cursor: string | null };
const tables = ["session_catalog", "catalog_pending_tasks", "usage_activity", "usage_projection_events", "usage_projection_requests", "usage_projection_groups", "usage_projection_turns", "session_excerpt_search", "session_search"] as const;
const tablePattern = new RegExp(`\\b(${tables.join("|")})\\b`, "g");
const namespace = (catalog: boolean) => catalog ? "building_catalog_" : "building_usage_";
const publishedOnlyIndexes = ["usage_activity_started_idx", "usage_activity_kind_page_idx", "usage_activity_status_page_idx", "usage_activity_model_page_idx", "usage_activity_provider_page_idx", "usage_activity_search_idx", "usage_activity_filter_idx"];
const adapters = new WeakMap<DatabaseSync, Map<string, ProjectionDatabase>>();
/** Only internal projection SQL uses this closed table namespace. No triggers or
 * aggregate/search dimensions exist in staging, so unpublished rows cannot count. */
function building(db: DatabaseSync, prefix: string): ProjectionDatabase {
  let map = adapters.get(db); if (!map) { map = new Map(); adapters.set(db, map); }
  let value = map.get(prefix);
  if (!value) {
    const sql = (text: string) => text.replace(tablePattern, name => prefix + name);
    value = { prepare: text => db.prepare(sql(text)), exec: text => db.exec(sql(text)) }; map.set(prefix, value);
  }
  return value;
}
export function createSyncSchema(db: DatabaseSync): void {
  db.exec("CREATE TABLE read_model_builds(session_id TEXT NOT NULL,projection TEXT NOT NULL,target INTEGER NOT NULL,stamp TEXT NOT NULL,codec TEXT NOT NULL,revision INTEGER NOT NULL,cursor TEXT,PRIMARY KEY(session_id,projection)) STRICT");
  // Clone only the explicitly listed empty table definitions and their indexes.
  // FTS shadow tables and published rollup triggers are deliberately excluded.
  for (const prefix of [namespace(false), namespace(true)]) for (const table of tables) {
    const definition = prepare(db, "SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(table) as { sql: string };
    db.exec(definition.sql.replace(tablePattern, name => prefix + name));
    for (const index of prepare(db, "SELECT name,sql FROM sqlite_master WHERE type='index' AND tbl_name=? AND sql IS NOT NULL").all(table) as { name: string; sql: string }[]) {
      // Staging is addressed by activity identity, Session, or rowid. It never
      // serves sorted/filter pages, so building these seven indexes twice only
      // increases CPU, checkpoint writes and temporary disk space.
      if (publishedOnlyIndexes.includes(index.name)) continue;
      db.exec(index.sql.replace(tablePattern, name => prefix + name).replace(index.name, prefix + index.name));
    }
  }
}

/** Remove obsolete staging-only query indexes without touching rows/cursors or
 * rebuilding published data. Existing schema-9 builds remain resumable. */
export function pruneSyncIndexes(db: DatabaseSync): void {
  for (const prefix of [namespace(false), namespace(true)]) for (const index of publishedOnlyIndexes) db.exec(`DROP INDEX IF EXISTS ${prefix}${index}`);
}
export function publishedState(db: DatabaseSync, sessionId: string, catalog = false): JournalState {
  const prefix = catalog ? "catalog-" : "";
  const get = (name: string) => (prepare(db, "SELECT value FROM index_state WHERE key=?").get(`${prefix}${name}:${sessionId}`) as { value: string } | undefined)?.value;
  const revision = get("session");
  if (revision === undefined && catalog) return publishedState(db, sessionId);
  return { revision: revision === undefined ? null : Number(revision), cursor: get("cursor"), stamp: get("stamp"), codecSetDigest: get("codec") };
}
export function resumableState(db: DatabaseSync, sessionId: string, catalog: boolean, target?: { throughSeq: number; stamp?: string; codecSetDigest?: string }): JournalState {
  const row = getBuild(db, sessionId, catalog);
  if (row && target && matches(row, target)) return { building: true, revision: row.revision, cursor: row.cursor ?? undefined, stamp: row.stamp, codecSetDigest: row.codec };
  return publishedState(db, sessionId, catalog);
}
function getBuild(db: DatabaseSync, id: string, catalog: boolean): Build | undefined {
  return prepare(db, "SELECT target,stamp,codec,revision,cursor FROM read_model_builds WHERE session_id=? AND projection=?").get(id, catalog ? "catalog" : "usage") as Build | undefined;
}
function matches(row: Build, source: { throughSeq: number; stamp?: string; codecSetDigest?: string }): boolean { return row.target === source.throughSeq && row.stamp === (source.stamp ?? "") && row.codec === (source.codecSetDigest ?? ""); }
function saveState(db: DatabaseSync, source: UsageJournalSource, cursor: string, revision: number, catalog: boolean): void {
  const prefix = catalog ? "catalog-" : "";
  const save = prepare(db, "INSERT INTO index_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
  for (const [name, value] of Object.entries({ session: String(revision), cursor, stamp: source.querySource?.stamp ?? "", codec: source.querySource?.codecSetDigest ?? "" })) save.run(`${prefix}${name}:${source.sessionId}`, value);
}
async function removeRows(db: ProjectionDatabase, table: string, id: string, yieldBatch: () => Promise<void>): Promise<void> {
  const statement = prepare(db, `DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} WHERE session_id=? LIMIT 256)`);
  while (statement.run(id).changes) await yieldBatch();
}
async function clearBuilding(db: DatabaseSync, id: string, catalog: boolean, yieldBatch: () => Promise<void>): Promise<void> {
  const target = building(db, namespace(catalog));
  for (const table of [...tables].reverse()) await removeRows(target, table, id, yieldBatch);
  prepare(db, "DELETE FROM read_model_builds WHERE session_id=? AND projection=?").run(id, catalog ? "catalog" : "usage");
}
/** Each input batch commits projection associations and its cursor together.
 * Rebuilds use a separate per-Session generation until atomic publication. */
export async function commitJournalBatch(db: DatabaseSync, message: JournalBatch, yieldBatch: () => Promise<void>): Promise<void> {
  const { source } = message; const id = source.sessionId; const catalog = !!message.catalogOnly;
  const descriptor = { throughSeq: source.throughJournalSeq, stamp: source.querySource?.stamp, codecSetDigest: source.querySource?.codecSetDigest };
  let build = getBuild(db, id, catalog);
  // A first batch without a cursor is an explicit restart, even at the same target.
  const restart = message.first && message.reset;
  const useBuilding = restart || (build !== undefined && matches(build, descriptor));
  db.exec("BEGIN IMMEDIATE");
  try {
    if (restart || (build && !matches(build, descriptor))) { await clearBuilding(db, id, catalog, yieldBatch); build = undefined; }
    const projection = useBuilding ? building(db, namespace(catalog)) : db;
    if (useBuilding && !build) {
      prepare(db, "INSERT INTO read_model_builds VALUES(?,?,?,?,?,-1,NULL)").run(id, catalog ? "catalog" : "usage", descriptor.throughSeq, descriptor.stamp ?? "", descriptor.codecSetDigest ?? "");
      prepare(db, `INSERT INTO ${namespace(catalog)}session_catalog SELECT * FROM session_catalog WHERE session_id=?`).run(id);
    }
    const h = source.querySource?.header;
    prepare(projection, "INSERT OR IGNORE INTO session_catalog(session_id,title,revision,created_at,updated_at,workspace_root) VALUES(?,?,?,?,?,?)").run(id, source.title, source.throughJournalSeq, h ? new Date(h.createdAt).toISOString() : null, h ? new Date(h.createdAt).toISOString() : null, source.workspaceRoot);
    const state = publishedState(db, id, true);
    const resetCatalog = useBuilding && !build;
    if (source.querySource) {
      const events = useBuilding ? message.events : message.events.filter(event => event.seq > (state.revision ?? -1));
      Object.assign(source, projectQueryCatalog(projection, source.querySource, events, resetCatalog));
    }
    if (!catalog) await projectUsageJournalBatch(projection, source, message.events, async rows => {
      for (const row of rows) prepare(projection, "DELETE FROM usage_activity WHERE activity_id=?").run(row.activityId);
      insertUsageActivities(projection, { ...source, rows });
      await yieldBatch();
    });
    const revision = message.final ? source.throughJournalSeq : message.events.at(-1)?.seq ?? build?.revision ?? -1;
    if (useBuilding) prepare(db, "UPDATE read_model_builds SET revision=?,cursor=? WHERE session_id=? AND projection=?").run(revision, message.cursor, id, catalog ? "catalog" : "usage");
    else {
      // Catalog may already be ahead following a sidebar-only refresh.
      if (revision >= (state.revision ?? -1)) saveState(db, source, message.cursor, revision, true);
      if (!catalog) saveState(db, source, message.cursor, revision, false);
    }
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  if (useBuilding && message.final) await publish(db, source, message.cursor, catalog, yieldBatch);
}
async function publish(db: DatabaseSync, source: UsageJournalSource, cursor: string, catalog: boolean, yieldBatch: () => Promise<void>): Promise<void> {
  const id = source.sessionId; const prefix = namespace(catalog);
  const copy = async (table: string) => {
    let after = 0;
    // Generated token-knowledge columns are visible to SELECT *, but SQLite
    // excludes them from INSERT's implicit writable-column list. Keep the
    // published and staging activity projections aligned during publication.
    const activityColumns = table === "usage_activity"
      ? (prepare(db, "PRAGMA table_xinfo(usage_activity)").all() as { name: string; hidden: number }[])
        .filter(column => column.hidden === 0)
        .map(column => column.name)
      : undefined;
    const projection = activityColumns
      ? `(${activityColumns.join(",")}) SELECT ${activityColumns.join(",")}`
      : "SELECT *";
    for (;;) {
      // Session indexes sort by logical keys, making every rowid page rescan
      // the entire Session. Seek the physical rowid range; staging is bounded
      // to in-flight builds and completed rows are removed after publication.
      const ids = prepare(db, `SELECT rowid AS id FROM ${prefix}${table} NOT INDEXED WHERE session_id=? AND rowid>? ORDER BY rowid LIMIT 256`).all(id, after) as { id: number }[];
      if (!ids.length) break;
      const end = ids.at(-1)!.id;
      const insert = () => { prepare(db, `INSERT INTO ${table} ${projection} FROM ${prefix}${table} NOT INDEXED WHERE session_id=? AND rowid>? AND rowid<=?`).run(id, after, end); };
      if (table === "usage_activity") writeUsageBatch(db, insert); else insert();
      after = end; await yieldBatch();
    }
  };
  db.exec("BEGIN IMMEDIATE");
  try {
    if (!catalog) for (const table of ["usage_activity", "usage_projection_events", "usage_projection_requests", "usage_projection_groups", "usage_projection_turns"]) { await removeRows(db, table, id, yieldBatch); }
    const state = publishedState(db, id, true);
    prepare(db, `INSERT OR IGNORE INTO session_catalog SELECT * FROM ${prefix}session_catalog WHERE session_id=?`).run(id);
    if (source.throughJournalSeq >= (state.revision ?? -1)) {
      for (const table of ["catalog_pending_tasks", "session_excerpt_search", "session_search"]) await removeRows(db, table, id, yieldBatch);
      // Preserve rowid because title FTS shares it with the catalog.
      const columns = (prepare(db, "PRAGMA table_info(session_catalog)").all() as { name: string }[]).map(row => row.name).filter(name => name !== "session_id");
      prepare(db, `UPDATE session_catalog SET (${columns.join(",")})=(SELECT ${columns.join(",")} FROM ${prefix}session_catalog WHERE session_id=?) WHERE session_id=?`).run(id, id);
      for (const table of ["catalog_pending_tasks", "session_excerpt_search"]) await copy(table);
      prepare(db, "INSERT INTO session_search(rowid,session_id,content) SELECT rowid,session_id,COALESCE(title,'') FROM session_catalog WHERE session_id=?").run(id);
      saveState(db, source, cursor, source.throughJournalSeq, true);
    }
    if (!catalog) {
      for (const table of ["usage_activity", "usage_projection_events", "usage_projection_requests", "usage_projection_groups", "usage_projection_turns"]) await copy(table);
      saveState(db, source, cursor, source.throughJournalSeq, false);
    }
    await clearBuilding(db, id, catalog, yieldBatch);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}

export async function discardSessionBuilds(db: DatabaseSync, id: string, yieldBatch: () => Promise<void>): Promise<void> {
  await clearBuilding(db, id, false, yieldBatch);
  await clearBuilding(db, id, true, yieldBatch);
}
