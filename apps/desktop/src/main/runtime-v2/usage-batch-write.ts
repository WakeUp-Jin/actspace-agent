import type { DatabaseSync } from "node:sqlite";
import { prepare, type ProjectionDatabase } from "./usage-sql";
import { countableRunSql } from "./usage-rollups";

const enabled = new WeakSet<ProjectionDatabase>();
export function enableUsageBatchWrites(db: DatabaseSync): void { enabled.add(db); }
const dimensions = ["kind", "status", "model", "provider_id", "connection_id", "tool_name", "cost_currency", "historical_unverified", "input_tokens_unknown", "output_tokens_unknown", "cache_read_tokens_unknown", "cache_write_tokens_unknown", "reasoning_tokens_unknown", "total_tokens_unknown"];
const measures = ["input_tokens", "output_tokens", "cache_read_tokens", "cache_write_tokens", "reasoning_tokens", "total_tokens", "duration_ms", "cost_usd", "cost_amount"];
/** The caller owns the transaction. Bulk inserts update the same derived tables
 * once per group instead of executing nine activity triggers per inserted row.
 * Deletes continue through the normal triggers, including replacement/retries. */
export function writeUsageBatch(db: ProjectionDatabase, insert: () => void): void {
  if (!enabled.has(db)) { insert(); return; }
  const before = Number((prepare(db,"SELECT COALESCE(MAX(rowid),0) AS n FROM usage_activity").get() as { n: number }).n);
  prepare(db,"UPDATE usage_write_mode SET batching=1").run();
  try {
    insert();
    // GROUP BY search_key otherwise prefers the covering search index and scans
    // all history for each batch. Force the bounded rowid range.
    const range = "FROM usage_activity a NOT INDEXED WHERE a.rowid>?";
    prepare(db,`INSERT INTO usage_search_dimensions SELECT search_key,COALESCE(model,'')||' '||COALESCE(provider_id,'')||' '||COALESCE(connection_id,'')||' '||COALESCE(tool_name,''),COUNT(*) ${range} GROUP BY search_key ON CONFLICT(search_key) DO UPDATE SET ref_count=ref_count+excluded.ref_count`).run(before);
    for (const [table,bucket] of [["usage_run_counts","substr(a.started_at,1,13)||':00:00.000Z'"],["usage_run_days","substr(a.started_at,1,10)||'T00:00:00.000Z'"],["usage_run_totals","''"]]) {
      prepare(db,`INSERT INTO ${table} SELECT session_id,agent_run_id,${bucket} AS bucket,kind,COUNT(*) ${range} AND ${countableRunSql("a")} GROUP BY session_id,agent_run_id,bucket,kind ON CONFLICT DO UPDATE SET metric_count=metric_count+excluded.metric_count`).run(before);
    }
    for (const [table,bucket] of [["usage_rollups","substr(a.started_at,1,13)||':00:00.000Z'"],["usage_daily_rollups","substr(a.started_at,1,10)||'T00:00:00.000Z'"],["usage_total_rollups","''"]]) {
      const key=`json_array(${bucket},${dimensions.map(name=>`a.${name}`).join(',')},a.cost_amount IS NULL,a.cost_usd IS NULL)`;
      prepare(db,`INSERT INTO ${table} SELECT ${key} AS key,${bucket},${dimensions.map(name=>`a.${name}`).join(',')},${measures.map(name=>`SUM(a.${name})`).join(',')},COUNT(*) ${range} GROUP BY key ON CONFLICT(group_key) DO UPDATE SET metric_count=metric_count+excluded.metric_count,${measures.map(name=>`${name}=CASE WHEN ${name} IS NULL AND excluded.${name} IS NULL THEN NULL ELSE COALESCE(${name},0)+COALESCE(excluded.${name},0) END`).join(',')}`).run(before);
    }
  } finally { prepare(db,"UPDATE usage_write_mode SET batching=0").run(); }
}
