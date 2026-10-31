import { commitContextBatch, contextSourceState, clearContextSession } from "./context-history-projection";
import { queryContextHistory } from "./context-history-query";
import { insertUsageActivities } from "./usage-activity-write";
import { createReadModelSchema } from "./usage-read-model-schema";
import { UsageCatalogFallback } from "./usage-catalog-fallback";
import { prepare } from "./usage-sql";
import { projectQueryCatalog } from "./usage-catalog-projection";
import { enableUsageBatchWrites } from "./usage-batch-write";
import { metricsSource, runCountsSource, countableRunSql, metricSql, searchMetricsSource, clearSearchMetricsCache } from "./usage-rollups";
import { UsageSessionFallback } from "./usage-session-fallback";
import type { UsageJournalSource } from "./usage-journal-projection";
import { commitJournalBatch, resumableState, discardSessionBuilds, pruneSyncIndexes } from "./read-model-sync";
import type { SessionEventEnvelopeV1 } from "@actspace/session-journal";
import { DatabaseSync } from "node:sqlite";
import { getHeapStatistics } from "node:v8";
import { chmod, mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { parentPort, workerData } from "node:worker_threads";
import { setImmediate as yieldWorker } from "node:timers/promises";
import type { UsageCostSummary, SessionListPage, SessionListPageInput, UsageActivityAggregate, UsageActivityRow, UsageActivitySnapshot, UsageActivitySummary, UsageStatisticsGetInput, UsageStatisticsSnapshot } from "@actspace/shared";
import type { IndexedUsageSource } from "@actspace/client/sessions";

type Message =
  | { id: string; type: "context-fallback"; source: import("@actspace/session-storage").SessionQuerySource; events: readonly SessionEventEnvelopeV1[] }
  | { id: string; type: "context-query"; sessionId: string }
  | { id: string; type: "context-source-state"; source: import("@actspace/session-storage").SessionQuerySource }
  | { id: string; type: "context-journal"; source: import("@actspace/session-storage").SessionQuerySource; events: readonly SessionEventEnvelopeV1[]; cursor: string; first: boolean; final: boolean; reset: boolean }
  | { id: string; type: "sync"; sources: readonly IndexedUsageSource[]; catalog?: readonly CatalogRow[]; continuation?: boolean; final?: boolean; replaceSessionIds?: readonly string[]; activeSessionIds?: readonly string[] }
  | { id: string; type: "query"; request: "activity" | "statistics" | "sessions"; input: UsageStatisticsGetInput | SessionListPageInput }
  | { id: string; type: "catalog-fallback-begin" | "catalog-fallback-end" }
  | { id: string; type: "catalog-fallback-append"; row: CatalogRow; events: readonly SessionEventEnvelopeV1[]; first: boolean }
  | { id: string; type: "catalog-fallback-query"; input: SessionListPageInput }
  | { id: string; type: "fallback-begin" | "fallback-end" }
  | { id: string; type: "fallback-append"; source: UsageJournalSource; events: readonly SessionEventEnvelopeV1[] }
  | { id: string; type: "fallback-query"; request: "activity" | "statistics"; input: UsageStatisticsGetInput }
  | { id: string; type: "reset-database" }
  | { id: string; type: "source-state"; sessionId: string; catalogOnly?: boolean; target?: { throughSeq: number; stamp?: string; codecSetDigest?: string } }
  | { id: string; type: "abort-sync" }
  | { id: string; type: "journal"; catalogOnly?: boolean; source: UsageJournalSource; events: readonly SessionEventEnvelopeV1[]; cursor: string; first: boolean; final: boolean; reset: boolean }
  | { id: string; type: "diagnostics" };
type DbRow = { row_json: string; activity_id: string; session_id: string; session_title: string | null; started_at: string; kind: string; status: string; model: string | null; provider_id: string | null; connection_id: string | null; tool_name: string | null; agent_run_id: string };
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
      const result = message.type === "context-fallback" ? await contextFallback(message.source, message.events) : message.type === "context-query" ? queryContextHistory(await open(), message.sessionId) : message.type === "context-source-state" ? contextSourceState(await open(), message.source) : message.type === "context-journal" ? await commitContextBatch(await open(), message.source, message.events, message.cursor, message.first, message.final, message.reset, async () => { parentPort?.postMessage({ id: message.id, heartbeat: true }); await yieldWorker(); }) : message.type.startsWith("catalog-fallback-") ? catalogFallbackMessage(message) : message.type === "reset-database" ? await resetDatabase() : message.type.startsWith("fallback-") ? await fallbackMessage(message) : message.type === "source-state" ? await sourceState(message.sessionId, message.catalogOnly, message.target) : message.type === "journal" ? await syncJournal(message) : message.type === "abort-sync" ? abortSync() : message.type === "sync" ? await sync(message.sources, message.catalog, message.replaceSessionIds, message.activeSessionIds, message.final, message.continuation) : message.type === "query" ? await query(message.request, message.input) : { memory: { ...process.memoryUsage(), heapSizeLimit: getHeapStatistics().heap_size_limit }, sqlite: db ? prepare(db, "PRAGMA temp_store").get() : null };
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
  if ((appId !== 0 && appId !== 0x41555332) || (version !== 0 && version !== 14)) throw new Error("Usage read model schema mismatch; rebuild required.");
  await chmod(databasePath, 0o600).catch(() => undefined);
  db.exec("PRAGMA temp_store = FILE; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON; PRAGMA cache_size = -32768; PRAGMA wal_autocheckpoint = 4096;");
  memoryTemp = false;
  if (version === 0) createReadModelSchema(db);
  else if (["usage_write_mode", "read_model_builds", "usage_activity_session_idx", "context_state", "context_request_seq", "context_event_seq", "building_context_state"].some(name => !prepare(db!, "SELECT 1 FROM sqlite_master WHERE name=?").get(name))) throw new Error("Usage read model schema incomplete; rebuild required.");
  addSideChatColumn(db);
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

async function query(kind: "activity" | "statistics" | "sessions", input: UsageStatisticsGetInput | SessionListPageInput, scratch?: DatabaseSync): Promise<UsageActivitySnapshot | UsageStatisticsSnapshot | SessionListPage | null> {
  const database = scratch ?? await open();
  if (syncing && !scratch) throw new Error("Usage synchronization is not committed.");
  // Large sorts, DISTINCT, and title aggregates may spill to disk. Changing
  // temp_store drops TEMP tables, so its query cache must be invalidated too.
  if (!scratch) setTempStorage(database, false);
  if (kind === "sessions") return sessionPage(database, input as SessionListPageInput);
  const usageInput = input as UsageStatisticsGetInput;
  if (typeof usageInput.search === "string" && usageInput.search.length > 300) throw new Error("Usage search exceeds 300 characters.");
  const scope = usageInput.scope ?? (usageInput.sessionId ? "session" : "global");
  const selected = scope === "session" ? prepare(database, "SELECT session_id,title FROM session_catalog WHERE session_id = ?").get(usageInput.sessionId ?? "") as { session_id: string; title: string | null } | undefined : undefined;
  if (scope === "session" && !selected) return null;
  const range = usageInput.range ?? "month";
  const since = range === "total" ? undefined : new Date(Date.now() - (range === "day" ? 1 : range === "week" ? 7 : 31) * 86_400_000).toISOString();
  const where: string[] = []; const args: (string | number)[] = [];
  if (scope === "session") { where.push("a.session_id = ?"); args.push(usageInput.sessionId ?? ""); }
  if (since) { where.push("a.started_at >= ?"); args.push(since); }
  const rangeWhere = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const baseArgs = [...args];
  const titleMatches = usageInput.search?.trim() ? Number((prepare(database, "SELECT COUNT(*) AS n FROM session_search WHERE session_search MATCH ?").get(toFtsQuery(usageInput.search)) as { n: number }).n) : 0;
  const allTitlesMatch = titleMatches > 0 && titleMatches === Number((prepare(database, "SELECT COUNT(*) AS n FROM session_catalog").get() as { n: number }).n);
  const rangeMetricSource = scope === "global" ? metricsSource(since) : undefined;
  let metricSource = rangeMetricSource;
  const countRow = prepare(database, metricSql(`SELECT COUNT(*) AS count FROM usage_activity a ${rangeWhere}`, metricSource)).get(...baseArgs) as { count: number };
  const rangeCount = Number(countRow.count ?? 0);
  if (kind === "statistics") return buildStatistics(database, usageInput, scope, range, selected?.title ?? "全部数据", rangeWhere, baseArgs, rangeCount, metricSource, metricSource ? runCountsSource(since) : undefined);
  if (usageInput.model !== undefined) { where.push("a.model = ?"); args.push(usageInput.model); }
  if (usageInput.providerId !== undefined) { where.push("a.provider_id = ?"); args.push(usageInput.providerId); }
  if (usageInput.kind) { where.push("a.kind = ?"); args.push(usageInput.kind); }
  if (usageInput.status && usageInput.status !== "all") { where.push("a.status = ?"); args.push(usageInput.status); }
  if (usageInput.search?.trim() && !allTitlesMatch) {
    try { where.push("(a.search_key IN (SELECT search_key FROM search_documents WHERE search_documents MATCH ?) OR a.session_id IN (SELECT session_id FROM session_search WHERE session_search MATCH ?))"); args.push(toFtsQuery(usageInput.search), toFtsQuery(usageInput.search)); }
    catch { where.push("(lower(coalesce(a.model,'')) LIKE ? OR lower(coalesce(a.provider_id,'')) LIKE ? OR lower(coalesce(a.connection_id,'')) LIKE ? OR lower(coalesce(a.tool_name,'')) LIKE ?)"); const term = `%${usageInput.search.trim().toLowerCase()}%`; args.push(term, term, term, term); }
  }
  const filterWhere = where.length ? `WHERE ${where.join(" AND ")}` : "";
  if (titleMatches && !allTitlesMatch) metricSource = searchMetricsSource(database, filterWhere, args);
  return activitySql(database, usageInput, scope, range, selected?.title ?? "全部数据", rangeWhere, baseArgs, filterWhere, args, rangeCount, selected, metricSource, rangeMetricSource);
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
    return { items: rows.slice(0, limit).map(toSessionListItem), groups: [], indexing: false, failed: 0, ...(rows.length > limit ? { nextCursor: String(rows[limit - 1]!.session_id) } : {}) };
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

function activitySql(database: DatabaseSync, input: UsageStatisticsGetInput, scope: "session" | "global", range: UsageStatisticsGetInput["range"], title: string, rangeWhere: string, rangeArgs: (string | number)[], filterWhere: string, filterArgs: (string | number)[], rangeCount: number, selected?: { session_id: string; title: string | null }, metricSource?: string, rangeMetricSource?: string): UsageActivitySnapshot {
  const summaryRow = prepare(database, metricSql(`SELECT COUNT(*) AS activity_count, SUM(CASE WHEN a.kind='llm_request' THEN 1 ELSE 0 END) AS request_count, SUM(CASE WHEN a.kind='tool_invocation' THEN 1 ELSE 0 END) AS tool_count, SUM(CASE WHEN a.status='success' THEN 1 ELSE 0 END) AS success_count, SUM(CASE WHEN a.status='error' THEN 1 ELSE 0 END) AS error_count, SUM(CASE WHEN a.status='aborted' THEN 1 ELSE 0 END) AS aborted_count, SUM(CASE WHEN a.status='running' THEN 1 ELSE 0 END) AS running_count, SUM(CASE WHEN a.status='unknown' THEN 1 ELSE 0 END) AS unknown_count, COALESCE(SUM(a.input_tokens),0) AS input_tokens, COALESCE(SUM(a.output_tokens),0) AS output_tokens, COALESCE(SUM(a.cache_read_tokens),0) AS cache_read_tokens, COALESCE(SUM(a.cache_write_tokens),0) AS cache_write_tokens, COALESCE(SUM(a.reasoning_tokens),0) AS reasoning_tokens, COALESCE(SUM(a.total_tokens),0) AS total_tokens, SUM(CASE WHEN a.kind='llm_request' AND a.input_tokens IS NULL THEN 1 ELSE 0 END) AS input_tokens_unknown, SUM(CASE WHEN a.kind='llm_request' AND a.output_tokens IS NULL THEN 1 ELSE 0 END) AS output_tokens_unknown, SUM(CASE WHEN a.kind='llm_request' AND a.cache_read_tokens IS NULL THEN 1 ELSE 0 END) AS cache_read_tokens_unknown, SUM(CASE WHEN a.kind='llm_request' AND a.cache_write_tokens IS NULL THEN 1 ELSE 0 END) AS cache_write_tokens_unknown, SUM(CASE WHEN a.kind='llm_request' AND a.reasoning_tokens IS NULL THEN 1 ELSE 0 END) AS reasoning_tokens_unknown, SUM(CASE WHEN a.kind='llm_request' AND a.total_tokens IS NULL THEN 1 ELSE 0 END) AS total_tokens_unknown, SUM(a.cost_usd) AS cost_usd, SUM(CASE WHEN a.kind='llm_request' AND a.cost_amount IS NULL THEN 1 ELSE 0 END) AS cost_unavailable_count FROM usage_activity a ${filterWhere}`, metricSource)).get(...filterArgs) as Record<string, number | null>;
  const summary: UsageActivitySummary = {
    activityCount: Number(summaryRow.activity_count ?? 0), requestCount: Number(summaryRow.request_count ?? 0), toolCount: Number(summaryRow.tool_count ?? 0), successCount: Number(summaryRow.success_count ?? 0), errorCount: Number(summaryRow.error_count ?? 0), abortedCount: Number(summaryRow.aborted_count ?? 0), runningCount: Number(summaryRow.running_count ?? 0), unknownCount: Number(summaryRow.unknown_count ?? 0),
    inputTokens: Number(summaryRow.input_tokens ?? 0), outputTokens: Number(summaryRow.output_tokens ?? 0), cacheReadTokens: Number(summaryRow.cache_read_tokens ?? 0), cacheWriteTokens: Number(summaryRow.cache_write_tokens ?? 0), reasoningTokens: Number(summaryRow.reasoning_tokens ?? 0), totalTokens: Number(summaryRow.total_tokens ?? 0),
    unknownTokenRequestCounts: { input: Number(summaryRow.input_tokens_unknown ?? 0), output: Number(summaryRow.output_tokens_unknown ?? 0), cacheRead: Number(summaryRow.cache_read_tokens_unknown ?? 0), cacheWrite: Number(summaryRow.cache_write_tokens_unknown ?? 0), reasoning: Number(summaryRow.reasoning_tokens_unknown ?? 0), total: Number(summaryRow.total_tokens_unknown ?? 0) },
    costUsd: summaryRow.cost_usd == null ? null : Number(summaryRow.cost_usd), costUnavailableCount: Number(summaryRow.cost_unavailable_count ?? 0),
  };
  const pageSize = boundedInteger(input.requestRowsPage?.limit, 10, 500);
  const page = boundedInteger(input.requestRowsPage?.page, 1, 1_000_000);
  const cursor = decodeCursor(input.requestRowsPage?.cursor);
  const selectedSources = scope === "session" ? 1 : Number((prepare(database, "SELECT COUNT(*) AS count FROM session_catalog").get() as { count: number }).count);
  const filteredCount = Number((prepare(database, metricSql(`SELECT COUNT(*) AS count FROM usage_activity a ${filterWhere}`, metricSource)).get(...filterArgs) as { count: number }).count);
  const pageWhere = cursor ? `${filterWhere}${filterWhere ? " AND" : " WHERE"}(a.started_at,a.source_event_seq,a.activity_id) < (?,?,?)` : filterWhere;
  const pageArgs = cursor ? [...filterArgs, cursor.startedAt, cursor.sourceEventSeq, cursor.activityId] : filterArgs;
  const offset = cursor ? 0 : (page - 1) * pageSize;
  const pageIndex = filteredCount < 10_000 ? "" : input.model !== undefined ? "INDEXED BY usage_activity_model_page_idx" : input.providerId !== undefined ? "INDEXED BY usage_activity_provider_page_idx" : input.status && input.status !== "all" ? "INDEXED BY usage_activity_status_page_idx" : input.kind ? "INDEXED BY usage_activity_kind_page_idx" : "INDEXED BY usage_activity_started_idx";
  const pageRows = filteredCount === 0 ? [] : boundedRows(prepare(database, `SELECT a.row_json FROM usage_activity a ${pageIndex} ${pageWhere} ORDER BY a.started_at DESC, a.source_event_seq DESC, a.activity_id DESC LIMIT ? OFFSET ?`).iterate(...pageArgs, pageSize + 1, offset)) as { row_json: string }[];
  const returned = pageRows.slice(0, pageSize).map(row => JSON.parse(row.row_json) as UsageActivityRow);
  const next = pageRows.length > pageSize ? encodeCursor(returned.at(-1)) : null;
  return { schemaVersion: 1, scope, sessionId: scope === "session" ? input.sessionId ?? null : null, title: scope === "session" ? selected?.title ?? "New chat" : "全部数据", range: range ?? "month", generatedAt: new Date().toISOString(), sourceCount: selectedSources, ...watermarks(database, scope, input.sessionId), summary, tabCounts: { requests: rangeCount, providers: dimensionCount(database, rangeWhere, rangeArgs, "providers", rangeMetricSource), models: dimensionCount(database, rangeWhere, rangeArgs, "models", rangeMetricSource), tools: dimensionCount(database, rangeWhere, rangeArgs, "tools", rangeMetricSource) }, costSummary: costSummarySql(database, filterWhere, filterArgs, metricSource), aggregates: aggregateSql(database, filterWhere, filterArgs, metricSource), rows: returned, rowsPage: { page, pageSize, totalRows: filteredCount, totalPages: Math.max(1, Math.ceil(filteredCount / pageSize)), ...(next ? { nextCursor: next } : {}) } };
}

function buildStatistics(database: DatabaseSync, input: UsageStatisticsGetInput, scope: "session" | "global", range: UsageStatisticsGetInput["range"], title: string, where: string, args: (string | number)[], rangeCount: number, metricSource?: string, runSource?: string): UsageStatisticsSnapshot {
  const requestWhere = `${where}${where ? " AND" : "WHERE"} a.kind = 'llm_request'`;
  const stats = prepare(database, metricSql(`SELECT COALESCE(SUM(a.total_tokens),0) AS total_tokens, COALESCE(SUM(a.input_tokens),0) AS prompt_tokens, COALESCE(SUM(a.output_tokens),0) AS completion_tokens, COALESCE(SUM(a.cache_read_tokens),0) AS cache_hit_tokens, COALESCE(SUM(a.cache_write_tokens),0) AS cache_miss_tokens, COALESCE(SUM(a.reasoning_tokens),0) AS reasoning_tokens, COALESCE(SUM(a.cost_usd),0) AS cost_usd, COUNT(*) AS request_count, ${runSource ? '0' : `COUNT(DISTINCT CASE WHEN ${countableRunSql("a")} THEN a.session_id || ':' || a.agent_run_id END)`} AS conversation_count FROM usage_activity a ${requestWhere}`, metricSource)).get(...args) as Record<string, number | null>;
  const toolCount = Number((prepare(database, metricSql(`SELECT COUNT(*) AS count FROM usage_activity a ${where ? `${where} AND` : "WHERE"} a.kind='tool_invocation'`, metricSource)).get(...args) as { count: number }).count);
  const totalTokens = Number(stats.total_tokens ?? 0); const cacheHitTokens = Number(stats.cache_hit_tokens ?? 0);
  const modelDistribution = (boundedRows(prepare(database, metricSql(`SELECT COALESCE(a.model,'default') AS name, COALESCE(a.provider_id,'default') AS provider, COALESCE(SUM(a.total_tokens),0) AS total_tokens, COUNT(*) AS call_count, COALESCE(SUM(a.cost_usd),0) AS cost_usd FROM usage_activity a ${requestWhere} GROUP BY COALESCE(a.provider_id,'default'), COALESCE(a.model,'default') ORDER BY total_tokens DESC`, metricSource)).iterate(...args)) as Record<string, string | number | null>[]).map(row => ({ name: String(row.name), provider: String(row.provider), totalTokens: Number(row.total_tokens ?? 0), percent: totalTokens === 0 ? 0 : Number(row.total_tokens ?? 0) / totalTokens * 100, callCount: Number(row.call_count ?? 0), costUsd: Number(row.cost_usd ?? 0) }));
  const toolDistribution = (boundedRows(prepare(database, metricSql(`SELECT COALESCE(a.tool_name,'unknown') AS name, COUNT(*) AS call_count, SUM(CASE WHEN a.status='error' THEN 1 ELSE 0 END) AS failed_count, AVG(COALESCE(a.duration_ms,0)) AS average_duration_ms FROM usage_activity a ${where ? `${where} AND` : "WHERE"} a.kind='tool_invocation' GROUP BY COALESCE(a.tool_name,'unknown') ORDER BY call_count DESC`, metricSource)).iterate(...args)) as Record<string, string | number | null>[]).map(row => ({ name: String(row.name), callCount: Number(row.call_count ?? 0), percent: toolCount === 0 ? 0 : Number(row.call_count ?? 0) / toolCount * 100, failedCount: Number(row.failed_count ?? 0), ...(row.average_duration_ms == null ? {} : { averageDurationMs: Number(row.average_duration_ms) }) }));
  if (runSource === "usage_run_counts") runSource = "usage_run_totals";
  if (runSource === "usage_run_totals") stats.conversation_count = Number((prepare(database, "SELECT request_count FROM usage_run_cardinality WHERE bucket=''").get() as { request_count: number } | undefined)?.request_count ?? 0);
  else if (runSource) stats.conversation_count = Number((prepare(database, `SELECT COUNT(DISTINCT a.session_id || ':' || a.agent_run_id) AS count FROM ${runSource} a ${requestWhere}`).get(...args) as { count: number }).count);
  const dailyRows = buildDailyStatistics(database, where, args, metricSource, runSource);
  const pageSize = boundedInteger(input.requestRowsPage?.limit, 10, 500); const page = boundedInteger(input.requestRowsPage?.page, 1, 1_000_000); const cursor = decodeCursor(input.requestRowsPage?.cursor);
  const pageWhere = cursor ? `${requestWhere} AND (a.started_at,a.source_event_seq,a.activity_id) < (?,?,?)` : requestWhere;
  const pageArgs = cursor ? [...args, cursor.startedAt, cursor.sourceEventSeq, cursor.activityId] : args;
  const offset = cursor ? 0 : (page - 1) * pageSize;
  const requestRowsRaw = Number(stats.request_count ?? 0) === 0 ? [] : boundedRows(prepare(database, `SELECT a.row_json FROM usage_activity a INDEXED BY usage_activity_kind_page_idx ${pageWhere} ORDER BY a.started_at DESC, a.source_event_seq DESC, a.activity_id DESC LIMIT ? OFFSET ?`).iterate(...pageArgs, pageSize + 1, offset)) as { row_json: string }[];
  const requestRowsData = requestRowsRaw.slice(0, pageSize).map(row => JSON.parse(row.row_json) as UsageActivityRow);
  const requestRows = requestRowsData.map(toStatisticsRequestRow);
  const nextCursor = requestRowsRaw.length > pageSize ? encodeCursor(requestRowsData.at(-1)) : null;
  return { scope, sessionId: scope === "session" ? input.sessionId ?? null : null, title, range: range ?? "month", generatedAt: new Date().toISOString(), sourceCount: scope === "session" ? 1 : Number((prepare(database, "SELECT COUNT(*) AS count FROM session_catalog").get() as { count: number }).count), summary: { totalTokens, promptTokens: Number(stats.prompt_tokens ?? 0), completionTokens: Number(stats.completion_tokens ?? 0), cacheHitTokens, cacheMissTokens: Number(stats.cache_miss_tokens ?? 0), reasoningTokens: Number(stats.reasoning_tokens ?? 0), toolCallCount: toolCount, conversationCount: Number(stats.conversation_count ?? 0), costUsd: Number(stats.cost_usd ?? 0), cacheEfficiencyPercent: totalTokens === 0 ? 0 : cacheHitTokens / totalTokens * 100 }, modelDistribution, toolDistribution, dailyRows, requestRows, requestRowsPage: { page, pageSize, totalRows: Number(stats.request_count ?? 0), totalPages: Math.max(1, Math.ceil(Number(stats.request_count ?? 0) / pageSize)), ...(nextCursor ? { nextCursor } : {}) } };
}

function toStatisticsRequestRow(row: UsageActivityRow) {
  return { timestamp: row.startedAt, sessionId: row.sessionId, agentRunId: row.agentRunId, ...(row.workspaceRoot ? { workspaceRoot: row.workspaceRoot } : {}), model: row.model ?? "default", ...(row.modelKey ? { modelKey: row.modelKey } : {}), ...(row.providerId ? { provider: row.providerId } : {}), modelCallCount: 1, totalTokens: row.tokens.totalTokens ?? 0, promptTokens: row.tokens.inputTokens ?? 0, completionTokens: row.tokens.outputTokens ?? 0, cacheHitTokens: row.tokens.cacheReadTokens ?? 0, cacheMissTokens: row.tokens.cacheWriteTokens ?? 0, reasoningTokens: row.tokens.reasoningTokens ?? 0, costUsd: row.costUsd ?? 0 };
}

function buildDailyStatistics(database: DatabaseSync, where: string, args: (string | number)[], metricSource?: string, runSource?: string) {
  if (metricSource === "usage_total_rollups") metricSource = "usage_daily_rollups";
  if (runSource === "usage_run_totals") runSource = "usage_run_days";
  const rows = boundedRows(prepare(database, metricSql(`SELECT substr(a.started_at,1,10) AS date, COALESCE(SUM(CASE WHEN a.kind='llm_request' THEN a.total_tokens ELSE 0 END),0) AS total_tokens, COALESCE(SUM(CASE WHEN a.kind='llm_request' THEN a.input_tokens ELSE 0 END),0) AS prompt_tokens, COALESCE(SUM(CASE WHEN a.kind='llm_request' THEN a.output_tokens ELSE 0 END),0) AS completion_tokens, COALESCE(SUM(CASE WHEN a.kind='llm_request' THEN a.cache_read_tokens ELSE 0 END),0) AS cache_hit_tokens, COALESCE(SUM(CASE WHEN a.kind='llm_request' THEN a.reasoning_tokens ELSE 0 END),0) AS reasoning_tokens, ${runSource ? '0' : `COUNT(DISTINCT CASE WHEN ${countableRunSql("a")} THEN a.session_id || ':' || a.agent_run_id END)`} AS conversation_count, SUM(CASE WHEN a.kind='tool_invocation' THEN 1 ELSE 0 END) AS tool_call_count, COALESCE(SUM(CASE WHEN a.kind='llm_request' THEN a.cost_usd ELSE 0 END),0) AS cost_usd FROM usage_activity a ${where} GROUP BY substr(a.started_at,1,10) ORDER BY date`, metricSource)).iterate(...args)) as Record<string, string | number | null>[];
  const models = boundedRows(prepare(database, metricSql(`SELECT substr(a.started_at,1,10) AS date, COALESCE(a.model,'default') AS name, COALESCE(SUM(a.total_tokens),0) AS total_tokens FROM usage_activity a ${where ? `${where} AND` : "WHERE"} a.kind='llm_request' GROUP BY substr(a.started_at,1,10), COALESCE(a.model,'default') ORDER BY date, total_tokens DESC`, metricSource)).iterate(...args)) as Record<string, string | number | null>[];
  if (runSource) {
    const countRows = runSource === "usage_run_days"
      ? boundedRows(prepare(database, "SELECT substr(bucket,1,10) AS date,all_count AS count FROM usage_run_cardinality WHERE bucket!=''").iterate())
      : boundedRows(prepare(database, `SELECT substr(a.started_at,1,10) AS date,COUNT(DISTINCT a.session_id || ':' || a.agent_run_id) AS count FROM ${runSource} a ${where} GROUP BY substr(a.started_at,1,10)`).iterate(...args));
    const counts = new Map((countRows as { date: string; count: number }[]).map(row => [row.date, row.count]));
    for (const row of rows) row.conversation_count = counts.get(String(row.date)) ?? 0;
  }
  const byDate = new Map<string, { name: string; totalTokens: number }[]>(); for (const row of models) { const date = String(row.date); byDate.set(date, [...(byDate.get(date) ?? []), { name: String(row.name), totalTokens: Number(row.total_tokens ?? 0) }]); }
  return rows.map(row => { const totalTokens = Number(row.total_tokens ?? 0); return { date: String(row.date), totalTokens, promptTokens: Number(row.prompt_tokens ?? 0), completionTokens: Number(row.completion_tokens ?? 0), cacheHitTokens: Number(row.cache_hit_tokens ?? 0), reasoningTokens: Number(row.reasoning_tokens ?? 0), conversationCount: Number(row.conversation_count ?? 0), toolCallCount: Number(row.tool_call_count ?? 0), costUsd: Number(row.cost_usd ?? 0), modelBreakdown: (byDate.get(String(row.date)) ?? []).map(model => ({ ...model, percent: totalTokens === 0 ? 0 : model.totalTokens / totalTokens * 100 })) }; });
}

function costSummarySql(database: DatabaseSync, where: string, args: (string | number)[], metricSource?: string): UsageCostSummary {
  const row = prepare(database, metricSql(`SELECT COALESCE(SUM(CASE WHEN kind='llm_request' AND cost_amount IS NOT NULL AND cost_currency='USD' THEN cost_amount ELSE 0 END),0) AS cost,
    COALESCE(SUM(kind='llm_request' AND cost_amount IS NOT NULL AND cost_currency='USD'),0) AS known,
    COALESCE(SUM(kind='llm_request' AND (cost_amount IS NULL OR COALESCE(cost_currency,'')!='USD')),0) AS unknown,
    COALESCE(SUM(kind='llm_request' AND historical_unverified=1 AND cost_amount IS NOT NULL AND cost_currency='USD'),0) AS unverified
    FROM usage_activity a ${where}`, metricSource)).get(...args) as Record<string, number>;
  return { costUsd: row.cost!, knownCostRequestCount: row.known!, unknownCostRequestCount: row.unknown!, unverifiedHistoricalRequestCount: row.unverified! };
}

function aggregateSql(database: DatabaseSync, where: string, args: (string | number)[], metricSource?: string): { providers: UsageActivityAggregate[]; models: UsageActivityAggregate[]; tools: UsageActivityAggregate[] } {
  const read = (kind: "providers" | "models" | "tools"): UsageActivityAggregate[] => {
    const condition = kind === "tools" ? `${where}${where ? " AND" : " WHERE"} a.kind='tool_invocation'` : `${where}${where ? " AND" : " WHERE"} a.kind='llm_request'`;
    const key = kind === "tools" ? "COALESCE(a.tool_name,'未知工具')" : kind === "models" ? "COALESCE(a.provider_id,'未知服务商') || '/' || COALESCE(a.connection_id,'') || '/' || COALESCE(a.model,'未知模型')" : "COALESCE(a.provider_id,'未知服务商') || '/' || COALESCE(a.connection_id,'')";
    const label = kind === "tools" ? "COALESCE(a.tool_name,'未知工具')" : kind === "models" ? "COALESCE(a.model,'未知模型')" : "COALESCE(a.provider_id,'未知服务商')";
    const rows = boundedRows(prepare(database, metricSql(`SELECT ${key} AS key, ${label} AS label, MAX(a.provider_id) AS provider_id, MAX(a.connection_id) AS connection_id, COUNT(*) AS count, SUM(CASE WHEN a.status='error' THEN 1 ELSE 0 END) AS error_count, COALESCE(SUM(a.total_tokens),0) AS total_tokens, SUM(CASE WHEN a.kind='llm_request' AND a.total_tokens IS NULL THEN 1 ELSE 0 END) AS unknown_token_request_count, COALESCE(SUM(a.duration_ms),0) AS duration_ms, COALESCE(SUM(CASE WHEN a.kind='llm_request' AND a.cost_amount IS NOT NULL AND a.cost_currency='USD' THEN a.cost_amount ELSE 0 END),0) AS cost_usd, SUM(CASE WHEN a.kind='llm_request' AND a.cost_amount IS NOT NULL AND a.cost_currency='USD' THEN 1 ELSE 0 END) AS known_cost_count, SUM(CASE WHEN a.kind='llm_request' AND (a.cost_amount IS NULL OR COALESCE(a.cost_currency,'')!='USD') THEN 1 ELSE 0 END) AS unknown_cost_count, SUM(CASE WHEN a.kind='llm_request' AND a.historical_unverified=1 AND a.cost_amount IS NOT NULL AND a.cost_currency='USD' THEN 1 ELSE 0 END) AS unverified_count FROM usage_activity a ${condition} GROUP BY ${key} ORDER BY count DESC, key`, metricSource)).iterate(...args)) as Record<string, string | number | null>[];
    return rows.map(row => ({ key: String(row.key), label: String(row.label), ...(row.provider_id ? { providerId: String(row.provider_id) } : {}), ...(row.connection_id ? { connectionId: String(row.connection_id) } : {}), count: Number(row.count), errorCount: Number(row.error_count ?? 0), totalTokens: Number(row.total_tokens ?? 0), unknownTokenRequestCount: Number(row.unknown_token_request_count ?? 0), durationMs: Number(row.duration_ms ?? 0), costSummary: { costUsd: Number(row.cost_usd ?? 0), knownCostRequestCount: Number(row.known_cost_count ?? 0), unknownCostRequestCount: Number(row.unknown_cost_count ?? 0), unverifiedHistoricalRequestCount: Number(row.unverified_count ?? 0) } }));
  };
  return { providers: read("providers"), models: read("models"), tools: read("tools") };
}
function watermarks(database: DatabaseSync, scope: "session" | "global", sessionId?: string) {
  const query = "SELECT session_id,CAST(i.value AS INTEGER) AS revision FROM session_catalog JOIN index_state i ON i.key='session:'||session_id";
  const statement = prepare(database, query + (scope === "session" ? " WHERE session_id=?" : "") + " ORDER BY session_id LIMIT 501");
  const rows = boundedRows(statement.iterate(...(scope === "session" ? [sessionId ?? ""] : []))) as { session_id: string; revision: number }[];
  return { sourceWatermarks: rows.slice(0, 500).map(row => ({ sessionId: row.session_id, throughJournalSeq: row.revision })).sort((a, b) => a.sessionId.localeCompare(b.sessionId)), ...(rows.length > 500 ? { sourceWatermarksTruncated: true } : {}) };
}

function dimensionCount(database: DatabaseSync, where: string, args: (string | number)[], dimension: "providers" | "models" | "tools", metricSource?: string): number {
  const key = dimension === "tools" ? "COALESCE(tool_name,'未知工具')" : dimension === "providers" ? "COALESCE(provider_id,'未知服务商') || '/' || COALESCE(connection_id,'')" : "COALESCE(provider_id,'未知服务商') || '/' || COALESCE(connection_id,'') || '/' || COALESCE(model,'未知模型')";
  const kind = dimension === "tools" ? "tool_invocation" : "llm_request";
  return Number((prepare(database, metricSql(`SELECT COUNT(DISTINCT ${key}) AS count FROM usage_activity a ${where}${where ? " AND" : " WHERE"} kind=?`, metricSource)).get(...args, kind) as { count: number }).count);
}

function toFtsQuery(value: string): string {
  // Treat operators as literal text; preserve explicitly quoted phrases.
  const tokens = value.trim().match(/"[^"]*"|[^\s"]+/g) ?? [];
  return tokens.map(token => `"${token.replace(/^"|"$/g, "").replaceAll('"', '""')}"`).join(" AND ") || '""';
}
function encodeCursor(row: UsageActivityRow | undefined): string | null { return row ? Buffer.from(JSON.stringify({ startedAt: row.startedAt, sourceEventSeq: row.sourceEventSeq, activityId: row.activityId }), "utf8").toString("base64url") : null; }
function decodeCursor(value: string | undefined): { startedAt: string; sourceEventSeq: number; activityId: string } | undefined {
  if (value === undefined) return undefined;
  try {
    if (!value || value.length > 2048) throw new Error();
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (typeof parsed.startedAt !== "string" || !Number.isSafeInteger(parsed.sourceEventSeq) || typeof parsed.activityId !== "string") throw new Error();
    return parsed;
  } catch { throw new Error("Usage cursor invalid; restart the query."); }
}

function boundedInteger(value: number | undefined, fallback: number, max: number): number { return typeof value === "number" && Number.isFinite(value) ? Math.max(1, Math.min(Math.floor(value), max)) : fallback; }

/** Stop before collecting an unbounded aggregate/dimension result in JS. */
function boundedRows<T>(rows: Iterable<T>, budget = { bytes: 0, rows: 0 }): T[] {
  const result: T[] = [];
  for (const row of rows) {
    budget.bytes += Buffer.byteLength(JSON.stringify(row)) + 1;
    if (budget.bytes > 1024 * 1024 || budget.rows >= 16_384) throw new Error("Usage result exceeds the query budget; narrow the query.");
    budget.rows++;
    result.push(row);
  }
  return result;
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
