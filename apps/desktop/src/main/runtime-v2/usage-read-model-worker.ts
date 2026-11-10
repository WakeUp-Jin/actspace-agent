import { commitContextBatch, contextSourceState, clearContextSession, ensureContextBashTables } from "./context-history-projection";
import { queryContextHistory } from "./context-history-query";
import { insertUsageActivities } from "./usage-activity-write";
import { createReadModelSchema } from "./usage-read-model-schema";
import { UsageCatalogFallback } from "./usage-catalog-fallback";
import { prepare } from "./usage-sql";
import { enableUsageBatchWrites } from "./usage-batch-write";
import { clearSearchMetricsCache } from "./usage-rollups";
import { boundedInteger, boundedRows, queryUsageActivity, toFtsQuery } from "./usage-activity-query";
import { UsageSessionFallback } from "./usage-session-fallback";
import type { UsageJournalSource } from "./usage-journal-projection";
import { commitJournalBatch, resumableState, discardSessionBuilds, pruneSyncIndexes } from "./read-model-sync";
import { archiveHarnessSession, ingestHarnessArchive, refreshHarnessSessionMeta } from "./harness-stats-archive";
import { harnessFingerprint, queryHarnessStats } from "./harness-stats-query";
import { ingestHarnessRuntimeFiles } from "./harness-stats-runtime-ingest";
import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";
import { DatabaseSync } from "node:sqlite";
import { getHeapStatistics } from "node:v8";
import { chmod, mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { parentPort, workerData } from "node:worker_threads";
import { setImmediate as yieldWorker } from "node:timers/promises";
import type { HarnessStatsData, HarnessStatsQueryInput, SessionListPage, SessionListPageInput, UsageActivitySnapshot, UsageStatisticsGetInput } from "@actspace/shared";
import type { IndexedUsageSource } from "@actspace/client/sessions";

type Message =
  | { id: string; type: "context-fallback"; source: import("@actspace/session-storage").SessionQuerySource; events: readonly SessionEventEnvelopeV1[] }
  | { id: string; type: "context-query"; sessionId: string }
  | { id: string; type: "context-source-state"; source: import("@actspace/session-storage").SessionQuerySource }
  | { id: string; type: "context-journal"; source: import("@actspace/session-storage").SessionQuerySource; events: readonly SessionEventEnvelopeV1[]; cursor: string; first: boolean; final: boolean; reset: boolean }
  | { id: string; type: "sync"; sources: readonly IndexedUsageSource[]; catalog?: readonly CatalogRow[]; continuation?: boolean; final?: boolean; replaceSessionIds?: readonly string[]; activeSessionIds?: readonly string[] }
  | { id: string; type: "query"; request: "activity" | "sessions"; input: UsageStatisticsGetInput | SessionListPageInput }
  | { id: string; type: "catalog-fallback-begin" | "catalog-fallback-end" }
  | { id: string; type: "catalog-fallback-append"; row: CatalogRow; events: readonly SessionEventEnvelopeV1[]; first: boolean }
  | { id: string; type: "catalog-fallback-query"; input: SessionListPageInput }
  | { id: string; type: "fallback-begin" | "fallback-end" }
  | { id: string; type: "fallback-append"; source: UsageJournalSource; events: readonly SessionEventEnvelopeV1[] }
  | { id: string; type: "fallback-query"; request: "activity"; input: UsageStatisticsGetInput }
  | { id: string; type: "reset-database" }
  | { id: string; type: "source-state"; sessionId: string; catalogOnly?: boolean; target?: { throughSeq: number; stamp?: string; codecSetDigest?: string } }
  | { id: string; type: "abort-sync" }
  | { id: string; type: "journal"; catalogOnly?: boolean; source: UsageJournalSource; events: readonly SessionEventEnvelopeV1[]; cursor: string; first: boolean; final: boolean; reset: boolean }
  | { id: string; type: "harness-query"; input: HarnessStatsQueryInput }
  | { id: string; type: "harness-ingest" }
  | { id: string; type: "harness-fingerprint" }
  | { id: string; type: "diagnostics" };
type Source = IndexedUsageSource & { querySource?: UsageJournalSource["querySource"] };
type CatalogRow = { sessionId: string; title: string | null; revision: number; createdAt: string; updatedAt: string; workspaceRoot: string | null; worktree?: unknown; pinned: boolean; archived: boolean; accessState: string; isChildSession: boolean; sideChatParentId?: string; agentRunCount: number; agentForm?: string; agentMode?: string; agentModeRevision?: number; querySource?: import("@actspace/session-storage").SessionQuerySource };

const root = String((workerData as { dataRoot: string }).dataRoot);
const databasePath = join(root, "runtime-v2", "usage-read-model.sqlite");
let db: DatabaseSync | undefined;
let owner: DatabaseSync | undefined;
let chain = Promise.resolve();
let syncing = false;
let memoryTemp = false;
let activeMessageId: string | undefined;
let fallback: UsageSessionFallback | undefined;
let catalogFallback: UsageCatalogFallback | undefined;

parentPort?.on("message", (message: Message) => {
  chain = chain.then(async () => {
    activeMessageId = message.id;
    try {
      const result = message.type === "context-fallback" ? await contextFallback(message.source, message.events) : message.type === "context-query" ? queryContextHistory(await open(), message.sessionId) : message.type === "context-source-state" ? contextSourceState(await open(), message.source) : message.type === "context-journal" ? await commitContextBatch(await open(), message.source, message.events, message.cursor, message.first, message.final, message.reset, async () => { parentPort?.postMessage({ id: message.id, heartbeat: true }); await yieldWorker(); }) : message.type.startsWith("catalog-fallback-") ? catalogFallbackMessage(message) : message.type === "reset-database" ? await resetDatabase() : message.type.startsWith("fallback-") ? await fallbackMessage(message) : message.type === "source-state" ? await sourceState(message.sessionId, message.catalogOnly, message.target) : message.type === "journal" ? await syncJournal(message) : message.type === "abort-sync" ? abortSync() : message.type === "sync" ? await sync(message.sources, message.catalog, message.replaceSessionIds, message.activeSessionIds, message.final, message.continuation) : message.type === "query" ? await query(message.request, message.input) : message.type === "harness-query" ? await harnessQuery(message.input) : message.type === "harness-ingest" ? { ...ingestHarnessRuntimeFiles(await open(), root), fingerprint: harnessFingerprint(await open()) } : message.type === "harness-fingerprint" ? { fingerprint: harnessFingerprint(await open()) } : { memory: { ...process.memoryUsage(), heapSizeLimit: getHeapStatistics().heap_size_limit }, sqlite: db ? prepare(db, "PRAGMA temp_store").get() : null };
      if (result && Buffer.byteLength(JSON.stringify(result)) > 1024 * 1024) throw new Error("Usage result exceeds 1 MiB; narrow the query.");
      parentPort?.postMessage({ id: message.id, ok: true, result });
    } catch (error) {
      parentPort?.postMessage({ id: message.id, ok: false, error: error instanceof Error ? error.message : String(error) });
    } finally { activeMessageId = undefined; }
  });
});

function catalogFallbackMessage(message: Message) {
  if (message.type === "catalog-fallback-end") { catalogFallback?.close(); catalogFallback = undefined; return null; }
  if (message.type === "catalog-fallback-begin") { catalogFallback?.close(); catalogFallback = new UsageCatalogFallback(); return null; }
  if (!catalogFallback) throw new Error("History fallback is not initialized.");
  if (message.type === "catalog-fallback-append") { catalogFallback.append(message.row, message.events, message.first); return null; }
  if (message.type === "catalog-fallback-query") return sessionPage(catalogFallback.database, message.input);
  throw new Error("Unknown history fallback message.");
}

async function fallbackMessage(message: Message) {
  if (message.type === "fallback-end") { fallback = undefined; return null; }
  if (message.type === "fallback-begin") { fallback = new UsageSessionFallback(); return null; }
  if (!fallback) throw new Error("Session fallback is not initialized.");
  if (message.type === "fallback-append") { fallback.append(message.source, message.events); return null; }
  if (message.type === "fallback-query") {
    const database = fallback.materialize();
    try { return await query(message.request, message.input, database); }
    finally { database.close(); fallback = undefined; }
  }
  throw new Error("Unknown fallback message.");
}

/** A separate SQLite connection holds an OS-backed exclusive lease. A crashed
 * Worker releases it automatically; no PID-file reclamation or unlink race. */
async function acquireOwner(): Promise<void> {
  if (owner) return;
  await mkdir(join(root, "runtime-v2"), { recursive: true });
  const lease = new DatabaseSync(join(root, "runtime-v2", "usage-read-model-owner.sqlite"));
  try {
    lease.exec("PRAGMA busy_timeout=50; BEGIN EXCLUSIVE; CREATE TABLE IF NOT EXISTS owner(singleton INTEGER PRIMARY KEY)");
    await chmod(join(root, "runtime-v2", "usage-read-model-owner.sqlite"), 0o600);
    owner = lease;
  } catch (error) { lease.close(); throw error; }
}
async function resetDatabase(): Promise<null> {
  await acquireOwner();
  abortSync();
  db?.close(); db = undefined; memoryTemp = false;
  for (const path of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) {
    try { await unlink(path); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  return null;
}

async function open(): Promise<DatabaseSync> {
  if (db) return db;
  await acquireOwner();
  await mkdir(join(root, "runtime-v2"), { recursive: true });
  db = new DatabaseSync(databasePath);
  try {
  const appId = Number((prepare(db, "PRAGMA application_id").get() as { application_id: number }).application_id);
  const version = Number((prepare(db, "PRAGMA user_version").get() as { user_version: number }).user_version);
  if ((appId !== 0 && appId !== 0x41555332) || (version !== 0 && version !== 18)) throw new Error("Usage read model schema mismatch; rebuild required.");
  await chmod(databasePath, 0o600).catch(() => undefined);
  db.exec("PRAGMA temp_store = FILE; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON; PRAGMA cache_size = -32768; PRAGMA wal_autocheckpoint = 4096;");
  memoryTemp = false;
  if (version === 0) {
    createReadModelSchema(db);
    // 新库：读回已删除会话的 Harness 统计归档（D15）。归档损坏不影响使用统计。
    try { ingestHarnessArchive(db, root); } catch (error) { console.warn("[harness-stats] archive ingest failed", error); }
  }
  else if (["usage_write_mode", "read_model_builds", "usage_activity_session_idx", "context_state", "context_estimate_state", "context_request_seq", "context_event_seq", "building_context_state"].some(name => !prepare(db!, "SELECT 1 FROM sqlite_master WHERE name=?").get(name))) throw new Error("Usage read model schema incomplete; rebuild required.");
  addSideChatColumn(db);
  ensureContextBashTables(db);
  pruneSyncIndexes(db);
  enableUsageBatchWrites(db);
  return db;
  } catch (error) { db.close(); db = undefined; throw error; }
}

async function sourceState(sessionId: string, catalogOnly = false, target?: { throughSeq: number; stamp?: string; codecSetDigest?: string }) {
  return resumableState(await open(), sessionId, catalogOnly, target);
}
function abortSync(): null {
  if (db && syncing) { db.exec("ROLLBACK"); syncing = false; }
  return null;
}
async function syncJournal(message: Extract<Message, { type: "journal" }>): Promise<null> {
  if (syncing) throw new Error("Legacy synchronization is still active.");
  const database = await open();
  const state = resumableState(database, message.source.sessionId, !!message.catalogOnly, { throughSeq: message.source.throughJournalSeq, stamp: message.source.querySource?.stamp, codecSetDigest: message.source.querySource?.codecSetDigest });
  // Ordinary appends have one bounded input batch and small trigger scratch
  // tables. Rebuilds and metadata changes can touch an entire Session.
  const changesMetadata = message.events.some(event => event.type === "session/title-set" || event.type === "session/workspace-set");
  setTempStorage(database, !message.reset && !state.building && !changesMetadata);
  await commitJournalBatch(database, message, async () => {
    if (activeMessageId) parentPort?.postMessage({ id: activeMessageId, heartbeat: true });
    await yieldWorker();
  });
  return null;
}

async function sync(sources: readonly Source[], catalogRows: readonly CatalogRow[] = [], replaceSessionIds: readonly string[] = sources.map(source => source.sessionId), activeSessionIds?: readonly string[], final = true, continuation = false, allowMemoryTemp = true): Promise<null> {
  const database = await open();
  if (continuation !== syncing) throw new Error("Invalid Usage synchronization transaction state.");
  if (!continuation) {
    // Small append statements create many transient trigger tables. Keep those
    // in memory, but retain file-backed temporaries for bulk replacement/pruning
    // and catalog-wide updates. Do not change temp_store inside a transaction.
    const existingReset = replaceSessionIds.some(id => {
      if (prepare(database, "SELECT 1 FROM usage_activity WHERE session_id=? LIMIT 1").get(id)) return true;
      const state = prepare(database, "SELECT value FROM index_state WHERE key=?");
      const saved = state.get(`catalog-session:${id}`) as { value: string } | undefined;
      if (!saved) return false;
      const source = sources.find(source => source.sessionId === id);
      const stamp = state.get(`catalog-stamp:${id}`) as { value: string } | undefined;
      // History may already have indexed this revision. Usage can then append
      // its first activity rows without deleting any catalog/excerpt data.
      return Number(saved.value) !== source?.throughJournalSeq || !source?.querySource || stamp?.value !== source.querySource.stamp;
    });
    setTempStorage(database, allowMemoryTemp && !catalogRows.length && activeSessionIds === undefined && !existingReset);
  }
  const catalog = prepare(database, "INSERT INTO session_catalog(session_id,title,revision,created_at,updated_at,workspace_root,worktree_json,pinned,archived,access_state,is_child_session,agent_run_count,agent_form,agent_mode,agent_mode_revision,side_chat_parent_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET title=excluded.title,revision=excluded.revision,created_at=excluded.created_at,updated_at=excluded.updated_at,workspace_root=excluded.workspace_root,worktree_json=excluded.worktree_json,pinned=excluded.pinned,archived=excluded.archived,access_state=excluded.access_state,is_child_session=excluded.is_child_session,agent_run_count=excluded.agent_run_count,agent_form=excluded.agent_form,agent_mode=excluded.agent_mode,agent_mode_revision=excluded.agent_mode_revision,side_chat_parent_id=excluded.side_chat_parent_id");
  if (!continuation) { database.exec("BEGIN IMMEDIATE"); syncing = true; }
  try {
    for (const row of catalogRows) {
      const previous = prepare(database, "SELECT title,workspace_root FROM session_catalog WHERE session_id=?").get(row.sessionId) as { title: string | null; workspace_root: string | null } | undefined;
      if (previous && row.querySource) {
        prepare(database, "UPDATE session_catalog SET revision=? WHERE session_id=?").run(row.revision, row.sessionId);
        continue;
      }
      catalog.run(row.sessionId, row.title, row.revision, new Date(row.createdAt).toISOString(), new Date(row.updatedAt).toISOString(), row.workspaceRoot, row.worktree === undefined ? null : JSON.stringify(row.worktree), row.pinned ? 1 : 0, row.archived ? 1 : 0, row.accessState, row.isChildSession ? 1 : 0, row.agentRunCount, row.agentForm ?? null, row.agentMode ?? null, row.agentModeRevision ?? null, row.sideChatParentId ?? null);
      if (!previous || previous.title !== row.title) {
        prepare(database, "DELETE FROM session_search WHERE rowid IN (SELECT rowid FROM session_catalog WHERE session_id=?)").run(row.sessionId);
        prepare(database, "INSERT INTO session_search(rowid,session_id,content) SELECT rowid,session_id,COALESCE(title,'') FROM session_catalog WHERE session_id=?").run(row.sessionId);
      }
      if (previous && (previous.title !== row.title || previous.workspace_root !== row.workspaceRoot)) {
        prepare(database, "UPDATE usage_activity SET session_title=?,workspace_root=?,row_json=CASE WHEN ? IS NULL THEN json_remove(row_json,'$.sessionTitle') ELSE json_set(row_json,'$.sessionTitle',?) END WHERE session_id=?").run(row.title, row.workspaceRoot, row.title, row.title, row.sessionId);
        prepare(database, "UPDATE usage_activity SET row_json=CASE WHEN ? IS NULL THEN json_remove(row_json,'$.workspaceRoot') ELSE json_set(row_json,'$.workspaceRoot',?) END WHERE session_id=?").run(row.workspaceRoot, row.workspaceRoot, row.sessionId);
      }
    }
    const replaced = new Set<string>();
    for (const source of sources) {
      const created = prepare(database, "INSERT INTO session_catalog(session_id,title,revision,updated_at) VALUES(?,?,?,?) ON CONFLICT(session_id) DO NOTHING").run(source.sessionId, source.title, source.throughJournalSeq, new Date().toISOString());
      if (created.changes) prepare(database, "INSERT INTO session_search(rowid,session_id,content) VALUES(?,?,?)").run(created.lastInsertRowid, source.sessionId, source.title ?? "");
      if (replaceSessionIds.includes(source.sessionId) && !replaced.has(source.sessionId)) {
        replaced.add(source.sessionId);
        await removeSessionActivities(database, source.sessionId);
      }
      insertUsageActivities(database, source);
      if (final) prepare(database, "INSERT INTO index_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(`session:${source.sessionId}`, String(source.throughJournalSeq));
    }
    if (activeSessionIds) {
      const active = new Set(activeSessionIds);
      const known = prepare(database, "SELECT session_id FROM session_catalog").iterate() as Iterable<{ session_id: string }>;
      for (const row of known) if (!active.has(row.session_id)) {
        archiveHarnessSession(database, root, row.session_id);
        await clearContextSession(database, row.session_id, false, async () => { if (activeMessageId) parentPort?.postMessage({ id: activeMessageId, heartbeat: true }); await yieldWorker(); });
        await clearContextSession(database, row.session_id, true, async () => { if (activeMessageId) parentPort?.postMessage({ id: activeMessageId, heartbeat: true }); await yieldWorker(); });
        await discardSessionBuilds(database, row.session_id, async () => { if (activeMessageId) parentPort?.postMessage({ id: activeMessageId, heartbeat: true }); await yieldWorker(); });
        await removeSessionActivities(database, row.session_id);
        prepare(database, "DELETE FROM session_search WHERE rowid IN (SELECT rowid FROM session_catalog WHERE session_id=?)").run(row.session_id);
        prepare(database, "DELETE FROM session_excerpt_search WHERE session_id=?").run(row.session_id);
        prepare(database, "DELETE FROM session_catalog WHERE session_id = ?").run(row.session_id);
        for (const prefix of ["session:", "cursor:", "stamp:", "codec:", "catalog-session:", "catalog-cursor:", "catalog-stamp:", "catalog-codec:"]) {
          prepare(database, "DELETE FROM index_state WHERE key = ?").run(`${prefix}${row.session_id}`);
        }
      }
    }
    if (final) { database.exec("COMMIT"); syncing = false; }
  } catch (error) {
    database.exec("ROLLBACK"); syncing = false;
    throw error;
  }
  return null;
}

/** Keep each trigger-heavy statement bounded while preserving the enclosing
 * Session transaction. Large replacements can report liveness and be cancelled
 * between chunks instead of spending minutes inside one native SQLite call. */
async function removeSessionActivities(database: DatabaseSync, sessionId: string): Promise<void> {
  const remove = prepare(database, "DELETE FROM usage_activity WHERE rowid IN (SELECT rowid FROM usage_activity WHERE session_id=? LIMIT 500)");
  while (Number(remove.run(sessionId).changes) > 0) {
    if (activeMessageId) parentPort?.postMessage({ id: activeMessageId, heartbeat: true });
    await yieldWorker();
  }
}

/** Harness 统计查询读已发布的表；重建期间发布表仍是上一版完整数据，所以不必等同步结束。 */
async function harnessQuery(input: HarnessStatsQueryInput): Promise<{ data: HarnessStatsData; fingerprint: string }> {
  const database = await open();
  refreshHarnessSessionMeta(database);
  setTempStorage(database, false);
  return { data: queryHarnessStats(database, input), fingerprint: harnessFingerprint(database) };
}

async function query(kind: "activity" | "sessions", input: UsageStatisticsGetInput | SessionListPageInput, scratch?: DatabaseSync): Promise<UsageActivitySnapshot | SessionListPage | null> {
  const database = scratch ?? await open();
  if (syncing && !scratch) throw new Error("Usage synchronization is not committed.");
  // Large sorts, DISTINCT, and title aggregates may spill to disk. Changing
  // temp_store drops TEMP tables, so its query cache must be invalidated too.
  if (!scratch) setTempStorage(database, false);
  if (kind === "sessions") return sessionPage(database, input as SessionListPageInput);
  if (!scratch) refreshHarnessSessionMeta(database);
  // 回退库只有会话日志投影出的模型请求，没有 Harness 表。
  return queryUsageActivity(database, input as UsageStatisticsGetInput, !!scratch);
}

function setTempStorage(database: DatabaseSync, useMemory: boolean): void {
  if (memoryTemp === useMemory) return;
  database.exec(useMemory ? "PRAGMA temp_store=MEMORY" : "PRAGMA temp_store=FILE");
  memoryTemp = useMemory;
  clearSearchMetricsCache(database);
}

function sessionPage(database: DatabaseSync, input: SessionListPageInput): SessionListPage {
  if (input.search?.trim()) {
    if (input.search.length > 300) throw new Error("Usage search exceeds 300 characters.");
    const term = toFtsQuery(input.search);
    const limit = boundedInteger(input.limit, 50, 500);
    const conditions = ["archived=0", "is_child_session=0", "side_chat_parent_id IS NULL", "(session_id IN (SELECT session_id FROM session_search WHERE session_search MATCH ?) OR session_id IN (SELECT session_id FROM session_excerpt_search WHERE session_excerpt_search MATCH ?))"];
    const args: (string | number)[] = [term, term];
    if (input.workspaceRoot !== undefined) { conditions.push("COALESCE(json_extract(worktree_json,'$.sourceWorkspaceRoot'),workspace_root,'')=?"); args.push(input.workspaceRoot); }
    if (input.pinned !== undefined) { conditions.push("pinned=?"); args.push(Number(input.pinned)); }
    if (input.after) {
      const after = prepare(database, "SELECT updated_at FROM session_catalog WHERE session_id=?").get(input.after) as { updated_at: string } | undefined;
      if (!after) throw new Error("Usage cursor invalid; restart the search.");
      conditions.push("(updated_at < ? OR (updated_at=? AND session_id>?))"); args.push(after.updated_at, after.updated_at, input.after);
    }
    const rows = boundedRows(prepare(database, `SELECT *,${SIDE_CHAT_COUNT} FROM session_catalog WHERE ${conditions.join(" AND ")} ORDER BY updated_at DESC,session_id ASC LIMIT ?`).iterate(...args, limit + 1)) as Record<string, string | number | null>[];
    return { items: rows.slice(0, limit).map(toSessionListItem), groups: [], indexing: false, failed: 0, ...(rows.length > limit ? { nextCursor: String(rows[limit - 1].session_id) } : {}) };
  }
  const groupRoot = "COALESCE(json_extract(worktree_json,'$.sourceWorkspaceRoot'),workspace_root,'')";
  // 子 Agent 的会话只在父会话的「Agent」面板里看，不进侧栏列表；侧边对话只算进父会话的计数。
  const conditions = ["archived=0", "is_child_session=0", "side_chat_parent_id IS NULL"];
  const args: (string | number)[] = [];
  if (input.workspaceRoot !== undefined) { conditions.push(`${groupRoot}=?`); args.push(input.workspaceRoot); }
  if (input.pinned !== undefined) { conditions.push("pinned=?"); args.push(input.pinned ? 1 : 0); }
  const where = conditions.join(" AND ");
  const groupRows = boundedRows(prepare(database, `SELECT ${groupRoot} AS group_root,pinned FROM session_catalog WHERE ${where} GROUP BY ${groupRoot},pinned ORDER BY group_root,pinned`).iterate(...args)) as { group_root: string; pinned: number }[];
  const items: SessionListPage["items"] = [];
  const groups: SessionListPage["groups"] = [];
  const pageBudget = { bytes: 0, rows: 0 };
  const after = input.after ? prepare(database, "SELECT updated_at,session_id FROM session_catalog WHERE session_id=?").get(input.after) as { updated_at: string; session_id: string } | undefined : undefined;
  const afterGroup = input.after ? prepare(database, `SELECT ${groupRoot} AS group_root,pinned FROM session_catalog WHERE session_id=?`).get(input.after) as { group_root: string; pinned: number } | undefined : undefined;
  for (const group of groupRows) {
    // A catalog with many workspaces must still obey the global IPC row budget.
    // Keep empty group descriptors so the UI can request their first page later.
    const limit = Math.min(10, 500 - items.length);
    if (limit === 0) { groups.push({ workspaceRoot: group.group_root, pinned: group.pinned === 1, hasMore: true }); continue; }
    const pageArgs: (string | number)[] = [group.group_root, group.pinned];
    let cursorWhere = "";
    if (after && afterGroup?.group_root === group.group_root && afterGroup.pinned === group.pinned) {
      cursorWhere = " AND (updated_at < ? OR (updated_at=? AND session_id>?))";
      pageArgs.push(after.updated_at, after.updated_at, after.session_id);
    }
    // Only this group's visible page crosses from SQLite into JavaScript.
    const rows = boundedRows(prepare(database, `SELECT *,${SIDE_CHAT_COUNT} FROM session_catalog WHERE archived=0 AND is_child_session=0 AND side_chat_parent_id IS NULL AND ${groupRoot}=? AND pinned=?${cursorWhere} ORDER BY updated_at DESC,session_id ASC LIMIT ?`).iterate(...pageArgs, limit + 1), pageBudget) as Record<string, string | number | null>[];
    items.push(...rows.slice(0, limit).map(toSessionListItem));
    groups.push({ workspaceRoot: group.group_root, pinned: group.pinned === 1, hasMore: rows.length > limit });
  }
  items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  return { items, groups, indexing: false, failed: 0 };
}

// Side chats are listed under their parent, never as sidebar rows of their own.
const SIDE_CHAT_COUNT = "(SELECT COUNT(*) FROM session_catalog AS side WHERE side.side_chat_parent_id=session_catalog.session_id AND side.archived=0) AS side_chat_count";

/** Schema-9 indexes created before side chats get the column in place; no rebuild. */
function addSideChatColumn(database: DatabaseSync): void {
  for (const table of ["session_catalog", "building_catalog_session_catalog", "building_usage_session_catalog"]) {
    const columns = prepare(database, `PRAGMA table_info(${table})`).all() as { name: string }[];
    if (columns.length > 0 && !columns.some(column => column.name === "side_chat_parent_id")) database.exec(`ALTER TABLE ${table} ADD COLUMN side_chat_parent_id TEXT`);
  }
  database.exec("CREATE INDEX IF NOT EXISTS session_catalog_side_chat_idx ON session_catalog(side_chat_parent_id)");
}

function toSessionListItem(row: Record<string, string | number | null>) {
  const worktree = row.worktree_json ? JSON.parse(String(row.worktree_json)) : undefined;
  return { ...(row.has_pending_tasks == null ? {} : { hasPendingTasks: Number(row.has_pending_tasks) === 1 }), id: String(row.session_id), title: String(row.title ?? "New chat"), updatedAt: String(row.updated_at ?? ""), workspaceRoot: row.workspace_root ? String(row.workspace_root) : undefined, ...(worktree ? { worktree } : {}), pinned: Number(row.pinned ?? 0) === 1, archived: Number(row.archived ?? 0) === 1, accessState: String(row.access_state ?? "read-write") as "read-write" | "degraded" | "browse-only" | "corrupt", isChildSession: Number(row.is_child_session ?? 0) === 1, agentRunCount: Number(row.agent_run_count ?? 0), ...(row.agent_form ? { agentForm: String(row.agent_form) as "agent" | "chat" } : {}), ...(row.agent_mode ? { agentMode: String(row.agent_mode) as "chat" | "plan" | "agent" } : {}), ...(row.agent_mode_revision == null ? {} : { agentModeRevision: Number(row.agent_mode_revision) }), ...(row.side_chat_parent_id ? { sideChatParentId: String(row.side_chat_parent_id) } : {}), ...(Number(row.side_chat_count ?? 0) > 0 ? { sideChatCount: Number(row.side_chat_count) } : {}) };
}

async function contextFallback(source: import("@actspace/session-storage").SessionQuerySource, events: readonly SessionEventEnvelopeV1[]): Promise<ReturnType<typeof queryContextHistory>> {
  if (events.length > 5000 || Buffer.byteLength(JSON.stringify(events)) > 8 * 1024 * 1024) throw new Error("Context fallback exceeds bounded budget.");
  const scratch = new DatabaseSync(":memory:");
  try {
    createReadModelSchema(scratch);
    await commitContextBatch(scratch, source, events, "fallback", true, true, true, async () => { if (activeMessageId) parentPort?.postMessage({ id: activeMessageId, heartbeat: true }); await yieldWorker(); });
    return queryContextHistory(scratch, source.header.sessionId);
  } finally { scratch.close(); }
}
