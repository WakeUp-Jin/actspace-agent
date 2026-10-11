import type { DatabaseSync, StatementSync } from "node:sqlite";

const statements = new WeakMap<DatabaseSync, Map<string, StatementSync>>();
/** Reuse prepared statements within one connection, never query results. The
 * bounded LRU also covers generated time-window SQL without retaining it forever. */
export function prepare(db: DatabaseSync, sql: string): StatementSync {
  let cache = statements.get(db);
  if (!cache) { cache = new Map(); statements.set(db, cache); }
  let statement = cache.get(sql);
  if (statement) cache.delete(sql);
  else statement = db.prepare(sql);
  if (cache.size >= 128) cache.delete(cache.keys().next().value!);
  cache.set(sql, statement);
  return statement;
}
