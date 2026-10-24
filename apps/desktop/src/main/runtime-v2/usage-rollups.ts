import type { DatabaseSync } from "node:sqlite";
import { prepare } from "./usage-sql";

// Hourly global aggregates keep the normal Usage overview independent of the
// number of activity rows. Session/text searches keep the exact detail path.
const dimensions = ["kind", "status", "model", "provider_id", "connection_id", "tool_name", "cost_currency", "historical_unverified", "input_tokens_unknown", "output_tokens_unknown", "cache_read_tokens_unknown", "cache_write_tokens_unknown", "reasoning_tokens_unknown", "total_tokens_unknown"];
const measures = ["input_tokens", "output_tokens", "cache_read_tokens", "cache_write_tokens", "reasoning_tokens", "total_tokens", "duration_ms", "cost_usd", "cost_amount"];
const fields = ["group_key", "started_at", ...dimensions, ...measures, "metric_count"];
const hour = (alias: string) => `substr(${alias}.started_at,1,13)||':00:00.000Z'`;
const key = (alias: string) => `json_array(${hour(alias)},${dimensions.map(name => `${alias}.${name}`).join(",")},${alias}.cost_amount IS NULL,${alias}.cost_usd IS NULL)`;
const searchCache = new WeakMap<DatabaseSync, { key: string; changes: number }>();

export function clearSearchMetricsCache(db: DatabaseSync): void { searchCache.delete(db); }

/** Background requests are billable Session facts, not synthetic Agent Runs.
 * Keep legacy rows without a purpose and tool-owned auxiliary requests. */
export function countableRunSql(alias: string): string {
  return `COALESCE(json_extract(${alias}.row_json,'$.purpose'),'') NOT IN ('session-title','compaction')`;
}

export function createUsageRollups(db: DatabaseSync): void {
  // Exact distinct runs are maintained separately from metric dimensions.
  for (const [table, bucket] of [["usage_run_counts", hour("new")], ["usage_run_days", "substr(new.started_at,1,10)||'T00:00:00.000Z'"], ["usage_run_totals", "''"]] as const) {
    const oldBucket = bucket.replaceAll("new.", "old.");
    db.exec(`
      CREATE TABLE IF NOT EXISTS ${table}(session_id TEXT NOT NULL,agent_run_id TEXT NOT NULL,started_at TEXT NOT NULL,kind TEXT NOT NULL,metric_count INTEGER NOT NULL,PRIMARY KEY(started_at,session_id,agent_run_id,kind)) STRICT;
      CREATE TRIGGER IF NOT EXISTS ${table}_insert AFTER INSERT ON usage_activity WHEN (SELECT batching FROM usage_write_mode)=0 AND ${countableRunSql("new")} BEGIN
        INSERT INTO ${table} VALUES(new.session_id,new.agent_run_id,${bucket},new.kind,1) ON CONFLICT DO UPDATE SET metric_count=metric_count+1;
      END;
      CREATE TRIGGER IF NOT EXISTS ${table}_delete AFTER DELETE ON usage_activity WHEN ${countableRunSql("old")} BEGIN
        UPDATE ${table} SET metric_count=metric_count-1 WHERE session_id=old.session_id AND agent_run_id=old.agent_run_id AND started_at=${oldBucket} AND kind=old.kind;
        DELETE FROM ${table} WHERE session_id=old.session_id AND agent_run_id=old.agent_run_id AND started_at=${oldBucket} AND kind=old.kind AND metric_count=0;
      END;
    `);
  }
  createRunCardinality(db);
  for (const [table, bucket] of [["usage_rollups", hour("new")], ["usage_daily_rollups", "substr(new.started_at,1,10)||'T00:00:00.000Z'"], ["usage_total_rollups", "''"]] as const) {
    const newKey = `json_array(${bucket},${dimensions.map(name => `new.${name}`).join(",")},new.cost_amount IS NULL,new.cost_usd IS NULL)`;
    const oldKey = newKey.replaceAll("new.", "old.");
    db.exec(`
      CREATE TABLE IF NOT EXISTS ${table} (
        group_key TEXT PRIMARY KEY,started_at TEXT NOT NULL,kind TEXT NOT NULL,status TEXT NOT NULL,
        model TEXT,provider_id TEXT,connection_id TEXT,tool_name TEXT,cost_currency TEXT,historical_unverified INTEGER NOT NULL,
        input_tokens_unknown INTEGER NOT NULL,output_tokens_unknown INTEGER NOT NULL,cache_read_tokens_unknown INTEGER NOT NULL,
        cache_write_tokens_unknown INTEGER NOT NULL,reasoning_tokens_unknown INTEGER NOT NULL,total_tokens_unknown INTEGER NOT NULL,
        ${measures.map(name => `${name} REAL`).join(",")},metric_count INTEGER NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS ${table}_time_idx ON ${table}(started_at);
      CREATE VIRTUAL TABLE IF NOT EXISTS ${table}_search USING fts5(group_key UNINDEXED,content);
      CREATE TRIGGER IF NOT EXISTS ${table}_search_insert AFTER INSERT ON ${table} BEGIN
        INSERT INTO ${table}_search(rowid,group_key,content) VALUES(new.rowid,new.group_key,COALESCE(new.model,'')||' '||COALESCE(new.provider_id,'')||' '||COALESCE(new.connection_id,'')||' '||COALESCE(new.tool_name,''));
      END;
      CREATE TRIGGER IF NOT EXISTS ${table}_search_delete AFTER DELETE ON ${table} BEGIN
        DELETE FROM ${table}_search WHERE rowid=old.rowid;
      END;
      CREATE TRIGGER IF NOT EXISTS ${table}_insert AFTER INSERT ON usage_activity WHEN (SELECT batching FROM usage_write_mode)=0 BEGIN
        INSERT INTO ${table}(${fields.join(",")}) VALUES(${newKey},${bucket},${[...dimensions,...measures].map(name => `new.${name}`).join(",")},1)
        ON CONFLICT(group_key) DO UPDATE SET metric_count=metric_count+1,${measures.map(name => `${name}=CASE WHEN ${name} IS NULL AND excluded.${name} IS NULL THEN NULL ELSE COALESCE(${name},0)+COALESCE(excluded.${name},0) END`).join(",")};
      END;
      CREATE TRIGGER IF NOT EXISTS ${table}_delete AFTER DELETE ON usage_activity BEGIN
        UPDATE ${table} SET metric_count=metric_count-1,${measures.map(name => `${name}=CASE WHEN ${name} IS NULL THEN NULL ELSE ${name}-COALESCE(old.${name},0) END`).join(",")} WHERE group_key=${oldKey};
        DELETE FROM ${table} WHERE group_key=${oldKey} AND metric_count=0;
      END;
    `);
  }
}

/** Count distinct identities when their first/last kind is inserted/deleted.
 * Overview queries then read one row per day instead of deduplicating every run.
 * Initialization is atomic for existing disposable indexes as well as new ones. */
function createRunCardinality(db: DatabaseSync): void {
  if (prepare(db, "SELECT 1 FROM sqlite_master WHERE name='usage_run_cardinality'").get()) return;
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec("CREATE TABLE usage_run_cardinality(bucket TEXT PRIMARY KEY,request_count INTEGER NOT NULL,all_count INTEGER NOT NULL) STRICT");
    for (const table of ["usage_run_days", "usage_run_totals"]) {
      db.exec(`
        INSERT INTO usage_run_cardinality SELECT started_at,SUM(has_request),COUNT(*) FROM
          (SELECT started_at,session_id,agent_run_id,MAX(kind='llm_request') AS has_request FROM ${table} GROUP BY started_at,session_id,agent_run_id) GROUP BY started_at;
        CREATE TRIGGER ${table}_cardinality_insert AFTER INSERT ON ${table} BEGIN
          INSERT INTO usage_run_cardinality VALUES(new.started_at,new.kind='llm_request',
            NOT EXISTS(SELECT 1 FROM ${table} WHERE started_at=new.started_at AND session_id=new.session_id AND agent_run_id=new.agent_run_id AND kind!=new.kind))
          ON CONFLICT(bucket) DO UPDATE SET request_count=request_count+excluded.request_count,all_count=all_count+excluded.all_count;
        END;
        CREATE TRIGGER ${table}_cardinality_delete AFTER DELETE ON ${table} BEGIN
          UPDATE usage_run_cardinality SET request_count=request_count-(old.kind='llm_request'),all_count=all_count-
            (NOT EXISTS(SELECT 1 FROM ${table} WHERE started_at=old.started_at AND session_id=old.session_id AND agent_run_id=old.agent_run_id)) WHERE bucket=old.started_at;
          DELETE FROM usage_run_cardinality WHERE bucket=old.started_at AND all_count=0;
        END;
      `);
    }
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}

/** Whole buckets use rollups; the partial boundary hour uses exact activity
 * timestamps, so sliding day/week/month windows don't silently round their start. */
export function metricsSource(since?: string): string {
  if (!since) return "usage_total_rollups";
  const boundary = new Date(Math.ceil(Date.parse(since) / 3_600_000) * 3_600_000).toISOString();
  // Both strings were generated by Date, never supplied SQL or raw user text.
  return `(SELECT ${fields.join(",")} FROM usage_rollups WHERE started_at >= '${boundary}' UNION ALL SELECT ${fields.map(name => name === "metric_count" ? "1 AS metric_count" : name === "group_key" ? `${key("usage_activity")} AS group_key` : name).join(",")} FROM usage_activity WHERE started_at >= '${since}' AND started_at < '${boundary}')`;
}

/** The same aggregate expressions are used on detail rows (weight 1) and rollup
 * rows (weight count). Nullable costs and currency/verification are dimensions. */
export function metricSql(sql: string, source?: string): string {
  if (!source) return sql;
  const searched = source === "usage_query_rollups" ? sql : sql.replace("(a.search_key IN (SELECT search_key FROM search_documents WHERE search_documents MATCH ?) OR a.session_id IN (SELECT session_id FROM session_search WHERE session_search MATCH ?))", `(a.group_key IN (SELECT group_key FROM ${source === "usage_total_rollups" ? "usage_total_rollups_search" : "usage_rollups_search"} WHERE ${source === "usage_total_rollups" ? "usage_total_rollups_search" : "usage_rollups_search"} MATCH ?) AND ? IS NOT NULL)`);
  return searched.replaceAll("FROM usage_activity a", `FROM ${source} a`)
    .replaceAll("AVG(COALESCE(a.duration_ms,0))", "SUM(COALESCE(a.duration_ms,0))/SUM(a.metric_count)")
    .replaceAll("COUNT(*)", "COALESCE(SUM(a.metric_count),0)")
    .replaceAll("THEN 1 ELSE 0 END", "THEN a.metric_count ELSE 0 END")
    .replace(/SUM\((kind='llm_request'[^\n]+?)\),0\) AS (known|unknown|unverified)/g, "SUM(($1)*a.metric_count),0) AS $2");
}

/** A title can select arbitrary Sessions, so global rollups cannot answer it.
 * Scan matching detail once, then reuse compact SQL groups for every summary.
 * TEMP storage stays in SQLite; no matching-row array crosses into JS. */
export function searchMetricsSource(db: DatabaseSync, where: string, args: (string | number)[]): string {
  const key = JSON.stringify([where, args]);
  const changes = Number((prepare(db, "SELECT total_changes() AS n").get() as { n: number }).n);
  const cached = searchCache.get(db);
  if (cached?.key === key && cached.changes === changes) return "usage_query_rollups";
  db.exec("DROP TABLE IF EXISTS temp.usage_query_rollups");
  // Force the two indexed candidate sets before aggregation. SQLite otherwise
  // may choose a full activity scan for the OR across dimension/title matches.
  const candidates = where.replace("(a.search_key IN (SELECT search_key FROM search_documents WHERE search_documents MATCH ?) OR a.session_id IN (SELECT session_id FROM session_search WHERE session_search MATCH ?))", "(a.rowid IN (SELECT rowid FROM usage_activity INDEXED BY usage_activity_search_idx WHERE search_key IN (SELECT search_key FROM search_documents WHERE search_documents MATCH ?) UNION SELECT rowid FROM usage_activity INDEXED BY usage_activity_session_idx WHERE session_id IN (SELECT session_id FROM session_search WHERE session_search MATCH ?)))");
  prepare(db, `CREATE TEMP TABLE usage_query_rollups AS SELECT a.session_id,a.search_key,'' AS group_key,MAX(a.started_at) AS started_at,${dimensions.map(name => `a.${name}`).join(",")},${measures.map(name => `SUM(a.${name}) AS ${name}`).join(",")},COUNT(*) AS metric_count FROM usage_activity a ${candidates} GROUP BY a.session_id,a.search_key,${dimensions.map(name => `a.${name}`).join(",")},a.cost_amount IS NULL,a.cost_usd IS NULL`).run(...args);
  searchCache.set(db, { key, changes: Number((prepare(db, "SELECT total_changes() AS n").get() as { n: number }).n) });
  return "usage_query_rollups";
}


export function runCountsSource(since?: string): string {
  if (!since) return "usage_run_counts";
  const boundary = new Date(Math.ceil(Date.parse(since) / 3_600_000) * 3_600_000).toISOString();
  return `(SELECT session_id,agent_run_id,started_at,kind FROM usage_run_counts WHERE started_at >= '${boundary}' UNION ALL SELECT session_id,agent_run_id,started_at,kind FROM usage_activity WHERE started_at >= '${since}' AND started_at < '${boundary}' AND ${countableRunSql("usage_activity")})`;
}
